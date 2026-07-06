/**
 * Verrouillage progressif du compte après échecs de connexion :
 * à partir de 5 échecs, verrou de 2^(n-5) minutes, plafonné à 60.
 * (5 → 1 min, 6 → 2 min, 7 → 4 min, … 11+ → 60 min)
 */
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_MAX_MINUTES = 60;

export function lockDurationMinutes(failedLoginCount: number): number {
  if (failedLoginCount < LOCKOUT_THRESHOLD) {
    return 0;
  }
  return Math.min(2 ** (failedLoginCount - LOCKOUT_THRESHOLD), LOCKOUT_MAX_MINUTES);
}

export function computeLockedUntil(
  failedLoginCount: number,
  now: Date = new Date(),
): Date | null {
  const minutes = lockDurationMinutes(failedLoginCount);
  if (minutes === 0) {
    return null;
  }
  return new Date(now.getTime() + minutes * 60_000);
}
