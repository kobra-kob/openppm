import type { Subscription, SubscriptionPlan, SubscriptionStatus } from "@openppm/db";

export const BILLING_REPOSITORY = Symbol("BILLING_REPOSITORY");

/** Mise à jour d'un abonnement depuis un événement Stripe (webhook). */
export interface SubscriptionSync {
  status?: SubscriptionStatus;
  quantity?: number;
  stripeSubscriptionId?: string;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
}

export interface InvoiceRecord {
  stripeInvoiceId: string;
  number: string | null;
  amountDue: number;
  currency: string;
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
}

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
  /** Met à jour la quantité de sièges de l'abonnement (no-op si absent). */
  setQuantity(organizationId: string, quantity: number): Promise<void>;
  /** Enregistre l'identifiant client Stripe sur l'abonnement de l'org. */
  setStripeCustomerId(organizationId: string, customerId: string): Promise<void>;
  /** Active l'abonnement (mode mock : simule un paiement réussi). */
  activate(organizationId: string, quantity: number): Promise<Subscription>;
  /** Nom de l'org + email du propriétaire (client Stripe). */
  getBillingIdentity(
    organizationId: string,
  ): Promise<{ name: string; email: string } | null>;
  /** Abonnement rattaché à un client Stripe (routage des webhooks). */
  findByStripeCustomerId(customerId: string): Promise<Subscription | null>;
  /** Applique une mise à jour d'abonnement issue d'un webhook Stripe. */
  syncSubscription(organizationId: string, data: SubscriptionSync): Promise<void>;
  /** Enregistre/actualise une facture (miroir Stripe). */
  upsertInvoice(organizationId: string, invoice: InvoiceRecord): Promise<void>;
}
