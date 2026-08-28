import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/** S2 — Facturation (lecture) : vue d'ensemble, sièges backend, permissions. */
describe("Facturation (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let employeeToken: string;
  let orgId: string;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    const admin = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Billing Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@billing.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    orgId = admin.body.user.organization.id;

    // Un employé (non-admin) : via invitation acceptée
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "billing-corp" } });
    const role = await prisma.role.findUniqueOrThrow({ where: { key: "employee" as never } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@billing.test" } });
    const bob = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: "bob@billing.test",
        passwordHash: alice.passwordHash,
        firstName: "Bob",
        lastName: "Emp",
        userRoles: { create: { roleId: role.id } },
        memberships: {
          create: {
            organizationId: org.id,
            status: "ACTIVE",
            roles: { create: { roleId: role.id } },
          },
        },
      },
    });
    expect(bob.id).toBeDefined();
    const login = await request(server())
      .post("/api/v1/auth/login")
      .send({ email: "bob@billing.test", password: "SuperSecret123" })
      .expect(200);
    employeeToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("l'admin voit la vue de facturation : plan, statut, sièges et montant (backend)", async () => {
    const res = await request(server())
      .get("/api/v1/billing")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.planKey).toBe("STANDARD");
    expect(res.body.unitAmount).toBe(2000);
    // 2 membres actifs (Alice + Bob) → 2 sièges, montant = 2 × 2000 = 4000
    expect(res.body.seats).toBe(2);
    expect(res.body.amount).toBe(4000);
    expect(["ACTIVE", "TRIALING"]).toContain(res.body.status);
  });

  it("un membre sans droit billing ne voit pas la facturation (403)", async () => {
    await request(server())
      .get("/api/v1/billing")
      .set("Authorization", `Bearer ${employeeToken}`)
      .expect(403);
  });

  it("l'inscription crée un essai gratuit de 14 jours (TRIALING)", async () => {
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });
    expect(sub.status).toBe("TRIALING");
    expect(sub.trialEnd).not.toBeNull();
    expect(sub.trialEnd!.getTime()).toBeGreaterThan(Date.now());
  });

  it("org active (essai en cours) : l'écriture métier est autorisée", async () => {
    await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Projet pendant l'essai" })
      .expect(201);
  });

  it("essai expiré : écriture bloquée (402), lecture et billing accessibles", async () => {
    const reg = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Expired Trial Corp",
      firstName: "Carol",
      lastName: "C",
      email: "carol@exp.test",
      password: "SuperSecret123",
    });
    const token = reg.body.accessToken;
    const expOrg = reg.body.user.organization.id;
    // Force l'expiration de l'essai (avant toute requête → pas de cache périmé)
    await prisma.subscription.update({
      where: { organizationId: expOrg },
      data: { trialEnd: new Date(Date.now() - 1000) },
    });

    // Écriture métier refusée
    const blocked = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Interdit" })
      .expect(402);
    expect(blocked.body.code).toBe("SUBSCRIPTION_INACTIVE");

    // Lecture toujours possible (données conservées)
    await request(server())
      .get("/api/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // Billing accessible (pour réactiver) + /auth/me signale l'inactivité
    await request(server()).get("/api/v1/billing").set("Authorization", `Bearer ${token}`).expect(200);
    const me = await request(server())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(me.body.subscriptionActive).toBe(false);
  });

  it("crée un abonnement à la volée si l'org n'en a pas encore", async () => {
    // On supprime l'abonnement puis on relit : il doit être recréé.
    await prisma.subscription.deleteMany({ where: { organizationId: orgId } });
    const res = await request(server())
      .get("/api/v1/billing")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.planKey).toBe("STANDARD");
    const sub = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
    expect(sub).not.toBeNull();
  });
});
