import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuditService } from "../../../core/audit/audit.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { BILLING_REPOSITORY } from "../domain/billing.repository";
import type { BillingRepository } from "../domain/billing.repository";
import { BillingSeatService } from "./billing-seat.service";
import { StripeService } from "./stripe.service";
import { SubscriptionAccessService } from "./subscription-access.service";

export interface BillingOverview {
  planKey: string;
  planName: string;
  status: string;
  /** Sièges facturables calculés côté serveur (membres actifs). */
  seats: number;
  unitAmount: number;
  currency: string;
  interval: string;
  /** Montant périodique = sièges × prix unitaire (centimes). */
  amount: number;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
}

/**
 * Vue d'ensemble de la facturation d'une organisation. Le montant et les sièges
 * sont **toujours** déterminés côté serveur. Lecture seule (S2) ; les actions
 * Stripe (checkout, portail, annulation) arrivent aux lots suivants.
 */
export interface CheckoutResult {
  url: string;
  /** true = mock : l'abonnement a été activé directement (pas de Stripe réel). */
  activated: boolean;
}

@Injectable()
export class BillingService {
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly repository: BillingRepository,
    private readonly seats: BillingSeatService,
    private readonly stripe: StripeService,
    private readonly access: SubscriptionAccessService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private appUrl(): string {
    return this.config.get<string>("APP_URL") ?? "http://localhost:3000";
  }

  /** Récupère (ou crée) le client Stripe de l'organisation. */
  private async ensureCustomer(organizationId: string): Promise<string> {
    const existing = await this.repository.findSubscription(organizationId);
    if (existing?.stripeCustomerId) {
      return existing.stripeCustomerId;
    }
    const identity = await this.repository.getBillingIdentity(organizationId);
    const customerId = await this.stripe.createCustomer({
      organizationId,
      name: identity?.name ?? "Organization",
      email: identity?.email ?? "billing@openppm.local",
    });
    await this.repository.setStripeCustomerId(organizationId, customerId);
    return customerId;
  }

  /**
   * Démarre un abonnement (Checkout). En mode mock, simule un paiement réussi et
   * active directement l'abonnement ; sinon renvoie l'URL Stripe Checkout.
   * Le `success_url` n'est jamais une preuve de paiement (§31) : en réel,
   * l'activation vient du webhook (S5).
   */
  async startCheckout(
    payload: JwtPayload,
    context: RequestContext,
    interval: "month" | "year" = "month",
  ): Promise<CheckoutResult> {
    const seats = await this.seats.countBillableSeats(payload.org);
    let subscription = await this.repository.findSubscription(payload.org);
    if (!subscription) {
      subscription = await this.repository.ensureSubscription(payload.org, seats);
    }
    const customerId = await this.ensureCustomer(payload.org);
    const successUrl = `${this.appUrl()}/settings/billing?checkout=success`;
    const cancelUrl = `${this.appUrl()}/settings/billing?checkout=cancel`;

    if (this.stripe.isMock) {
      await this.repository.activate(payload.org, seats);
      this.access.invalidate(payload.org);
      await this.audit.log({
        action: "subscription.activated",
        entityType: "subscription",
        entityId: payload.org,
        organizationId: payload.org,
        userId: payload.sub,
        after: { mock: true, seats },
        ...context,
      });
      return { url: successUrl, activated: true };
    }

    const priceId = this.stripe.priceId(subscription.planKey, interval);
    if (!priceId) {
      throw new BadRequestException({
        code: "STRIPE_PRICE_MISSING",
        message: "Aucun tarif Stripe configuré pour ce plan (STRIPE_PRICE_STANDARD_*).",
      });
    }
    const session = await this.stripe.createCheckoutSession({
      customerId,
      priceId,
      quantity: seats,
      successUrl,
      cancelUrl,
      organizationId: payload.org,
    });
    await this.audit.log({
      action: "billing.checkout_started",
      entityType: "subscription",
      entityId: payload.org,
      organizationId: payload.org,
      userId: payload.sub,
      after: { seats },
      ...context,
    });
    return { url: session.url, activated: false };
  }

  /** Ouvre le portail de gestion Stripe (moyens de paiement, factures…). */
  async openPortal(payload: JwtPayload, context: RequestContext): Promise<{ url: string }> {
    const customerId = await this.ensureCustomer(payload.org);
    const { url } = await this.stripe.createPortalSession({
      customerId,
      returnUrl: `${this.appUrl()}/settings/billing`,
    });
    await this.audit.log({
      action: "billing.portal_opened",
      entityType: "subscription",
      entityId: payload.org,
      organizationId: payload.org,
      userId: payload.sub,
      ...context,
    });
    return { url };
  }

  async getOverview(payload: JwtPayload): Promise<BillingOverview> {
    const seats = await this.seats.countBillableSeats(payload.org);
    // Garantit un abonnement (crée un défaut si l'org n'en a pas encore).
    let subscription = await this.repository.findSubscription(payload.org);
    if (!subscription) {
      subscription = await this.repository.ensureSubscription(payload.org, seats);
    }
    const plan = await this.repository.findPlan(subscription.planKey);
    const unitAmount = subscription.unitAmount;
    return {
      planKey: subscription.planKey,
      planName: plan?.name ?? subscription.planKey,
      status: subscription.status,
      seats,
      unitAmount,
      currency: subscription.currency,
      interval: subscription.interval,
      amount: seats * unitAmount,
      trialEnd: subscription.trialEnd,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      stripeCustomerId: subscription.stripeCustomerId,
    };
  }
}
