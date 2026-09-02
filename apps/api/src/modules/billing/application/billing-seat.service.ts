import { Inject, Injectable } from "@nestjs/common";
import { BILLING_REPOSITORY } from "../domain/billing.repository";
import type { BillingRepository } from "../domain/billing.repository";
import { StripeService } from "./stripe.service";

/**
 * Source de vérité **unique** du nombre de sièges facturables d'une organisation
 * (§27). Toute la facturation (affichage, sync Stripe) passe par ici, jamais par
 * le front. Règle actuelle : un siège = un membre actif de l'organisation.
 */
@Injectable()
export class BillingSeatService {
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly repository: BillingRepository,
    private readonly stripe: StripeService,
  ) {}

  /** Nombre de sièges facturables (>= 1) de l'organisation. */
  async countBillableSeats(organizationId: string): Promise<number> {
    const members = await this.repository.countActiveMembers(organizationId);
    return Math.max(1, members);
  }

  /**
   * Recalcule les sièges et synchronise l'abonnement : quantité locale, puis
   * quantité Stripe (proratisation) si un abonnement Stripe existe. Appelé après
   * tout changement de composition de l'organisation (ajout/retrait de membre).
   */
  async syncSeats(organizationId: string): Promise<number> {
    const seats = await this.countBillableSeats(organizationId);
    const subscription = await this.repository.findSubscription(organizationId);
    if (!subscription || subscription.quantity === seats) {
      return seats;
    }
    await this.repository.setQuantity(organizationId, seats);
    if (subscription.stripeSubscriptionId) {
      await this.stripe.updateSubscriptionQuantity(subscription.stripeSubscriptionId, seats);
    }
    return seats;
  }
}
