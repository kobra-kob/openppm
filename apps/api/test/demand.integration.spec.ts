import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";

/** Demand Management, lot D1 : demandes, numérotation, étiquettes, portefeuille. */
describe("Demandes (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string; // Alice — admin
  let collabToken: string; // Bob — collaborateur (employee)
  let otherCollabToken: string; // Chloé — collaboratrice
  let otherOrgToken: string;
  let portfolioId: string;

  const server = () => app.getHttpServer();

  const createUser = async (
    orgId: string,
    email: string,
    firstName: string,
    roleKey: string,
    passwordHash: string,
  ): Promise<string> => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey as never } });
    await prisma.user.create({
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
    return login.body.accessToken;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.risk.deleteMany();
    await prisma.document.deleteMany();
    await prisma.approvalStep.deleteMany();
    await prisma.budgetRequest.deleteMany();
    await prisma.businessCaseRisk.deleteMany();
    await prisma.businessCase.deleteMany();
    await prisma.demandTag.deleteMany();
    await prisma.demand.deleteMany();
    await prisma.quoteLine.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.costEntry.deleteMany();
    await prisma.budgetLine.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.timeEntry.deleteMany();
    await prisma.taskDependency.deleteMany();
    await prisma.checklistItem.deleteMany();
    await prisma.taskAssignee.deleteMany();
    await prisma.task.deleteMany();
    await prisma.boardColumn.deleteMany();
    await prisma.board.deleteMany();
    await prisma.favorite.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.portfolio.deleteMany();
    await prisma.projectTemplate.deleteMany();
    await prisma.projectCategory.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.groupMember.deleteMany();
    await prisma.group.deleteMany();
    await prisma.user.deleteMany();
    await prisma.workflowTransitionLog.deleteMany();
    await prisma.workflowInstance.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflowState.deleteMany();
    await prisma.workflowDefinition.deleteMany();
    await prisma.organization.deleteMany();

    const admin = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Demand Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@demand.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "demand-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@demand.test" } });
    collabToken = await createUser(org.id, "bob@demand.test", "Bob", "employee", alice.passwordHash);
    otherCollabToken = await createUser(
      org.id,
      "chloe@demand.test",
      "Chloé",
      "employee",
      alice.passwordHash,
    );

    const other = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Autre Corp",
      firstName: "Dan",
      lastName: "Dupont",
      email: "dan@autre.test",
      password: "SuperSecret123",
    });
    otherOrgToken = other.body.accessToken;

    const portfolio = await request(server())
      .post("/api/v1/portfolios")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Transformation 2027" })
      .expect(201);
    portfolioId = portfolio.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  let demandId: string;

  it("un collaborateur crée une demande complète, numérotée DEMD00001", async () => {
    const response = await request(server())
      .post("/api/v1/demands")
      .set("Authorization", `Bearer ${collabToken}`)
      .send({
        title: "Portail fournisseurs",
        description: "Dématérialiser les échanges",
        objectives: "Réduire les délais de traitement",
        justification: "30 % du temps administratif est manuel",
        department: "Achats",
        priority: 2,
        urgency: "high",
        estimatedBudget: 85000,
        estimatedDurationDays: 180,
        targetPortfolioId: portfolioId,
        tags: ["achats", "dématérialisation", "achats"],
      })
      .expect(201);

    demandId = response.body.id;
    expect(response.body.reference).toBe("DEMD00001");
    expect(response.body.requester.name).toContain("Bob");
    expect(response.body.urgency).toBe("high");
    expect(response.body.estimatedBudget).toBe(85000);
    expect(response.body.targetPortfolio.id).toBe(portfolioId);
    // Étiquettes dédoublonnées
    expect(response.body.tags.sort()).toEqual(["achats", "dématérialisation"]);
    expect(response.body.canEdit).toBe(true);
  });

  it("la numérotation s'incrémente et reste unique", async () => {
    const second = await request(server())
      .post("/api/v1/demands")
      .set("Authorization", `Bearer ${collabToken}`)
      .send({ title: "Deuxième demande" })
      .expect(201);
    expect(second.body.reference).toMatch(/^DEMD\d{5}$/);
    expect(second.body.reference).toBe("DEMD00002");
    // Valeurs par défaut
    expect(second.body.priority).toBe(3);
    expect(second.body.urgency).toBe("medium");
  });

  it("refuse un numéro fourni par l'utilisateur (400)", async () => {
    await request(server())
      .post("/api/v1/demands")
      .set("Authorization", `Bearer ${collabToken}`)
      .send({ title: "Numéro imposé", reference: "DEMD09999" })
      .expect(400);
  });

  it("refuse un portefeuille inexistant (400)", async () => {
    const response = await request(server())
      .post("/api/v1/demands")
      .set("Authorization", `Bearer ${collabToken}`)
      .send({ title: "Mauvais portefeuille", targetPortfolioId: "019f0000-0000-7000-8000-000000000000" })
      .expect(400);
    expect(response.body.code).toBe("PORTFOLIO_NOT_FOUND");
  });

  it("le demandeur modifie sa demande et remplace ses étiquettes", async () => {
    const updated = await request(server())
      .patch(`/api/v1/demands/${demandId}`)
      .set("Authorization", `Bearer ${collabToken}`)
      .send({ title: "Portail fournisseurs v2", priority: 1, tags: ["priorisé"] })
      .expect(200);
    expect(updated.body.title).toBe("Portail fournisseurs v2");
    expect(updated.body.priority).toBe(1);
    expect(updated.body.tags).toEqual(["priorisé"]);
  });

  it("un autre collaborateur ne peut pas modifier la demande (403)", async () => {
    await request(server())
      .patch(`/api/v1/demands/${demandId}`)
      .set("Authorization", `Bearer ${otherCollabToken}`)
      .send({ title: "Tentative" })
      .expect(403);
  });

  it("un rôle transverse (admin) peut intervenir sur toute demande", async () => {
    const updated = await request(server())
      .patch(`/api/v1/demands/${demandId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ department: "Direction achats" })
      .expect(200);
    expect(updated.body.department).toBe("Direction achats");
  });

  it("filtre par périmètre, portefeuille et recherche", async () => {
    const mine = await request(server())
      .get("/api/v1/demands?scope=mine")
      .set("Authorization", `Bearer ${collabToken}`)
      .expect(200);
    // Bob a créé DEMD00001 et DEMD00002 ; les deux autres tentatives ont été rejetées
    expect(mine.body.total).toBe(2);

    // Chloé n'a émis aucune demande
    const none = await request(server())
      .get("/api/v1/demands?scope=mine")
      .set("Authorization", `Bearer ${otherCollabToken}`)
      .expect(200);
    expect(none.body.total).toBe(0);

    const byPortfolio = await request(server())
      .get(`/api/v1/demands?targetPortfolioId=${portfolioId}`)
      .set("Authorization", `Bearer ${collabToken}`)
      .expect(200);
    expect(byPortfolio.body.total).toBe(1);

    // Recherche par numéro
    const byReference = await request(server())
      .get("/api/v1/demands?search=DEMD00002")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(byReference.body.total).toBe(1);
  });

  it("n'expose rien aux autres organisations", async () => {
    const list = await request(server())
      .get("/api/v1/demands")
      .set("Authorization", `Bearer ${otherOrgToken}`)
      .expect(200);
    expect(list.body.total).toBe(0);

    await request(server())
      .get(`/api/v1/demands/${demandId}`)
      .set("Authorization", `Bearer ${otherOrgToken}`)
      .expect(404);
  });

  it("met une demande à la corbeille : elle disparaît des listes", async () => {
    await request(server())
      .delete(`/api/v1/demands/${demandId}`)
      .set("Authorization", `Bearer ${collabToken}`)
      .expect(204);

    await request(server())
      .get(`/api/v1/demands/${demandId}`)
      .set("Authorization", `Bearer ${collabToken}`)
      .expect(404);

    const remaining = await request(server())
      .get("/api/v1/demands")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(remaining.body.items.every((d: { id: string }) => d.id !== demandId)).toBe(true);
  });

  it("exige un jeton (401)", async () => {
    await request(server()).get("/api/v1/demands").expect(401);
  });
});
