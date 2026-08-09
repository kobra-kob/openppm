import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/**
 * Demand Management, lot D4 : conversion d'une demande approuvée en projet.
 * Vérifie la création du projet, le budget approuvé, la reprise des pièces
 * jointes et des risques, et la traçabilité bidirectionnelle.
 */
describe("Conversion demande → projet (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string; // Alice — admin (arbitre tout le circuit)
  let requesterId: string; // Bob — demandeur (chef de projet par défaut)
  let bobToken: string;
  let orgId: string;
  let portfolioId: string;

  const server = () => app.getHttpServer();
  const tr = (id: string, key: string) => `/api/v1/demands/${id}/transitions/${key}`;

  const createUser = async (
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
      organizationName: "Convert Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@convert.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    orgId = (await prisma.organization.findUniqueOrThrow({ where: { slug: "convert-corp" } })).id;
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@convert.test" } });
    const bob = await createUser("bob@convert.test", "Bob", "employee", alice.passwordHash);
    requesterId = bob.id;
    bobToken = bob.token;

    const portfolio = await request(server())
      .post("/api/v1/portfolios")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Portefeuille 2027" })
      .expect(201);
    portfolioId = portfolio.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const runCircuitToCommittee = async (id: string) => {
    // Alice (admin) arbitre chaque étape du circuit jusqu'au comité.
    for (const key of [
      "submit",
      "manager_approve",
      "pmo_qualify",
      "prepare_business_case",
      "finance_validate",
      "submit_to_committee",
    ]) {
      await request(server())
        .post(tr(id, key))
        .set("Authorization", `Bearer ${adminToken}`)
        .send({})
        .expect(201);
    }
  };

  it("convertit une demande avec budget et portefeuille : projet actif, budget approuvé, risques et pièces repris", async () => {
    // Demande complète, émise par Bob
    const demand = await request(server())
      .post("/api/v1/demands")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({
        title: "Plateforme e-commerce",
        description: "Refonte de la boutique en ligne",
        priority: 2,
        estimatedBudget: 150000,
        targetPortfolioId: portfolioId,
      })
      .expect(201);
    const id = demand.body.id;

    // Business Case avec deux risques, rédigé par l'admin
    await request(server())
      .put(`/api/v1/demands/${id}/business-case`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        roi: "ROI 24 mois",
        risks: [
          { label: "Délai fournisseur", probability: "high", impact: "high" },
          { label: "Montée en charge", probability: "low", impact: "medium" },
        ],
      })
      .expect(200);

    // Pièce jointe rattachée à la demande (insérée directement, l'upload demande viendra plus tard)
    await prisma.document.create({
      data: {
        organizationId: orgId,
        demandId: id,
        name: "cahier-des-charges.pdf",
        storagePath: "demands/cdc.pdf",
        mimeType: "application/pdf",
        size: 2048,
        uploadedById: requesterId,
      },
    });

    await runCircuitToCommittee(id);

    const approved = await request(server())
      .post(tr(id, "committee_approve"))
      .set("Authorization", `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    // La demande porte le lien vers le projet créé
    expect(approved.body.state.key).toBe("approved");
    expect(approved.body.project).not.toBeNull();
    expect(approved.body.project.code).toMatch(/^PROJ\d{5}$/);
    const projectId = approved.body.project.id;

    // Le projet reprend les données de la demande, avec budget approuvé
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.demandId).toBe(id);
    expect(project.name).toBe("Plateforme e-commerce");
    expect(project.managerId).toBe(requesterId); // chef = demandeur
    expect(project.portfolioId).toBe(portfolioId);
    expect(project.status).toBe("active");
    expect(Number(project.budget)).toBe(150000);

    // Une demande de budget déjà approuvée (2 étapes) matérialise la gouvernance
    const budgetRequest = await prisma.budgetRequest.findFirstOrThrow({
      where: { projectId },
      include: { steps: true },
    });
    expect(budgetRequest.status).toBe("approved");
    expect(Number(budgetRequest.amount)).toBe(150000);
    expect(budgetRequest.steps).toHaveLength(2);
    expect(budgetRequest.steps.every((s) => s.status === "approved")).toBe(true);

    // Les risques du Business Case sont repris dans le registre projet
    const risks = await prisma.risk.findMany({ where: { projectId } });
    expect(risks).toHaveLength(2);
    const highRisk = risks.find((r) => r.label === "Délai fournisseur");
    expect(highRisk?.severity).toBe("high");
    expect(highRisk?.sourceBusinessCaseRiskId).not.toBeNull();

    // La pièce jointe est reprise par le projet (n'est plus rattachée à la demande)
    const documents = await prisma.document.findMany({ where: { projectId } });
    expect(documents).toHaveLength(1);
    expect(documents[0]?.demandId).toBeNull();

    // Le demandeur (chef) est membre du projet
    const members = await prisma.projectMember.findMany({ where: { projectId } });
    expect(members.some((m) => m.userId === requesterId && m.role === "manager")).toBe(true);

    // Traçabilité côté demande : GET expose le projet d'origine
    const detail = await request(server())
      .get(`/api/v1/demands/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.project.id).toBe(projectId);

    // Idempotence : un seul projet rattaché à la demande
    const linked = await prisma.project.count({ where: { demandId: id } });
    expect(linked).toBe(1);
  });

  it("convertit une demande sans budget ni portefeuille : projet en brouillon, sans demande de budget", async () => {
    const demand = await request(server())
      .post("/api/v1/demands")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ title: "Note de cadrage simple" })
      .expect(201);
    const id = demand.body.id;

    await runCircuitToCommittee(id);
    const approved = await request(server())
      .post(tr(id, "committee_approve"))
      .set("Authorization", `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    const projectId = approved.body.project.id;
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.status).toBe("draft");
    expect(project.budget).toBeNull();
    expect(project.portfolioId).toBeNull();

    const budgetRequests = await prisma.budgetRequest.count({ where: { projectId } });
    expect(budgetRequests).toBe(0);
  });
});
