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
