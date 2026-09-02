import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SubscriptionStatus } from "@openppm/db";
import type Stripe from "stripe";
import { AuditService } from "../../../core/audit/audit.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { BILLING_REPOSITORY } from "../domain/billing.repository";
import type { BillingRepository, SubscriptionSync } from "../domain/billing.repository";
import { StripeService } from "./stripe.service";
import { SubscriptionAccessService } from "./subscription-access.service";

/** Statut Stripe → statut interne. */
function mapStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case "trialing":
      return SubscriptionStatus.TRIALING;
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "past_due":
      return SubscriptionStatus.PAST_DUE;
    case "unpaid":
      return SubscriptionStatus.SUSPENDED;
    case "canceled":
    case "incomplete_expired":
      return SubscriptionStatus.CANCELED;
    default:
      return SubscriptionStatus.ACTIVE;
  }
}

const toDate = (seconds: number | null | undefined): Date | null =>
  typeof seconds === "number" ? new Date(seconds * 1000) : null;

/**
 * Traitement des webhooks Stripe (§32/§87) : vérification de signature,
 * idempotence (table BillingEvent, stripe_event_id UNIQUE), application des
 * événements sur l'abonnement/les factures, audit. Un même événement n'est
 * jamais traité deux fois.
 */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    @Inject(BILLING_REPOSITORY) private readonly repository: BillingRepository,
    private readonly access: SubscriptionAccessService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async handle(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<{ received: boolean; duplicate: boolean }> {
    const secret = this.config.get<string>("STRIPE_WEBHOOK_SECRET");
    let event: Stripe.Event;

    if (secret && !this.stripe.isMock) {
      if (!signature) {
        await this.audit.log({
          action: "security.invalid_webhook",
          entityType: "billing_event",
          entityId: "unknown",
          after: { reason: "missing_signature" },
        });
        throw new BadRequestException({ code: "INVALID_WEBHOOK", message: "Signature manquante" });
      }
      try {
        event = this.stripe.constructEvent(rawBody, signature, secret);
      } catch {
        await this.audit.log({
          action: "security.invalid_webhook",
          entityType: "billing_event",
          entityId: "unknown",
          after: { reason: "bad_signature" },
        });
        throw new BadRequestException({ code: "INVALID_WEBHOOK", message: "Signature invalide" });
      }
    } else {
      // Dev / mock : pas de secret configuré → pas de vérification cryptographique.
      event = JSON.parse(rawBody.toString("utf8")) as Stripe.Event;
    }

    // Idempotence : un event déjà reçu n'est jamais retraité.
    const already = await this.prisma.billingEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (already) {
      return { received: true, duplicate: true };
    }
    await this.prisma.billingEvent.create({
      data: {
        stripeEventId: event.id,
        type: event.type,
        payload: event as unknown as object,
      },
    });

    let result = "ignored";
    try {
      result = await this.process(event);
    } catch (error) {
      result = `error: ${(error as Error).message}`;
      this.logger.error(`Webhook ${event.type} ${event.id} échoué : ${result}`);
    }
    await this.prisma.billingEvent.update({
      where: { stripeEventId: event.id },
      data: { processedAt: new Date(), result },
    });
    return { received: true, duplicate: false };
  }

  private async process(event: Stripe.Event): Promise<string> {
    const object = event.data.object as unknown as Record<string, unknown>;
    const customerId =
      typeof object.customer === "string" ? object.customer : undefined;
    if (!customerId) {
      return "ignored: no customer";
    }
    const subscription = await this.repository.findByStripeCustomerId(customerId);
    if (!subscription) {
      return "ignored: unknown customer";
    }
    const orgId = subscription.organizationId;

    switch (event.type) {
      case "checkout.session.completed": {
        const sync: SubscriptionSync = {
          status: SubscriptionStatus.ACTIVE,
          stripeSubscriptionId:
            typeof object.subscription === "string" ? object.subscription : undefined,
        };
        await this.repository.syncSubscription(orgId, sync);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const items = object.items as { data?: Array<{ quantity?: number }> } | undefined;
        await this.repository.syncSubscription(orgId, {
          status: mapStatus(String(object.status)),
          stripeSubscriptionId: typeof object.id === "string" ? object.id : undefined,
          quantity: items?.data?.[0]?.quantity,
          currentPeriodStart: toDate(object.current_period_start as number),
          currentPeriodEnd: toDate(object.current_period_end as number),
          cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
          canceledAt: toDate(object.canceled_at as number),
        });
        break;
      }
      case "customer.subscription.deleted": {
        await this.repository.syncSubscription(orgId, {
          status: SubscriptionStatus.CANCELED,
          canceledAt: new Date(),
        });
        break;
      }
      case "invoice.payment_failed": {
        await this.repository.syncSubscription(orgId, {
          status: SubscriptionStatus.PAST_DUE,
        });
        await this.recordInvoice(orgId, object);
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.paid": {
        await this.repository.syncSubscription(orgId, {
          status: SubscriptionStatus.ACTIVE,
        });
        await this.recordInvoice(orgId, object);
        break;
      }
      default:
        return "ignored";
    }

    this.access.invalidate(orgId);
    await this.audit.log({
      action: "subscription.synced",
      entityType: "subscription",
      entityId: orgId,
      organizationId: orgId,
      after: { event: event.type },
    });
    return "processed";
  }

  private async recordInvoice(orgId: string, object: Record<string, unknown>): Promise<void> {
    if (typeof object.id !== "string") {
      return;
    }
    await this.repository.upsertInvoice(orgId, {
      stripeInvoiceId: object.id,
      number: typeof object.number === "string" ? object.number : null,
      amountDue: typeof object.amount_due === "number" ? object.amount_due : 0,
      currency: typeof object.currency === "string" ? object.currency : "eur",
      status: typeof object.status === "string" ? object.status : "open",
      periodStart: toDate(object.period_start as number),
      periodEnd: toDate(object.period_end as number),
      hostedInvoiceUrl:
        typeof object.hosted_invoice_url === "string" ? object.hosted_invoice_url : null,
      pdfUrl: typeof object.invoice_pdf === "string" ? object.invoice_pdf : null,
    });
  }
}
