import { Inject, Injectable } from "@nestjs/common";
import { BILLING_REPOSITORY } from "../domain/billing.repository";
import type { BillingRepository } from "../domain/billing.repository";

/**
 * Source de vérité **unique** du nombre de sièges facturables d'une organisation
 * (§27). Toute la facturation (affichage, sync Stripe) passe par ici, jamais par
 * le front. Règle actuelle : un siège = un membre actif de l'organisation.
 */
@Injectable()
export class BillingSeatService {
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly repository: BillingRepository,
  ) {}

  /** Nombre de sièges facturables (>= 1) de l'organisation. */
  async countBillableSeats(organizationId: string): Promise<number> {
    const members = await this.repository.countActiveMembers(organizationId);
    return Math.max(1, members);
  }
}
