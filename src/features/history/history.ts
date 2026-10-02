import type { Medication } from '@/features/medications/types';
import type { DoseEvent } from '@/features/reminders/doseEvents';
import { occurrenceKey, upcomingOccurrences } from '@/features/reminders/planner';

/**
 * Intake history and counts. Purely factual: what was planned and what the person
 * answered. No score, no judgement, no medical interpretation.
 */

export type HistoryStatus = 'taken' | 'skipped' | 'unconfirmed';

export type HistoryItem = {
  readonly key: string;
  readonly at: Date;
  readonly timeOfDay: string;
  readonly medicationName: string;
  readonly doseLabel: string;
  readonly status: HistoryStatus;
  readonly respondedAt: string | null;
};

export type HistoryDay = {
  /** Local date "YYYY-MM-DD". */
  readonly date: string;
  readonly items: readonly HistoryItem[];
};

export type HistoryCounts = {
  readonly planned: number;
  readonly taken: number;
  readonly skipped: number;
  readonly unconfirmed: number;
};

/** An unanswered intake stays in "Aujourd'hui" for an hour before entering the history. */
const STILL_DUE_MS = 60 * 60_000;

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function buildHistory(input: {
  readonly medications: readonly Medication[];
  readonly labels: ReadonlyMap<string, { name: string; doseLabel: string }>;
  readonly events: readonly DoseEvent[];
  readonly from: Date;
  readonly now: Date;
}): HistoryDay[] {
  const until = new Date(input.now.getTime() - STILL_DUE_MS);
  const events = new Map(input.events.map((e) => [occurrenceKey(e.scheduleId, e.scheduledAt), e]));
  const createdAt = new Map(
    input.medications.flatMap((m) =>
      m.schedules.map((s) => [s.id, s.createdAt ? Date.parse(s.createdAt) : 0] as const),
    ),
  );
  const items = new Map<string, HistoryItem>();

  const statusOf = (event: DoseEvent | undefined): HistoryStatus =>
    event?.status === 'taken' ? 'taken' : event?.status === 'skipped' ? 'skipped' : 'unconfirmed';

  for (const o of upcomingOccurrences(
    input.medications,
    new Date(input.from.getTime() - 1),
    until,
  )) {
    // No intake was expected before the schedule existed.
    if (o.at.getTime() < (createdAt.get(o.scheduleId) ?? 0)) continue;
    const key = occurrenceKey(o.scheduleId, o.at);
    const event = events.get(key);
    items.set(key, {
      key,
      at: o.at,
      timeOfDay: o.timeOfDay,
      medicationName: o.medicationName,
      doseLabel: o.doseLabel,
      status: statusOf(event),
      respondedAt: event?.respondedAt ?? null,
    });
  }

  // Answers for schedules or medications deleted since: still part of the history.
  for (const event of input.events) {
    const key = occurrenceKey(event.scheduleId, event.scheduledAt);
    const at = new Date(event.scheduledAt);
    if (items.has(key) || at < input.from || at > until) continue;
    if (event.status !== 'taken' && event.status !== 'skipped') continue;
    const label = input.labels.get(event.medicationId);
    items.set(key, {
      key,
      at,
      timeOfDay: localTime(at),
      medicationName: label?.name ?? 'Médicament supprimé',
      doseLabel: label?.doseLabel ?? '',
      status: statusOf(event),
      respondedAt: event.respondedAt,
    });
  }

  const byDay = new Map<string, HistoryItem[]>();
  for (const item of [...items.values()].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const day = localDate(item.at);
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayItems]) => ({ date, items: dayItems }));
}

export function countHistory(days: readonly HistoryDay[], since?: Date): HistoryCounts {
  const items = days.flatMap((d) => d.items).filter((i) => !since || i.at >= since);
  return {
    planned: items.length,
    taken: items.filter((i) => i.status === 'taken').length,
    skipped: items.filter((i) => i.status === 'skipped').length,
    unconfirmed: items.filter((i) => i.status === 'unconfirmed').length,
  };
}
