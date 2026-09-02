import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";

/**
 * Adaptateur Stripe — centralise toutes les opérations Stripe (§85/§86).
 * Piloté par la configuration : sans `STRIPE_SECRET_KEY`, tourne en **mode
 * mock** (aucun appel réseau, identifiants déterministes) pour développer et
 * tester sans compte Stripe. Brancher les clés test suffit à l'activer.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: Stripe | null;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>("STRIPE_SECRET_KEY");
    this.client = key ? new Stripe(key) : null;
    if (!this.client) {
      this.logger.warn("Stripe en mode MOCK (STRIPE_SECRET_KEY absente).");
    }
  }

  get isMock(): boolean {
    return this.client === null;
  }

  /** Price ID Stripe pour un plan + intervalle (depuis l'ENV). */
  priceId(planKey: string, interval: "month" | "year"): string | null {
    if (planKey !== "STANDARD") {
      return null;
    }
    return (
      this.config.get<string>(
        interval === "year" ? "STRIPE_PRICE_STANDARD_YEARLY" : "STRIPE_PRICE_STANDARD_MONTHLY",
      ) ?? null
    );
  }

  async createCustomer(input: {
    organizationId: string;
    name: string;
    email: string;
  }): Promise<string> {
    if (!this.client) {
      return `cus_mock_${input.organizationId.replace(/-/g, "").slice(0, 14)}`;
    }
    const customer = await this.client.customers.create({
      name: input.name,
      email: input.email,
      metadata: { organizationId: input.organizationId },
    });
    return customer.id;
  }

  async createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    quantity: number;
    successUrl: string;
    cancelUrl: string;
    organizationId: string;
  }): Promise<{ url: string }> {
    if (!this.client) {
      return { url: input.successUrl };
    }
    const session = await this.client.checkout.sessions.create({
      mode: "subscription",
      customer: input.customerId,
      line_items: [{ price: input.priceId, quantity: input.quantity }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      subscription_data: { metadata: { organizationId: input.organizationId } },
    });
    return { url: session.url ?? input.successUrl };
  }

  async createPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    if (!this.client) {
      return { url: input.returnUrl };
    }
    const session = await this.client.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return { url: session.url };
  }

  /** Vérifie la signature d'un webhook et renvoie l'event typé (S5). */
  constructEvent(payload: Buffer, signature: string, secret: string): Stripe.Event {
    if (!this.client) {
      // Mode mock : pas de vérification cryptographique disponible.
      return JSON.parse(payload.toString("utf8")) as Stripe.Event;
    }
    return this.client.webhooks.constructEvent(payload, signature, secret);
  }
}
