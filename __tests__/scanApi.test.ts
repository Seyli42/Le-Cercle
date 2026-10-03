import { FunctionsHttpError } from '@supabase/supabase-js';

import { extractFromImages } from '@/features/scan/api';
import type { AppSupabaseClient } from '@/lib/supabase';

jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('expo-secure-store', () => ({}));

const image = { mediaType: 'image/jpeg', data: 'aGVsbG8=' };
const client = (result: { data: unknown; error: unknown }) =>
  ({ functions: { invoke: async () => result } }) as unknown as AppSupabaseClient;
const httpError = (code: string, status: number) =>
  new FunctionsHttpError(new Response(JSON.stringify({ error: code }), { status }));

it('returns the transcription', async () => {
  const extraction = { documentType: 'prescription', medications: [], warnings: [] };
  await expect(extractFromImages(client({ data: extraction, error: null }), [image])).resolves.toBe(
    extraction,
  );
});

it.each([
  ['daily_limit_reached', 429, /nombre de lectures automatiques/],
  ['ai_refused', 422, /saisir les informations à la main/],
  ['ai_busy', 503, /très demandée/],
])('explains "%s" in French', async (code, status, message) => {
  await expect(
    extractFromImages(client({ data: null, error: httpError(code, status) }), [image]),
  ).rejects.toMatchObject({ kind: 'ai', userMessage: expect.stringMatching(message) });
});

it('treats an unreachable AI as a network problem', async () => {
  await expect(
    extractFromImages(client({ data: null, error: httpError('ai_unreachable', 503) }), [image]),
  ).rejects.toMatchObject({ kind: 'network' });
});

it('never accepts a malformed answer', async () => {
  await expect(
    extractFromImages(client({ data: { nope: true }, error: null }), [image]),
  ).rejects.toMatchObject({ kind: 'ai' });
});
