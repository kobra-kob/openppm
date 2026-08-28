import { Module } from "@nestjs/common";
import { BillingSeatService } from "./application/billing-seat.service";
import { BillingService } from "./application/billing.service";
import { BILLING_REPOSITORY } from "./domain/billing.repository";
import { PrismaBillingRepository } from "./infrastructure/prisma-billing.repository";
import { BillingController } from "./presentation/billing.controller";

/** Domaine facturation SaaS (abonnements, sièges, Stripe). */
@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingSeatService,
    { provide: BILLING_REPOSITORY, useClass: PrismaBillingRepository },
  ],
  exports: [BillingService, BillingSeatService],
})
export class BillingModule {}
