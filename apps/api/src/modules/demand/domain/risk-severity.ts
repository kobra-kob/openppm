import { RiskLevel } from "@openppm/db";

const LEVEL_SCORE: Record<RiskLevel, number> = {
  [RiskLevel.low]: 1,
  [RiskLevel.medium]: 2,
  [RiskLevel.high]: 3,
};

/**
 * Sévérité dérivée du produit probabilité × impact (1..9) :
 * ≤2 → faible, ≤4 → moyen, sinon élevé. Partagée entre le Business Case et le
 * registre des risques (reprise à la conversion).
 */
export function computeSeverity(probability: RiskLevel, impact: RiskLevel): RiskLevel {
  const score = LEVEL_SCORE[probability] * LEVEL_SCORE[impact];
  if (score <= 2) return RiskLevel.low;
  if (score <= 4) return RiskLevel.medium;
  return RiskLevel.high;
}
