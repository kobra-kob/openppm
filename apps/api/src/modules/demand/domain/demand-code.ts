/**
 * Numéro unique de demande : `DEMD` suivi d'une séquence sur 5 chiffres
 * (DEMD00001 → DEMD99999). Même motif que les projets (PROJ00001) : attribué
 * automatiquement à la création et jamais modifiable par l'utilisateur.
 */
export const DEMAND_CODE_PREFIX = "DEMD";
export const DEMAND_CODE_DIGITS = 5;

/** Format canonique d'un numéro de demande à partir de sa séquence. */
export function formatDemandCode(sequence: number): string {
  return `${DEMAND_CODE_PREFIX}${String(sequence).padStart(DEMAND_CODE_DIGITS, "0")}`;
}

/** Vrai si la référence respecte exactement le format DEMDxxxxx. */
export function isDemandCode(reference: string): boolean {
  return new RegExp(`^${DEMAND_CODE_PREFIX}\\d{${DEMAND_CODE_DIGITS}}$`).test(reference);
}
