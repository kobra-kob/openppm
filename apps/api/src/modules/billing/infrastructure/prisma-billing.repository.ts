import { Injectable } from "@nestjs/common";
import { MembershipStatus, Subscription, SubscriptionPlan, SubscriptionStatus } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import {
  BillingRepository,
  InvoiceRecord,
  SubscriptionSync,
} from "../domain/billing.repository";

@Injectable()
export class PrismaBillingRepository implements BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSubscription(organizationId: string): Promise<Subscription | null> {
    return this.prisma.subscription.findUnique({ where: { organizationId } });
  }

  async ensureSubscription(organizationId: string, quantity: number): Promise<Subscription> {
    return this.prisma.subscription.upsert({
      where: { organizationId },
      update: {},
      create: {
        organizationId,
        planKey: "STANDARD",
        status: SubscriptionStatus.ACTIVE,
        quantity: Math.max(1, quantity),
        unitAmount: 2000,
        currency: "eur",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  findPlan(key: string): Promise<SubscriptionPlan | null> {
    return this.prisma.subscriptionPlan.findUnique({ where: { key } });
  }

  countActiveMembers(organizationId: string): Promise<number> {
    return this.prisma.organizationMembership.count({
      where: {
        organizationId,
        status: MembershipStatus.ACTIVE,
        user: { deletedAt: null, isActive: true },
      },
    });
  }

  async setQuantity(organizationId: string, quantity: number): Promise<void> {
    await this.prisma.subscription.updateMany({
      where: { organizationId },
      data: { quantity: Math.max(1, quantity) },
    });
  }

  async setStripeCustomerId(organizationId: string, customerId: string): Promise<void> {
    await this.prisma.subscription.update({
      where: { organizationId },
      data: { stripeCustomerId: customerId },
    });
  }

  async activate(organizationId: string, quantity: number): Promise<Subscription> {
    const now = new Date();
    return this.prisma.subscription.update({
      where: { organizationId },
      data: {
        status: SubscriptionStatus.ACTIVE,
        quantity: Math.max(1, quantity),
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    });
  }

  async getBillingIdentity(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, ownerUser: { select: { email: true } } },
    });
    if (!org) {
      return null;
    }
    return { name: org.name, email: org.ownerUser?.email ?? "billing@openppm.local" };
  }

  findByStripeCustomerId(customerId: string): Promise<Subscription | null> {
    return this.prisma.subscription.findFirst({ where: { stripeCustomerId: customerId } });
  }

  async syncSubscription(organizationId: string, data: SubscriptionSync): Promise<void> {
    await this.prisma.subscription.update({
      where: { organizationId },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
        ...(data.stripeSubscriptionId !== undefined
          ? { stripeSubscriptionId: data.stripeSubscriptionId }
          : {}),
        ...(data.currentPeriodStart !== undefined
          ? { currentPeriodStart: data.currentPeriodStart }
          : {}),
        ...(data.currentPeriodEnd !== undefined
          ? { currentPeriodEnd: data.currentPeriodEnd }
          : {}),
        ...(data.cancelAtPeriodEnd !== undefined
          ? { cancelAtPeriodEnd: data.cancelAtPeriodEnd }
          : {}),
        ...(data.canceledAt !== undefined ? { canceledAt: data.canceledAt } : {}),
      },
    });
  }

  async upsertInvoice(organizationId: string, invoice: InvoiceRecord): Promise<void> {
    await this.prisma.invoice.upsert({
      where: { stripeInvoiceId: invoice.stripeInvoiceId },
      update: {
        amountDue: invoice.amountDue,
        status: invoice.status,
        hostedInvoiceUrl: invoice.hostedInvoiceUrl,
        pdfUrl: invoice.pdfUrl,
      },
      create: {
        organizationId,
        stripeInvoiceId: invoice.stripeInvoiceId,
        number: invoice.number,
        amountDue: invoice.amountDue,
        currency: invoice.currency,
        status: invoice.status,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        hostedInvoiceUrl: invoice.hostedInvoiceUrl,
        pdfUrl: invoice.pdfUrl,
      },
    });
  }
}
