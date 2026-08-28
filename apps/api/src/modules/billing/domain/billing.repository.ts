import type { Subscription, SubscriptionPlan } from "@openppm/db";

export const BILLING_REPOSITORY = Symbol("BILLING_REPOSITORY");

export interface BillingRepository {
  /** Abonnement de l'organisation, ou null s'il n'existe pas encore. */
  findSubscription(organizationId: string): Promise<Subscription | null>;
  /**
   * Garantit un abonnement pour l'org : le crée (STANDARD, ACTIVE) s'il manque,
   * avec la quantité de sièges fournie. Idempotent.
   */
  ensureSubscription(organizationId: string, quantity: number): Promise<Subscription>;
  /** Plan commercial par clé (donnée plateforme). */
  findPlan(key: string): Promise<SubscriptionPlan | null>;
  /** Nombre de membres actifs de l'organisation (base des sièges facturables). */
  countActiveMembers(organizationId: string): Promise<number>;
}
