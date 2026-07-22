import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";

describe("Finances détaillées (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let employeeToken: string;
  let projectId: string;
  let capexLineId: string;

  const server = () => app.getHttpServer();
  const financeUrl = () => `/api/v1/projects/${projectId}/finance`;

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
        firstName: email.split("@")[0],
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
    await prisma.organization.deleteMany();

    const admin = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Fin Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@fin.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "fin-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@fin.test" } });
    employeeToken = await createUser(org, "bob@fin.test", "employee", alice.passwordHash);

    const project = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Data platform" })
      .expect(201);
    projectId = project.body.id;

    // Budget approuvé (piloté normalement par la gouvernance) fixé pour les calculs
    await prisma.project.update({ where: { id: projectId }, data: { budget: 200000 } });

    // Une tâche + du temps saisi pour valoriser la main-d'œuvre
    const task = await prisma.task.create({
      data: {
        organizationId: org.id,
        projectId,
        title: "Développement",
        createdById: alice.id,
      },
    });
    await prisma.timeEntry.create({
      data: {
        organizationId: org.id,
        taskId: task.id,
        userId: alice.id,
        spentOn: new Date("2026-07-01"),
        hours: 40,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("expose une synthèse initiale : budget approuvé, prévu et réel à zéro", async () => {
    const response = await request(server())
      .get(financeUrl())
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body.approvedBudget).toBe(200000);
    expect(response.body.laborRate).toBeNull();
    expect(response.body.planned.total).toBe(0);
    expect(response.body.actual.total).toBe(0);
    expect(response.body.actual.laborHours).toBe(40);
    expect(response.body.actual.laborCost).toBe(0); // pas de taux → pas de coût
    expect(response.body.remaining).toBe(200000);
    expect(response.body.canManage).toBe(true);
  });

  it("un employé peut consulter mais pas gérer les finances (403)", async () => {
    await request(server())
      .get(financeUrl())
      .set("Authorization", `Bearer ${employeeToken}`)
      .expect(200);
    await request(server())
      .post(`${financeUrl()}/lines`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ category: "capex", label: "KO", plannedAmount: 1000 })
      .expect(403);
  });

  it("valorise le temps en coût de main-d'œuvre via le taux horaire", async () => {
    const response = await request(server())
      .put(`${financeUrl()}/labor-rate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ laborRate: 75 })
      .expect(200);
    expect(response.body.laborRate).toBe(75);
    expect(response.body.actual.laborCost).toBe(3000); // 40 h × 75 €
    expect(response.body.actual.total).toBe(3000);
    expect(response.body.remaining).toBe(197000);
  });

  it("répartit le budget en lignes CAPEX/OPEX (prévisionnel)", async () => {
    const capex = await request(server())
      .post(`${financeUrl()}/lines`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ category: "capex", label: "Serveurs", plannedAmount: 120000 })
      .expect(201);
    capexLineId = capex.body.budgetLines.find((l: { label: string }) => l.label === "Serveurs").id;

    const response = await request(server())
      .post(`${financeUrl()}/lines`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ category: "opex", label: "Maintenance", plannedAmount: 50000 })
      .expect(201);
    expect(response.body.planned.capex).toBe(120000);
    expect(response.body.planned.opex).toBe(50000);
    expect(response.body.planned.total).toBe(170000);
    expect(response.body.unallocated).toBe(30000); // 200000 − 170000
  });

  it("enregistre des coûts réels et les impute aux lignes", async () => {
    await request(server())
      .post(`${financeUrl()}/costs`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ category: "capex", label: "Achat serveurs", amount: 80000, incurredOn: "2026-07-05", budgetLineId: capexLineId })
      .expect(201);
    const response = await request(server())
      .post(`${financeUrl()}/costs`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ category: "opex", label: "Licences", amount: 12000, incurredOn: "2026-07-10" })
      .expect(201);

    expect(response.body.actual.manualCapex).toBe(80000);
    expect(response.body.actual.manualOpex).toBe(12000);
    expect(response.body.actual.manualTotal).toBe(92000);
    // Réel total = coûts saisis + main-d'œuvre (40 h × 75 €)
    expect(response.body.actual.total).toBe(95000);
    expect(response.body.remaining).toBe(105000); // 200000 − 95000
    const capexLine = response.body.budgetLines.find((l: { id: string }) => l.id === capexLineId);
    expect(capexLine.committedCost).toBe(80000);
  });

  it("refuse un coût rattaché à une ligne d'un autre projet (400)", async () => {
    const other = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Autre projet" })
      .expect(201);
    const otherLine = await request(server())
      .post(`/api/v1/projects/${other.body.id}/finance/lines`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ category: "capex", label: "X", plannedAmount: 1000 })
      .expect(201);
    const foreignLineId = otherLine.body.budgetLines[0].id;

    await request(server())
      .post(`${financeUrl()}/costs`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ category: "capex", label: "KO", amount: 100, incurredOn: "2026-07-11", budgetLineId: foreignLineId })
      .expect(400);
  });

  it("supprime une ligne et un coût", async () => {
    const before = await request(server())
      .get(financeUrl())
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const costId = before.body.costEntries[0].id;
    await request(server())
      .delete(`${financeUrl()}/costs/${costId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const after = await request(server())
      .delete(`${financeUrl()}/lines/${capexLineId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body.budgetLines.some((l: { id: string }) => l.id === capexLineId)).toBe(false);
  });
});
