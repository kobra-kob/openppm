import { Inject, Injectable } from "@nestjs/common";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import { BILLING_REPOSITORY } from "../domain/billing.repository";
import type { BillingRepository } from "../domain/billing.repository";
import { BillingSeatService } from "./billing-seat.service";

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
@Injectable()
export class BillingService {
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly repository: BillingRepository,
    private readonly seats: BillingSeatService,
  ) {}

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
