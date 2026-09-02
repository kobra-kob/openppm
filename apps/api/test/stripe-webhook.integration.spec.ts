import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/** S5 — Webhooks Stripe : idempotence + application des événements (mode mock). */
describe("Webhooks Stripe (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let customerId: string;

  const server = () => app.getHttpServer();
  const sendEvent = (event: unknown) =>
    request(server()).post("/api/v1/webhooks/stripe").send(event as object);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    const reg = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Webhook Corp",
      firstName: "Wen",
      lastName: "W",
      email: "wen@wh.test",
      password: "SuperSecret123",
    });
    orgId = reg.body.user.organization.id;
    // Checkout (mock) : crée un client Stripe et active l'abonnement.
    await request(server())
      .post("/api/v1/billing/checkout")
      .set("Authorization", `Bearer ${reg.body.accessToken}`)
      .expect(200);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });
    customerId = sub.stripeCustomerId!;
    expect(customerId).toMatch(/^cus_mock_/);
  });

  afterAll(async () => {
    await app.close();
  });

  it("applique customer.subscription.updated (statut + quantité) et est idempotent", async () => {
    const event = {
      id: "evt_sub_updated_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_wh_1",
          customer: customerId,
          status: "past_due",
          items: { data: [{ quantity: 3 }] },
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          cancel_at_period_end: false,
        },
      },
    };
    const first = await sendEvent(event).expect(200);
    expect(first.body.duplicate).toBe(false);

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });
    expect(sub.status).toBe("PAST_DUE");
    expect(sub.quantity).toBe(3);
    expect(sub.stripeSubscriptionId).toBe("sub_wh_1");

    // Rejeu du même event → ignoré (idempotence)
    const second = await sendEvent(event).expect(200);
    expect(second.body.duplicate).toBe(true);
    const events = await prisma.billingEvent.count({ where: { stripeEventId: "evt_sub_updated_1" } });
    expect(events).toBe(1);
  });

  it("invoice.payment_failed → PAST_DUE + facture enregistrée", async () => {
    const event = {
      id: "evt_inv_failed_1",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_wh_1",
          customer: customerId,
          amount_due: 4000,
          currency: "eur",
          status: "open",
          number: "INV-001",
        },
      },
    };
    await sendEvent(event).expect(200);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });
    expect(sub.status).toBe("PAST_DUE");
    const invoice = await prisma.invoice.findUnique({ where: { stripeInvoiceId: "in_wh_1" } });
    expect(invoice?.amountDue).toBe(4000);
  });

  it("customer.subscription.deleted → CANCELED (données conservées)", async () => {
    await sendEvent({
      id: "evt_sub_deleted_1",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_wh_1", customer: customerId, status: "canceled" } },
    }).expect(200);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });
    expect(sub.status).toBe("CANCELED");
    expect(sub.canceledAt).not.toBeNull();
    // L'organisation et ses données existent toujours
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    expect(org).not.toBeNull();
  });

  it("event d'un client inconnu → ignoré (200, sans effet)", async () => {
    const res = await sendEvent({
      id: "evt_unknown_1",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_x", customer: "cus_unknown", status: "active" } },
    }).expect(200);
    expect(res.body.received).toBe(true);
  });
});
