import { Injectable } from "@nestjs/common";
import { MembershipStatus, Subscription, SubscriptionPlan, SubscriptionStatus } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { BillingRepository } from "../domain/billing.repository";

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
}
