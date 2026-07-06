import {
  computeLockedUntil,
  lockDurationMinutes,
  LOCKOUT_MAX_MINUTES,
} from "./lockout.policy";

describe("lockout.policy", () => {
  it("ne verrouille pas sous le seuil de 5 échecs", () => {
    expect(lockDurationMinutes(0)).toBe(0);
    expect(lockDurationMinutes(4)).toBe(0);
  });

  it("verrouille progressivement : 5→1min, 6→2, 7→4, 8→8, 9→16, 10→32", () => {
    expect(lockDurationMinutes(5)).toBe(1);
    expect(lockDurationMinutes(6)).toBe(2);
    expect(lockDurationMinutes(7)).toBe(4);
    expect(lockDurationMinutes(8)).toBe(8);
    expect(lockDurationMinutes(9)).toBe(16);
    expect(lockDurationMinutes(10)).toBe(32);
  });

  it("plafonne à 60 minutes", () => {
    expect(lockDurationMinutes(11)).toBe(LOCKOUT_MAX_MINUTES);
    expect(lockDurationMinutes(50)).toBe(LOCKOUT_MAX_MINUTES);
  });

  it("computeLockedUntil retourne null sous le seuil, une date après", () => {
    const now = new Date("2026-07-06T12:00:00Z");
    expect(computeLockedUntil(4, now)).toBeNull();
    expect(computeLockedUntil(5, now)).toEqual(new Date("2026-07-06T12:01:00Z"));
    expect(computeLockedUntil(7, now)).toEqual(new Date("2026-07-06T12:04:00Z"));
  });
});
