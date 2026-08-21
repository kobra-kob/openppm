import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/** R7 — Espace « Mes validations » : files d'attente budget + demandes. */
describe("Mes validations (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string; // Alice — admin
  let financeToken: string; // Fred — Finance
  let managerToken: string; // Mona — Manager
  let pmToken: string; // Paula — chef de projet
  let pmId: string;
  let portfolioId: string;

  const server = () => app.getHttpServer();

  const createUser = async (
    orgId: string,
    email: string,
    firstName: string,
    roleKey: string,
    passwordHash: string,
  ): Promise<{ id: string; token: string }> => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey as never } });
    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        email,
        passwordHash,
        firstName,
        lastName: "Test",
        userRoles: { create: { roleId: role.id } },
      },
    });
    const login = await request(server())
      .post("/api/v1/auth/login")
      .send({ email, password: "SuperSecret123" })
      .expect(200);
    return { id: user.id, token: login.body.accessToken };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await resetDatabase(prisma);

    const admin = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Val Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@val.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;

    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "val-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@val.test" } });
    financeToken = (await createUser(org.id, "fred@val.test", "Fred", "finance", alice.passwordHash))
      .token;
    managerToken = (await createUser(org.id, "mona@val.test", "Mona", "manager", alice.passwordHash))
      .token;
    const paula = await createUser(org.id, "paula@val.test", "Paula", "project_manager", alice.passwordHash);
    pmId = paula.id;
    pmToken = paula.token;

    const portfolio = await request(server())
      .post("/api/v1/portfolios")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Digital", budgetEnvelope: 1000000 })
      .expect(201);
    portfolioId = portfolio.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const validations = (token: string) =>
    request(server())
      .get("/api/v1/me/validations")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

  const newBudgetRequest = async (name: string, capex: number, opex: number) => {
    const project = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name, managerId: pmId })
      .expect(201);
    await request(server())
      .post(`/api/v1/portfolios/${portfolioId}/projects`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ projectId: project.body.id })
      .expect(201);
    const req = await request(server())
      .post(`/api/v1/projects/${project.body.id}/budget/requests`)
      .set("Authorization", `Bearer ${pmToken}`)
      .send({ capexAmount: capex, opexAmount: opex })
      .expect(201);
    return { projectId: project.body.id, requestId: req.body.id };
  };

  it("une demande de budget en étape Finance apparaît chez le Finance, pas chez le demandeur", async () => {
    const { projectId } = await newBudgetRequest("Refonte CRM", 80000, 20000); // 100k → Finance puis Direction

    const finance = await validations(financeToken);
    expect(finance.body.budget).toHaveLength(1);
    expect(finance.body.budget[0].projectId).toBe(projectId);
    expect(finance.body.budget[0].approverRole).toBe("finance");
    expect(finance.body.total).toBe(1);

    // Paula (chef de projet, demandeuse) ne se valide pas elle-même
    const paula = await validations(pmToken);
    expect(paula.body.budget).toHaveLength(0);

    // Mona (Manager) n'est pas l'approbateur de l'étape Finance
    const mona = await validations(managerToken);
    expect(mona.body.budget).toHaveLength(0);
  });

  it("séparation des responsabilités : l'admin ne voit pas sa propre demande de budget", async () => {
    const project = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Projet admin" })
      .expect(201);
    await request(server())
      .post(`/api/v1/portfolios/${portfolioId}/projects`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ projectId: project.body.id })
      .expect(201);
    await request(server())
      .post(`/api/v1/projects/${project.body.id}/budget/requests`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ capexAmount: 3000, opexAmount: 0 }) // <10k → Manager
      .expect(201);

    // Cette demande revient au Manager (Mona), pas à l'admin (auteur)
    const mona = await validations(managerToken);
    expect(mona.body.budget.some((b: { projectId: string }) => b.projectId === project.body.id)).toBe(
      true,
    );
    const admin = await validations(adminToken);
    expect(admin.body.budget.some((b: { projectId: string }) => b.projectId === project.body.id)).toBe(
      false,
    );
  });

  it("une demande soumise apparaît dans la file de validation du Manager", async () => {
    const demand = await request(server())
      .post("/api/v1/demands")
      .set("Authorization", `Bearer ${pmToken}`)
      .send({ title: "Nouveau besoin", targetPortfolioId: portfolioId })
      .expect(201);
    // Brouillon : rien à valider pour le Manager
    const before = await validations(managerToken);
    expect(before.body.demands.some((d: { demandId: string }) => d.demandId === demand.body.id)).toBe(
      false,
    );

    // Soumission → l'étape « Validation Manager » revient au Manager
    await request(server())
      .post(`/api/v1/demands/${demand.body.id}/transitions/submit`)
      .set("Authorization", `Bearer ${pmToken}`)
      .send({})
      .expect(201);

    const after = await validations(managerToken);
    const item = after.body.demands.find((d: { demandId: string }) => d.demandId === demand.body.id);
    expect(item).toBeDefined();
    expect(item.stateKey).toBe("submitted");
    expect(item.reference).toMatch(/^DEMD\d{5}$/);
  });
});
