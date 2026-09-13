import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/**
 * Règle de gouvernance : comité d'investissement conditionnel au budget.
 * - Règle désactivée (défaut) → tout passe par le comité.
 * - Règle activée → au-delà de 100 k€ le comité est requis ; en dessous, la
 *   validation Finance suffit et crée directement le projet.
 */
describe("Règle du comité d'investissement (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let financeToken: string;

  const server = () => app.getHttpServer();
  const tr = (id: string, key: string) => `/api/v1/demands/${id}/transitions/${key}`;

  const createUser = async (
    orgId: string,
    email: string,
    roleKey: string,
    passwordHash: string,
  ): Promise<string> => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey as never } });
    await prisma.user.create({
      data: {
        organizationId: orgId,
        email,
        passwordHash,
        firstName: "Fred",
        lastName: "Finance",
        userRoles: { create: { roleId: role.id } },
      },
    });
    const login = await request(server())
      .post("/api/v1/auth/login")
      .send({ email, password: "SuperSecret123" })
      .expect(200);
    return login.body.accessToken;
  };

  const setRule = (enabled: boolean) =>
    request(server())
      .patch("/api/v1/organization/governance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ committeeRuleEnabled: enabled })
      .expect(200);

  /** Amène une nouvelle demande (budget donné) jusqu'à l'étape Validation Finance. */
  const toFinanceReview = async (budget: number | null): Promise<string> => {
    const created = await request(server())
      .post("/api/v1/demands")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Demande", ...(budget !== null ? { estimatedBudget: budget } : {}) })
      .expect(201);
    const id = created.body.id;
    for (const key of ["submit", "pmo_qualify", "prepare_business_case", "finance_validate"]) {
      await request(server())
        .post(tr(id, key))
        .set("Authorization", `Bearer ${adminToken}`)
        .send({})
        .expect(201);
    }
    return id;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    const admin = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Gov Rule Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@gov-rule.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "gov-rule-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@gov-rule.test" } });
    financeToken = await createUser(org.id, "fred@gov-rule.test", "finance", alice.passwordHash);
  });

  afterAll(async () => {
    await app.close();
  });

  it("la règle est désactivée par défaut", async () => {
    const res = await request(server())
      .get("/api/v1/organization/governance")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.committeeRuleEnabled).toBe(false);
  });

  it("règle désactivée : le comité est requis quel que soit le budget", async () => {
    await setRule(false);
    const id = await toFinanceReview(5000);
    const detail = await request(server())
      .get(`/api/v1/demands/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const keys = detail.body.workflow.available.map((t: { key: string }) => t.key);
    expect(keys).toContain("submit_to_committee");
    expect(keys).not.toContain("finance_creates_project");
    expect(detail.body.committeeSkipped).toBe(false);

    // Tenter de créer directement le projet est refusé (comité requis).
    await request(server())
      .post(tr(id, "finance_creates_project"))
      .set("Authorization", `Bearer ${financeToken}`)
      .send({})
      .expect(400);
  });

  it("règle activée, budget sous le seuil : Finance crée le projet directement", async () => {
    await setRule(true);
    const id = await toFinanceReview(50000);
    const detail = await request(server())
      .get(`/api/v1/demands/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const keys = detail.body.workflow.available.map((t: { key: string }) => t.key);
    expect(keys).toContain("finance_creates_project");
    expect(keys).not.toContain("submit_to_committee");
    expect(detail.body.committeeSkipped).toBe(true);

    const approved = await request(server())
      .post(tr(id, "finance_creates_project"))
      .set("Authorization", `Bearer ${financeToken}`)
      .send({})
      .expect(201);
    expect(approved.body.state.key).toBe("approved");
    expect(approved.body.project).not.toBeNull();
  });

  it("règle activée, budget au-dessus du seuil : le comité reste requis", async () => {
    await setRule(true);
    const id = await toFinanceReview(150000);
    const detail = await request(server())
      .get(`/api/v1/demands/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const keys = detail.body.workflow.available.map((t: { key: string }) => t.key);
    expect(keys).toContain("submit_to_committee");
    expect(keys).not.toContain("finance_creates_project");
    expect(detail.body.committeeSkipped).toBe(false);

    await request(server())
      .post(tr(id, "finance_creates_project"))
      .set("Authorization", `Bearer ${financeToken}`)
      .send({})
      .expect(400);
  });

  it("un non-administrateur ne peut pas modifier la règle (403)", async () => {
    await request(server())
      .patch("/api/v1/organization/governance")
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ committeeRuleEnabled: false })
      .expect(403);
  });
});
