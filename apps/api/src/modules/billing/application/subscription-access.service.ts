import { Inject, Injectable } from "@nestjs/common";
import { Subscription, SubscriptionStatus } from "@openppm/db";
import { BILLING_REPOSITORY } from "../domain/billing.repository";
import type { BillingRepository } from "../domain/billing.repository";

export type AccessLevel = "full" | "read_only";

const CACHE_TTL_MS = 30_000;

/**
 * Détermine le niveau d'accès d'une organisation selon son abonnement (§37/§38/
 * §79). Un essai expiré, un abonnement suspendu ou annulé passent l'org en
 * **lecture seule** — les données sont conservées, seules les écritures sont
 * bloquées. Aucun abonnement (transition) = plein accès.
 */
@Injectable()
export class SubscriptionAccessService {
  private readonly cache = new Map<string, { level: AccessLevel; expiresAt: number }>();

  constructor(
    @Inject(BILLING_REPOSITORY) private readonly repository: BillingRepository,
  ) {}

  compute(subscription: Subscription | null, now: number = Date.now()): AccessLevel {
    if (!subscription) {
      return "full";
    }
    switch (subscription.status) {
      case SubscriptionStatus.ACTIVE:
      case SubscriptionStatus.ENTERPRISE:
      case SubscriptionStatus.PAST_DUE:
      case SubscriptionStatus.GRACE_PERIOD:
        return "full";
      case SubscriptionStatus.TRIALING:
        return !subscription.trialEnd || subscription.trialEnd.getTime() > now
          ? "full"
          : "read_only";
      case SubscriptionStatus.SUSPENDED:
      case SubscriptionStatus.CANCELED:
        return "read_only";
      default:
        return "full";
    }
  }

  async getAccessLevel(organizationId: string): Promise<AccessLevel> {
    const cached = this.cache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.level;
    }
    const subscription = await this.repository.findSubscription(organizationId);
    const level = this.compute(subscription);
    this.cache.set(organizationId, { level, expiresAt: Date.now() + CACHE_TTL_MS });
    return level;
  }

  invalidate(organizationId: string): void {
    this.cache.delete(organizationId);
  }
}
