/**
 * Numéro unique de projet : `PROJ` suivi d'une séquence sur 5 chiffres
 * (PROJ00001 → PROJ99999). Attribué automatiquement à la création et
 * jamais modifiable par l'utilisateur.
 */
export const PROJECT_CODE_PREFIX = "PROJ";
export const PROJECT_CODE_DIGITS = 5;

/** Format canonique d'un numéro de projet à partir de sa séquence. */
export function formatProjectCode(sequence: number): string {
  return `${PROJECT_CODE_PREFIX}${String(sequence).padStart(PROJECT_CODE_DIGITS, "0")}`;
}

/** Vrai si le code respecte exactement le format PROJxxxxx. */
export function isProjectCode(code: string): boolean {
  return new RegExp(`^${PROJECT_CODE_PREFIX}\\d{${PROJECT_CODE_DIGITS}}$`).test(code);
}
