import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";

describe("Devis (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string; // Alice — admin (éditeur)
  let managerToken: string; // Mona — revue niveau 1
  let financeToken: string; // Fred — validation niveau 2
  let employeeToken: string; // Bob — lecture seule
  let projectId: string;

  const server = () => app.getHttpServer();
  const quotesUrl = () => `/api/v1/projects/${projectId}/quotes`;

  const createUser = async (
    org: { id: string },
    email: string,
    roleKey: string,
    passwordHash: string,
  ): Promise<string> => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey as never } });
    await prisma.user.create({
      data: {
        organizationId: org.id,
        email,
        passwordHash,
        firstName: email.split("@")[0] ?? email,
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
      organizationName: "Devis Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@devis.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "devis-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@devis.test" } });
    managerToken = await createUser(org, "mona@devis.test", "manager", alice.passwordHash);
    financeToken = await createUser(org, "fred@devis.test", "finance", alice.passwordHash);
    employeeToken = await createUser(org, "bob@devis.test", "employee", alice.passwordHash);

    const project = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Prestation web" })
      .expect(201);
    projectId = project.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  let quoteId: string;

  it("crée un devis numéroté et calcule les totaux HT/TVA/TTC", async () => {
    const created = await request(server())
      .post(quotesUrl())
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Site vitrine", customerName: "ACME", vatRate: 20 })
      .expect(201);
    quoteId = created.body.id;
    expect(created.body.reference).toBe("DEV-0001");
    expect(created.body.status).toBe("draft");

    await request(server())
      .post(`${quotesUrl()}/${quoteId}/lines`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label: "Conception", quantity: 2, unitPrice: 1000, discountRate: 10 })
      .expect(201);
    const withLines = await request(server())
      .post(`${quotesUrl()}/${quoteId}/lines`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label: "Intégration", quantity: 5, unitPrice: 200 })
      .expect(201);

    // Ligne 1 : 2 × 1000 × 0.9 = 1800 ; Ligne 2 : 5 × 200 = 1000 ; HT = 2800
    expect(withLines.body.totalHT).toBe(2800);
    expect(withLines.body.vatAmount).toBe(560);
    expect(withLines.body.totalTTC).toBe(3360);
    expect(withLines.body.lines[0].lineTotalHT).toBe(1800);
  });

  it("interdit la création d'un devis à un employé (403)", async () => {
    await request(server())
      .post(quotesUrl())
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ title: "KO" })
      .expect(403);
  });

  it("refuse de soumettre un devis sans ligne (400)", async () => {
    const empty = await request(server())
      .post(quotesUrl())
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Vide" })
      .expect(201);
    await request(server())
      .post(`${quotesUrl()}/${empty.body.id}/submit`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
  });

  it("workflow à deux niveaux : soumission → revue (N1) → validation (N2)", async () => {
    await request(server())
      .post(`${quotesUrl()}/${quoteId}/submit`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(201);

    // Un devis soumis n'est plus éditable
    await request(server())
      .post(`${quotesUrl()}/${quoteId}/lines`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label: "Trop tard", quantity: 1, unitPrice: 10 })
      .expect(400);

    // Niveau 1 : la finance n'a pas le rôle de revue
    await request(server())
      .post(`${quotesUrl()}/${quoteId}/review`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ approve: true })
      .expect(403);

    // Le manager effectue la revue niveau 1
    const reviewed = await request(server())
      .post(`${quotesUrl()}/${quoteId}/review`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ approve: true, comment: "OK sur le fond" })
      .expect(201);
    expect(reviewed.body.status).toBe("reviewed");
    expect(reviewed.body.reviewedByName).toContain("mona");

    // Niveau 2 : le manager ne peut pas valider définitivement
    await request(server())
      .post(`${quotesUrl()}/${quoteId}/approve`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ approve: true })
      .expect(403);

    // La finance valide définitivement
    const approved = await request(server())
      .post(`${quotesUrl()}/${quoteId}/approve`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ approve: true })
      .expect(201);
    expect(approved.body.status).toBe("approved");
    expect(approved.body.approvedByName).toContain("fred");
    expect(approved.body.can.edit).toBe(false);
  });

  it("rejet en revue puis duplication en nouvelle révision", async () => {
    const draft = await request(server())
      .post(quotesUrl())
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Offre premium" })
      .expect(201);
    await request(server())
      .post(`${quotesUrl()}/${draft.body.id}/lines`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label: "Forfait", quantity: 1, unitPrice: 5000 })
      .expect(201);
    await request(server())
      .post(`${quotesUrl()}/${draft.body.id}/submit`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(201);

    const rejected = await request(server())
      .post(`${quotesUrl()}/${draft.body.id}/review`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ approve: false, comment: "Revoir le périmètre" })
      .expect(201);
    expect(rejected.body.status).toBe("rejected");

    const revised = await request(server())
      .post(`${quotesUrl()}/${draft.body.id}/duplicate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(201);
    expect(revised.body.status).toBe("draft");
    expect(revised.body.revision).toBe(2);
    expect(revised.body.lines).toHaveLength(1);
    expect(revised.body.totalHT).toBe(5000);
    expect(revised.body.reference).not.toBe(draft.body.reference);
  });

  it("un employé peut consulter la liste des devis (200)", async () => {
    const list = await request(server())
      .get(quotesUrl())
      .set("Authorization", `Bearer ${employeeToken}`)
      .expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThan(0);
  });
});
