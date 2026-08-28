import { Module } from "@nestjs/common";
import { BillingSeatService } from "./application/billing-seat.service";
import { BillingService } from "./application/billing.service";
import { SubscriptionAccessService } from "./application/subscription-access.service";
import { BILLING_REPOSITORY } from "./domain/billing.repository";
import { PrismaBillingRepository } from "./infrastructure/prisma-billing.repository";
import { BillingController } from "./presentation/billing.controller";

/** Domaine facturation SaaS (abonnements, sièges, accès, Stripe). */
@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingSeatService,
    SubscriptionAccessService,
    { provide: BILLING_REPOSITORY, useClass: PrismaBillingRepository },
  ],
  exports: [BillingService, BillingSeatService, SubscriptionAccessService],
})
export class BillingModule {}
