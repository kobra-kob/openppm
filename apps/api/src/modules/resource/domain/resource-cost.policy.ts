import { RateUnit } from "@openppm/db";

/**
 * Coût d'une ressource pour une durée (en jours) selon l'unité de son tarif.
 * - unité DAY  : coût = jours × montant
 * - unité HOUR : coût = jours × heures/jour × montant
 * Le calcul est réalisé côté backend et arrondi au centime.
 */
export function calculateResourceCost(
  durationDays: number,
  amount: number,
  unit: RateUnit,
  hoursPerDay: number,
): number {
  const raw = unit === RateUnit.DAY ? durationDays * amount : durationDays * hoursPerDay * amount;
  return Math.round(raw * 100) / 100;
}

export interface DatedInterval {
  taskId: string;
  startDate: Date | null;
  dueDate: Date | null;
}

/** Deux intervalles datés se chevauchent (bornes incluses). */
function overlaps(a: DatedInterval, b: DatedInterval): boolean {
  if (!a.startDate || !a.dueDate || !b.startDate || !b.dueDate) {
    return false;
  }
  return a.startDate.getTime() <= b.dueDate.getTime() && b.startDate.getTime() <= a.dueDate.getTime();
}

/**
 * Paires de tâches d'une même ressource qui se chevauchent (surcharge).
 * MVP : on signale le conflit, on ne l'empêche pas.
 */
export function detectOverlaps(intervals: DatedInterval[]): Array<[string, string]> {
  const conflicts: Array<[string, string]> = [];
  for (let i = 0; i < intervals.length; i += 1) {
    for (let j = i + 1; j < intervals.length; j += 1) {
      if (overlaps(intervals[i]!, intervals[j]!)) {
        conflicts.push([intervals[i]!.taskId, intervals[j]!.taskId]);
      }
    }
  }
  return conflicts;
}
