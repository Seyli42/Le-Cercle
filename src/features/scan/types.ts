import type { MedicationForm } from '@/features/medications/types';

/** What the extract-prescription function returns (already cleaned on the server). */
export type ExtractedMedication = {
  readonly name: string;
  readonly form: MedicationForm;
  readonly doseLabel: string;
  readonly posologyText: string;
  readonly timesWritten: readonly string[];
  readonly durationText: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly notes: string;
  readonly legibility: 'clear' | 'partial' | 'unsure';
};

export type Extraction = {
  readonly documentType: 'prescription' | 'medication_box' | 'other' | 'unreadable';
  readonly medications: readonly ExtractedMedication[];
  readonly warnings: readonly string[];
};
