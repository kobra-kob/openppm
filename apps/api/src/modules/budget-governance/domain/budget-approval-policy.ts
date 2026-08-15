import type { RoleKey } from "@openppm/db";

/**
 * Palier de validation budgétaire : tout montant appartenant à
 * `[minAmount, maxAmount[` impose la chaîne d'approbateurs `approverRoles`.
 */
export interface BudgetApprovalTierSpec {
  minAmount: number;
  /** null = pas de plafond. */
  maxAmount: number | null;
  approverRoles: RoleKey[];
}

/**
 * Chaîne d'approbation par défaut appliquée lorsqu'une organisation n'a défini
 * aucun palier personnalisé :
 *   - < 10 000        → Manager
 *   - 10 000–100 000  → Finance
 *   - ≥ 100 000       → Finance puis Direction
 */
export const DEFAULT_BUDGET_APPROVAL_TIERS: BudgetApprovalTierSpec[] = [
  { minAmount: 0, maxAmount: 10000, approverRoles: ["manager"] },
  { minAmount: 10000, maxAmount: 100000, approverRoles: ["finance"] },
  { minAmount: 100000, maxAmount: null, approverRoles: ["finance", "executive"] },
];

/**
 * Résout la chaîne d'approbateurs (ordonnée) pour un montant donné.
 *
 * @param amount Montant demandé (≥ 0).
 * @param tiers  Paliers de l'organisation ; si vide, {@link DEFAULT_BUDGET_APPROVAL_TIERS}.
 * @returns Rôles approbateurs dédupliqués en conservant l'ordre. Jamais vide :
 *          repli sur `["finance"]` si aucun palier ne couvre le montant.
 */
export function resolveApproverRoles(
  amount: number,
  tiers: BudgetApprovalTierSpec[] = [],
): RoleKey[] {
  const effective = tiers.length > 0 ? tiers : DEFAULT_BUDGET_APPROVAL_TIERS;
  const sorted = [...effective].sort((a, b) => a.minAmount - b.minAmount);
  const match = sorted.find(
    (t) => amount >= t.minAmount && (t.maxAmount === null || amount < t.maxAmount),
  );
  const roles = match?.approverRoles ?? ["finance"];
  // Déduplication en préservant l'ordre (une Direction ne valide qu'une fois).
  return [...new Set(roles)];
}
