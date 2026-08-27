import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

describe("Gouvernance budgétaire (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string; // Alice — Direction (admin)
  let financeToken: string; // Fred — Finance
  let managerToken: string; // Mona — Manager
  let pmToken: string; // Paula — chef de projet
  let pmId: string;
  let portfolioId: string;
  let projectId: string;

  const server = () => app.getHttpServer();

  const createUser = async (
    org: { id: string },
    email: string,
    firstName: string,
    roleKey: string,
    passwordHash: string,
  ): Promise<{ id: string; token: string }> => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey as never } });
    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
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

  const attachToPortfolio = async (project: string) => {
    await request(server())
      .post(`/api/v1/portfolios/${portfolioId}/projects`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ projectId: project })
      .expect(201);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await resetDatabase(prisma);

    const admin = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Gov Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@gov.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;

    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "gov-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@gov.test" } });
    const fred = await createUser(org, "fred@gov.test", "Fred", "finance", alice.passwordHash);
    financeToken = fred.token;
    const mona = await createUser(org, "mona@gov.test", "Mona", "manager", alice.passwordHash);
    managerToken = mona.token;
    const paula = await createUser(org, "paula@gov.test", "Paula", "project_manager", alice.passwordHash);
    pmId = paula.id;
    pmToken = paula.token;

    const portfolio = await request(server())
      .post("/api/v1/portfolios")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Digital", budgetEnvelope: 1000000 })
      .expect(201);
    portfolioId = portfolio.body.id;

    // Projet dont Paula est chef de projet
    const project = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Refonte CRM", managerId: pmId })
      .expect(201);
    projectId = project.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const governanceUrl = () => `/api/v1/projects/${projectId}/budget`;

  it("refuse une demande de budget si le projet n'est pas dans un portefeuille (400)", async () => {
    const response = await request(server())
      .post(`${governanceUrl()}/requests`)
      .set("Authorization", `Bearer ${pmToken}`)
      .send({ capexAmount: 80000, opexAmount: 20000 })
      .expect(400);
    expect(response.body.code).toBe("PROJECT_NOT_IN_PORTFOLIO");
  });

  it("le chef de projet soumet une demande une fois le projet rattaché", async () => {
    await attachToPortfolio(projectId);
    const response = await request(server())
      .post(`${governanceUrl()}/requests`)
      .set("Authorization", `Bearer ${pmToken}`)
      .send({ capexAmount: 80000, opexAmount: 20000, justification: "Licences + dév" })
      .expect(201);
    expect(response.body.amount).toBe(100000);
    expect(response.body.status).toBe("pending");
    expect(response.body.currentStep).toBe(0);
    // Montant ≥ 100 000 → chaîne Finance puis Direction (barème par défaut)
    expect(response.body.steps).toHaveLength(2);
    expect(response.body.steps[0].approverRole).toBe("finance");
    expect(response.body.steps[1].approverRole).toBe("executive");
  });

  it("refuse une seconde demande tant qu'une est en cours (409)", async () => {
    await request(server())
      .post(`${governanceUrl()}/requests`)
      .set("Authorization", `Bearer ${pmToken}`)
      .send({ capexAmount: 10000, opexAmount: 0 })
      .expect(409);
  });

  it("workflow : Finance valide l'étape 1, Direction finalise et active le projet", async () => {
    const gov = await request(server())
      .get(governanceUrl())
      .set("Authorization", `Bearer ${pmToken}`)
      .expect(200);
    const request0 = gov.body.request;
    const step0 = request0.steps[0];
    const step1 = request0.steps[1];

    // Paula (chef de projet, ni finance ni admin) ne peut pas décider
    await request(server())
      .post(`${governanceUrl()}/requests/${request0.id}/steps/${step0.id}/decide`)
      .set("Authorization", `Bearer ${pmToken}`)
      .send({ approve: true })
      .expect(403);

    // On ne peut pas sauter à l'étape 2 avant la 1
    await request(server())
      .post(`${governanceUrl()}/requests/${request0.id}/steps/${step1.id}/decide`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ approve: true })
      .expect(400);

    // Fred (Finance) approuve l'étape 1 → avance à l'étape 2, projet encore draft
    const afterFinance = await request(server())
      .post(`${governanceUrl()}/requests/${request0.id}/steps/${step0.id}/decide`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ approve: true, comment: "Budget cohérent" })
      .expect(201);
    expect(afterFinance.body.currentStep).toBe(1);
    expect(afterFinance.body.steps[0].status).toBe("approved");

    const stillDraft = await request(server())
      .get(`/api/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(stillDraft.body.status).toBe("draft");
    expect(stillDraft.body.budget).toBeNull();

    // Fred (Finance) ne peut pas décider l'étape Direction
    await request(server())
      .post(`${governanceUrl()}/requests/${request0.id}/steps/${step1.id}/decide`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ approve: true })
      .expect(403);

    // Alice (Direction/admin) finalise → budget fixé, projet actif
    const finalized = await request(server())
      .post(`${governanceUrl()}/requests/${request0.id}/steps/${step1.id}/decide`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ approve: true })
      .expect(201);
    expect(finalized.body.status).toBe("approved");

    const activeProject = await request(server())
      .get(`/api/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(activeProject.body.status).toBe("active");
    expect(Number(activeProject.body.budget)).toBe(100000);
  });

  it("un budget approuvé se répercute dans la consolidation du portefeuille", async () => {
    const portfolio = await request(server())
      .get(`/api/v1/portfolios/${portfolioId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(portfolio.body.committedBudget).toBe(100000);
  });

  it("chemin de refus : Finance rejette → demande rejetée, projet inchangé", async () => {
    const project2 = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Projet refusé" })
      .expect(201);
    await attachToPortfolio(project2.body.id);

    const req = await request(server())
      .post(`/api/v1/projects/${project2.body.id}/budget/requests`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ capexAmount: 5000, opexAmount: 5000 })
      .expect(201);

    const rejected = await request(server())
      .post(
        `/api/v1/projects/${project2.body.id}/budget/requests/${req.body.id}/steps/${req.body.steps[0].id}/decide`,
      )
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ approve: false, comment: "Montant à revoir" })
      .expect(201);
    expect(rejected.body.status).toBe("rejected");

    const stillDraft = await request(server())
      .get(`/api/v1/projects/${project2.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(stillDraft.body.status).toBe("draft");
    expect(stillDraft.body.budget).toBeNull();

    // Une nouvelle demande est possible après un refus
    const gov = await request(server())
      .get(`/api/v1/projects/${project2.body.id}/budget`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(gov.body.canRequest).toBe(true);
  });

  it("seuil < 10 000 : chaîne à une seule étape Manager, qui active le projet", async () => {
    const project3 = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Petit budget" })
      .expect(201);
    await attachToPortfolio(project3.body.id);

    // Demande de 5 000 créée par l'admin (rôle transverse)
    const req = await request(server())
      .post(`/api/v1/projects/${project3.body.id}/budget/requests`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ capexAmount: 3000, opexAmount: 2000 })
      .expect(201);
    expect(req.body.steps).toHaveLength(1);
    expect(req.body.steps[0].approverRole).toBe("manager");

    // Ni Finance ni chef de projet ne peuvent valider une étape Manager
    await request(server())
      .post(
        `/api/v1/projects/${project3.body.id}/budget/requests/${req.body.id}/steps/${req.body.steps[0].id}/decide`,
      )
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ approve: true })
      .expect(403);

    // Mona (Manager) approuve → budget fixé, projet actif
    const approved = await request(server())
      .post(
        `/api/v1/projects/${project3.body.id}/budget/requests/${req.body.id}/steps/${req.body.steps[0].id}/decide`,
      )
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ approve: true })
      .expect(201);
    expect(approved.body.status).toBe("approved");

    const active = await request(server())
      .get(`/api/v1/projects/${project3.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(active.body.status).toBe("active");
    expect(Number(active.body.budget)).toBe(5000);
  });

  it("un demandeur peut valider sa propre demande de budget (règle SoD retirée)", async () => {
    const project4 = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Auto-validation" })
      .expect(201);
    await attachToPortfolio(project4.body.id);

    // Alice (admin) demande un budget…
    const req = await request(server())
      .post(`/api/v1/projects/${project4.body.id}/budget/requests`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ capexAmount: 4000, opexAmount: 0 })
      .expect(201);
    // …et peut la valider elle-même (le champ canDecide est vrai)
    expect(req.body.steps[0].canDecide).toBe(true);

    const approved = await request(server())
      .post(
        `/api/v1/projects/${project4.body.id}/budget/requests/${req.body.id}/steps/${req.body.steps[0].id}/decide`,
      )
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ approve: true })
      .expect(201);
    expect(approved.body.status).toBe("approved");
  });
});
