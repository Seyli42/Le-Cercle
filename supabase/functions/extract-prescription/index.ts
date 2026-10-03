/**
 * POST { images: [{ mediaType, data(base64) }] } with the user's session →
 * transcription of the medications by Claude, to be CHECKED by the user in the app.
 * Photos are processed in memory only: never stored, never logged.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { json, requireEnv } from '../_shared/env.ts';
import { extractWithClaude, validateImages, type ClaudeClient } from '../_shared/extraction.ts';

const DAILY_LIMIT = 20;

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'not_authenticated' }, 401);

  let images: ReturnType<typeof validateImages> = null;
  try {
    images = validateImages((await request.json()).images);
  } catch {
    // Unreadable body: same answer as invalid images.
  }
  if (!images) return json({ error: 'invalid_images' }, 400);

  const asUser = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: extractionId, error: limitError } = await asUser.rpc('begin_ai_extraction', {
    p_daily_limit: DAILY_LIMIT,
  });
  if (limitError) {
    const known = limitError.message === 'daily_limit_reached';
    if (!known) console.error('begin_ai_extraction', limitError);
    return json({ error: known ? 'daily_limit_reached' : 'not_authenticated' }, known ? 429 : 401);
  }

  const admin = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
  const record = (
    status: string,
    model: string | null,
    usage: { input_tokens: number; output_tokens: number } | null,
    found: number | null,
  ) =>
    admin.rpc('finish_ai_extraction', {
      p_id: extractionId,
      p_status: status,
      p_model: model,
      p_input_tokens: usage?.input_tokens ?? null,
      p_output_tokens: usage?.output_tokens ?? null,
      p_medications_found: found,
    });

  const anthropic = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY'), maxRetries: 2 });
  // The request uses beta fields (server-side fallbacks) newer than the SDK typings:
  // the call goes through a minimal typed facade instead.
  const claude: ClaudeClient = {
    beta: {
      messages: {
        create: (params) =>
          anthropic.beta.messages.create(
            params as unknown as Parameters<typeof anthropic.beta.messages.create>[0],
          ) as unknown as ReturnType<ClaudeClient['beta']['messages']['create']>,
      },
    },
  };

  try {
    const outcome = await extractWithClaude(claude, images);
    if (!outcome.ok) {
      await record(
        outcome.reason === 'refused' ? 'refused' : 'error',
        outcome.model,
        outcome.usage,
        null,
      );
      return json(
        { error: outcome.reason === 'refused' ? 'ai_refused' : 'ai_unreadable_answer' },
        422,
      );
    }
    const { extraction } = outcome;
    const status = extraction.medications.length > 0 ? 'ok' : 'unreadable';
    await record(status, outcome.model, outcome.usage, extraction.medications.length);
    return json(extraction);
  } catch (error) {
    await record('error', null, null, null);
    if (
      error instanceof Anthropic.RateLimitError ||
      error instanceof Anthropic.InternalServerError
    ) {
      return json({ error: 'ai_busy' }, 503);
    }
    if (error instanceof Anthropic.APIConnectionError)
      return json({ error: 'ai_unreachable' }, 503);
    console.error('extract-prescription', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'ai_failed' }, 500);
  }
});
