import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';

import { Checkbox } from '@/components/Checkbox';
import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { FORM_LABELS } from '@/features/medications/format';
import { MedicationForm } from '@/features/medications/MedicationForm';
import { useMedicationActions } from '@/features/medications/useMedications';
import {
  extractFromImages,
  giveScanConsent,
  hasScanConsent,
  prepareImage,
  type PickedImage,
} from '@/features/scan/api';
import { mapExtraction, type MappedMedication } from '@/features/scan/mapExtraction';
import type { Extraction } from '@/features/scan/types';
import { AppError } from '@/lib/errors';
import { reportError } from '@/lib/monitoring';
import { requireSupabase } from '@/lib/supabase';
import { colors, fontSize, spacing } from '@/theme';

type Step =
  | { readonly kind: 'consent' }
  | { readonly kind: 'pick' }
  | { readonly kind: 'reading' }
  | {
      readonly kind: 'review';
      readonly extraction: Extraction;
      readonly items: readonly MappedMedication[];
      readonly done: ReadonlySet<number>;
      readonly editing: number | null;
    };

const LEGIBILITY = {
  clear: null,
  partial: 'Lecture partielle : vérifiez attentivement.',
  unsure: 'Lecture incertaine : vérifiez chaque mot.',
} as const;

export default function ScanScreen() {
  const { create } = useMedicationActions();
  const [step, setStep] = useState<Step | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hasScanConsent().then((ok) => setStep({ kind: ok ? 'pick' : 'consent' }));
  }, []);

  const read = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          throw new AppError(
            'permission',
            'L’accès à l’appareil photo est refusé. Autorisez-le dans les réglages, ou choisissez une photo existante.',
          );
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;

      setStep({ kind: 'reading' });
      const picked: PickedImage = { uri: asset.uri, width: asset.width, height: asset.height };
      const extraction = await extractFromImages(requireSupabase(), [await prepareImage(picked)]);
      const items = extraction.medications.map((m) => mapExtraction(m));
      setStep({ kind: 'review', extraction, items, done: new Set(), editing: null });
    } catch (e) {
      const appError = reportError(e, 'scan.read', {
        expected: e instanceof AppError && e.kind !== 'unknown',
      });
      setError(appError.userMessage);
      setStep({ kind: 'pick' });
    }
  };

  if (!step) {
    return (
      <Screen>
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Chargement" />
      </Screen>
    );
  }

  if (step.kind === 'consent') {
    return (
      <Screen>
        <Text style={styles.title}>Lecture automatique</Text>
        <Text style={styles.body}>
          Prenez en photo votre ordonnance ou la boîte du médicament : Le Cercle pré-remplit le
          formulaire, et vous vérifiez chaque information avant d’enregistrer.
        </Text>
        <View style={styles.card}>
          <Text style={styles.body}>
            • La photo est envoyée de façon sécurisée à notre prestataire d’intelligence
            artificielle (Anthropic) pour être lue, puis oubliée : Le Cercle ne la conserve pas.
          </Text>
          <Text style={styles.body}>
            • L’IA recopie ce qui est écrit. Elle ne donne aucun conseil et peut se tromper : vous
            restez seul(e) juge de ce qui est enregistré.
          </Text>
          <Text style={styles.body}>
            • Vous pouvez toujours saisir vos médicaments à la main à la place.
          </Text>
        </View>
        <Checkbox
          checked={agreed}
          onChange={setAgreed}
          label="J’accepte que la photo de mon document soit lue par ce service."
        />
        <PrimaryButton
          label="Continuer"
          disabled={!agreed}
          onPress={() =>
            void giveScanConsent()
              .catch((e: unknown) => reportError(e, 'scan.consent', { expected: true }))
              .then(() => setStep({ kind: 'pick' }))
          }
        />
        <PrimaryButton
          label="Saisir à la main"
          variant="secondary"
          onPress={() => router.replace('/medications/new')}
        />
      </Screen>
    );
  }

  if (step.kind === 'pick' || step.kind === 'reading') {
    const reading = step.kind === 'reading';
    return (
      <Screen>
        <Text style={styles.body}>
          Posez le document à plat, bien éclairé, et cadrez toute la partie qui liste les
          médicaments.
        </Text>
        {reading ? (
          <View style={styles.card} accessibilityLiveRegion="polite">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.body}>Lecture en cours… (environ 15 à 30 secondes)</Text>
          </View>
        ) : (
          <>
            <PrimaryButton label="📷 Prendre une photo" onPress={() => void read('camera')} />
            <PrimaryButton
              label="Choisir une photo existante"
              variant="secondary"
              onPress={() => void read('library')}
            />
          </>
        )}
        {error ? (
          <>
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
            {error.includes('réglages') && (
              <PrimaryButton
                label="Ouvrir les réglages"
                variant="secondary"
                onPress={() => void Linking.openSettings()}
              />
            )}
          </>
        ) : null}
        <PrimaryButton
          label="Saisir à la main"
          variant="secondary"
          onPress={() => router.replace('/medications/new')}
        />
      </Screen>
    );
  }

  // Review: one medication at a time, in the regular form, nothing saved without a tap.
  const { extraction, items, done, editing } = step;
  const current = editing !== null ? items[editing] : undefined;
  if (current && editing !== null) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Vérifier' }} />
        <View style={styles.warning}>
          <Text style={styles.cardTitle}>Vérifiez chaque champ avec votre document</Text>
          {current.proposals.map((p) => (
            <Text key={p} style={styles.body}>
              • {p}
            </Text>
          ))}
          {current.missing.includes('doseLabel') && (
            <Text style={styles.body}>• La quantité par prise n’a pas été lue : complétez-la.</Text>
          )}
          {current.missing.includes('schedules') && (
            <Text style={styles.body}>
              • Aucun horaire n’a été lu : indiquez ceux prescrits par votre médecin.
            </Text>
          )}
        </View>
        <MedicationForm
          // No schedule read = an empty list: the user must add the prescribed ones
          // (saving is refused until there is at least one).
          initial={current.input}
          submitLabel="J’ai vérifié, enregistrer"
          onSubmit={async (input) => {
            try {
              await create(input);
            } catch (e) {
              throw reportError(e, 'scan.save', {
                expected: e instanceof AppError && e.kind === 'validation',
              });
            }
            setStep({ ...step, done: new Set([...done, editing]), editing: null });
          }}
        />
        <PrimaryButton
          label="Annuler"
          variant="secondary"
          onPress={() => setStep({ ...step, editing: null })}
        />
      </Screen>
    );
  }

  const remaining = items.length - done.size;
  return (
    <Screen>
      {items.length === 0 ? (
        <>
          <Text style={styles.title}>Aucun médicament lu</Text>
          <Text style={styles.body}>
            {extraction.documentType === 'other'
              ? 'Ce document ne ressemble pas à une ordonnance ou une boîte de médicament.'
              : 'La photo n’a pas pu être lue. Essayez avec plus de lumière, ou saisissez à la main.'}
          </Text>
        </>
      ) : (
        <Text style={styles.body}>
          {items.length} médicament{items.length > 1 ? 's' : ''} lu{items.length > 1 ? 's' : ''}.
          Ouvrez chacun pour le vérifier : rien n’est enregistré sans votre accord.
        </Text>
      )}
      {extraction.warnings.map((w) => (
        <Text key={w} style={styles.warningText}>
          ⚠️ {w}
        </Text>
      ))}
      {items.map((item, index) => {
        const med = extraction.medications[index];
        const legibility = med ? LEGIBILITY[med.legibility] : null;
        const saved = done.has(index);
        return (
          <View key={`${item.input.name}-${index}`} style={styles.card}>
            <Text style={styles.cardTitle}>{item.input.name}</Text>
            <Text style={styles.body}>
              {item.input.doseLabel || 'Quantité non lue'} · {FORM_LABELS[item.input.form]}
            </Text>
            {med?.posologyText ? <Text style={styles.muted}>« {med.posologyText} »</Text> : null}
            {legibility ? <Text style={styles.warningText}>{legibility}</Text> : null}
            {saved ? (
              <Text style={styles.saved}>✓ Enregistré</Text>
            ) : (
              <PrimaryButton
                label="Vérifier et ajouter"
                onPress={() => setStep({ ...step, editing: index })}
              />
            )}
          </View>
        );
      })}
      <PrimaryButton
        label={remaining === 0 && items.length > 0 ? 'Terminer' : 'Scanner un autre document'}
        variant="secondary"
        onPress={() =>
          remaining === 0 && items.length > 0 ? router.back() : setStep({ kind: 'pick' })
        }
      />
      <MedicalDisclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
  muted: { fontSize: 16, color: colors.textMuted, fontStyle: 'italic' },
  card: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, gap: spacing.sm },
  cardTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  warning: {
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#B45309',
    gap: spacing.xs,
  },
  warningText: { fontSize: 16, color: '#92400E', fontWeight: '600' },
  saved: { fontSize: fontSize.body, color: '#15803D', fontWeight: '700' },
  error: { fontSize: fontSize.body, color: colors.danger },
});
