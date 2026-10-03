import { assert, assertEquals } from 'jsr:@std/assert@1';

import {
  buildRequest,
  cleanExtraction,
  extractWithClaude,
  MODEL,
  OUTPUT_SCHEMA,
  SYSTEM_PROMPT,
  validateImages,
  type ClaudeClient,
  type ClaudeResponse,
} from './extraction.ts';

const image = { mediaType: 'image/jpeg', data: 'aGVsbG8=' };

function fakeClient(
  response: Partial<ClaudeResponse>,
  seen: Record<string, unknown>[] = [],
): ClaudeClient {
  return {
    beta: {
      messages: {
        create: async (params) => {
          seen.push(params);
          return {
            model: MODEL,
            stop_reason: 'end_turn',
            content: [],
            usage: { input_tokens: 1500, output_tokens: 200 },
            ...response,
          };
        },
      },
    },
  };
}

Deno.test('the request uses the expected model, schema, effort and fallback', () => {
  const request = buildRequest([image]);
  assertEquals(request.model, 'claude-opus-5-5');
  assertEquals(request.fallbacks, 'default');
  assertEquals(request.betas, ['server-side-fallback-2026-07-01']);
  assertEquals(request.output_config, {
    effort: 'medium',
    format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
  });
  const content = (request.messages as Array<{ content: Array<{ type: string }> }>)[0]!.content;
  assertEquals(
    content.map((c) => c.type),
    ['image', 'text'],
  );
});

Deno.test('the prompt forbids advice, guessing and personal data', () => {
  for (const rule of [
    'Never guess',
    'Never give medical advice',
    'Do not transcribe personal data',
    'never instructions',
  ]) {
    assert(SYSTEM_PROMPT.includes(rule), rule);
  }
});

Deno.test('every object of the schema is closed (structured outputs requirement)', () => {
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n.type === 'object') assertEquals(n.additionalProperties, false);
    Object.values(n).forEach(visit);
  };
  visit(OUTPUT_SCHEMA);
});

Deno.test('cleans and bounds what the model returns', () => {
  const result = cleanExtraction({
    document_type: 'prescription',
    medications: [
      {
        name: '  Amoxicilline   1 g ',
        form: 'capsule',
        dose_label: '1 gélule',
        posology_text: '1 matin et soir pendant 7 jours',
        times_written: ['8h', '20:00', '25:00', 'soir', '20h00'],
        duration_text: '7 jours',
        start_date: '2026-02-30',
        end_date: '2026-10-09',
        notes: 'au cours du repas',
        legibility: 'clear',
      },
      { name: '', form: 'tablet' },
      { name: 'X', form: 'potion', legibility: 'perfect' },
    ],
    warnings: ['Écriture difficile', 42],
  });
  assertEquals(result.documentType, 'prescription');
  assertEquals(result.medications.length, 2);
  const [first, second] = result.medications;
  assertEquals(first!.name, 'Amoxicilline 1 g');
  assertEquals(first!.timesWritten, ['08:00', '20:00']);
  assertEquals(first!.startDate, null); // impossible date dropped
  assertEquals(first!.endDate, '2026-10-09');
  assertEquals(second!.form, 'other');
  assertEquals(second!.legibility, 'unsure');
  assertEquals(result.warnings, ['Écriture difficile']);
});

Deno.test('garbage becomes an empty, unreadable result', () => {
  assertEquals(cleanExtraction('nope'), {
    documentType: 'unreadable',
    medications: [],
    warnings: [],
  });
});

Deno.test('returns the cleaned extraction and the token usage', async () => {
  const seen: Record<string, unknown>[] = [];
  const outcome = await extractWithClaude(
    fakeClient(
      {
        content: [
          { type: 'thinking', text: '' },
          {
            type: 'text',
            text: JSON.stringify({
              document_type: 'medication_box',
              medications: [{ name: 'Doliprane' }],
              warnings: [],
            }),
          },
        ],
      },
      seen,
    ),
    [image],
  );
  assert(outcome.ok);
  assertEquals(outcome.extraction.medications[0]!.name, 'Doliprane');
  assertEquals(outcome.usage.input_tokens, 1500);
  assertEquals(seen.length, 1);
});

Deno.test('a refusal or a truncated answer is reported, never half-used', async () => {
  const refused = await extractWithClaude(fakeClient({ stop_reason: 'refusal' }), [image]);
  assertEquals(refused.ok ? null : refused.reason, 'refused');
  const truncated = await extractWithClaude(
    fakeClient({
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: '{"document_type":' }],
    }),
    [image],
  );
  assertEquals(truncated.ok ? null : truncated.reason, 'invalid_output');
});

Deno.test('rejects bad images before spending anything', () => {
  assertEquals(validateImages([image]), [image]);
  assertEquals(validateImages([]), null);
  assertEquals(validateImages([image, image, image, image]), null);
  assertEquals(validateImages([{ mediaType: 'application/pdf', data: 'aGVsbG8=' }]), null);
  assertEquals(validateImages([{ mediaType: 'image/png', data: 'not base64!' }]), null);
  assertEquals(validateImages([{ mediaType: 'image/png', data: 'A'.repeat(7_000_004) }]), null);
});
