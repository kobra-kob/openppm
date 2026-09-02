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
  /** Enregistre l'identifiant client Stripe sur l'abonnement de l'org. */
  setStripeCustomerId(organizationId: string, customerId: string): Promise<void>;
  /** Active l'abonnement (mode mock : simule un paiement réussi). */
  activate(organizationId: string, quantity: number): Promise<Subscription>;
  /** Nom de l'org + email du propriétaire (client Stripe). */
  getBillingIdentity(
    organizationId: string,
  ): Promise<{ name: string; email: string } | null>;
}
