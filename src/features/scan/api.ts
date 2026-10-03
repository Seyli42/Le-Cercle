import { FunctionsHttpError } from '@supabase/supabase-js';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as SecureStore from 'expo-secure-store';

import type { Extraction } from '@/features/scan/types';
import { AppError, DEFAULT_MESSAGES, toAppError } from '@/lib/errors';
import type { AppSupabaseClient } from '@/lib/supabase';

/** Longest side sent to the AI: enough to read a prescription, ~300 KB in JPEG. */
const MAX_SIDE = 1568;
const CONSENT_KEY = 'ai_scan_consent_v1';

export type PickedImage = { readonly uri: string; readonly width: number; readonly height: number };

/** Shrinks and re-encodes the photo (also drops its EXIF data, e.g. GPS position). */
export async function prepareImage(
  image: PickedImage,
): Promise<{ mediaType: string; data: string }> {
  const context = ImageManipulator.manipulate(image.uri);
  if (Math.max(image.width, image.height) > MAX_SIDE) {
    context.resize(
      image.width >= image.height
        ? { width: MAX_SIDE, height: null }
        : { width: null, height: MAX_SIDE },
    );
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
  if (!saved.base64) throw new AppError('ai', DEFAULT_MESSAGES.ai);
  return { mediaType: 'image/jpeg', data: saved.base64 };
}

const MESSAGES: Readonly<Record<string, string>> = {
  daily_limit_reached:
    'Vous avez atteint le nombre de lectures automatiques pour aujourd’hui. Vous pouvez saisir le médicament à la main.',
  invalid_images: 'Cette photo n’a pas pu être envoyée. Réessayez avec une autre photo.',
  ai_refused: DEFAULT_MESSAGES.ai,
  ai_unreadable_answer: DEFAULT_MESSAGES.ai,
  ai_busy: 'La lecture automatique est très demandée en ce moment. Réessayez dans une minute.',
  ai_unreachable: DEFAULT_MESSAGES.network,
};

export async function extractFromImages(
  client: AppSupabaseClient,
  images: readonly { mediaType: string; data: string }[],
): Promise<Extraction> {
  const { data, error } = await client.functions.invoke<Extraction>('extract-prescription', {
    body: { images },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body: unknown = await error.context.json().catch(() => null);
      const code = body && typeof body === 'object' && 'error' in body ? String(body.error) : '';
      const message = MESSAGES[code];
      if (message) throw new AppError(code === 'ai_unreachable' ? 'network' : 'ai', message, error);
      throw new AppError('ai', DEFAULT_MESSAGES.ai, error);
    }
    throw toAppError(error);
  }
  if (!data || !Array.isArray(data.medications)) throw new AppError('ai', DEFAULT_MESSAGES.ai);
  return data;
}

export async function hasScanConsent(): Promise<boolean> {
  return (await SecureStore.getItemAsync(CONSENT_KEY).catch(() => null)) === 'yes';
}

export async function giveScanConsent(): Promise<void> {
  await SecureStore.setItemAsync(CONSENT_KEY, 'yes');
}
