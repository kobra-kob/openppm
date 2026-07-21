import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";

describe("Portefeuilles (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let employeeToken: string;
  let otherOrgToken: string;
  let portfolioId: string;
  let projectId: string;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

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
      organizationName: "PF Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@pf.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const other = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Autre PF",
      firstName: "Bob",
      lastName: "Boss",
      email: "bob@pf.test",
      password: "SuperSecret123",
    });
    otherOrgToken = other.body.accessToken;

    // Un employé (non transverse) pour tester les permissions
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "pf-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@pf.test" } });
    const employeeRole = await prisma.role.findUniqueOrThrow({ where: { key: "employee" } });
    await prisma.user.create({
      data: {
        organizationId: org.id,
        email: "emma@pf.test",
        passwordHash: alice.passwordHash,
        firstName: "Emma",
        lastName: "Employée",
        userRoles: { create: { roleId: employeeRole.id } },
      },
    });
    const login = await request(server())
      .post("/api/v1/auth/login")
      .send({ email: "emma@pf.test", password: "SuperSecret123" })
      .expect(200);
    employeeToken = login.body.accessToken;

    const project = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Refonte SI" })
      .expect(201);
    projectId = project.body.id;
    // Budget approuvé simulé (le workflow arrive au lot P2)
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "active", budget: 120000 },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe("gestion", () => {
    it("crée un portefeuille avec enveloppe (rôle transverse)", async () => {
      const response = await request(server())
        .post("/api/v1/portfolios")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Transformation digitale", budgetEnvelope: 500000 })
        .expect(201);
      portfolioId = response.body.id;
      expect(Number(response.body.budgetEnvelope)).toBe(500000);
      expect(response.body.projectCount).toBe(0);
    });

    it("refuse la création par un employé (403)", async () => {
      await request(server())
        .post("/api/v1/portfolios")
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ name: "Interdit" })
        .expect(403);
    });

    it("liste et isole par organisation", async () => {
      const mine = await request(server())
        .get("/api/v1/portfolios")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(mine.body).toHaveLength(1);
      const other = await request(server())
        .get("/api/v1/portfolios")
        .set("Authorization", `Bearer ${otherOrgToken}`)
        .expect(200);
      expect(other.body).toHaveLength(0);
    });
  });

  describe("rattachement de projets et consolidation", () => {
    it("liste les projets non rattachés puis rattache", async () => {
      const unassigned = await request(server())
        .get("/api/v1/portfolios/unassigned-projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(unassigned.body.map((p: { id: string }) => p.id)).toContain(projectId);

      const attached = await request(server())
        .post(`/api/v1/portfolios/${portfolioId}/projects`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ projectId })
        .expect(201);
      expect(attached.body.projectCount).toBe(1);
      // Consolidation : budget alloué = 120000, engagé aussi (projet actif)
      expect(attached.body.allocatedBudget).toBe(120000);
      expect(attached.body.committedBudget).toBe(120000);

      // Le projet n'apparaît plus dans les non rattachés
      const after = await request(server())
        .get("/api/v1/portfolios/unassigned-projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(after.body.map((p: { id: string }) => p.id)).not.toContain(projectId);
    });

    it("refuse un doublon (409) et un projet inexistant (400)", async () => {
      await request(server())
        .post(`/api/v1/portfolios/${portfolioId}/projects`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ projectId })
        .expect(409);
      await request(server())
        .post(`/api/v1/portfolios/${portfolioId}/projects`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ projectId: "00000000-0000-7000-8000-000000000000" })
        .expect(400);
    });

    it("détache un projet (consolidation remise à zéro)", async () => {
      const detached = await request(server())
        .delete(`/api/v1/portfolios/${portfolioId}/projects/${projectId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(detached.body.projectCount).toBe(0);
      expect(detached.body.allocatedBudget).toBe(0);
    });
  });

  describe("suppression", () => {
    it("supprime le portefeuille et détache ses projets", async () => {
      await request(server())
        .post(`/api/v1/portfolios/${portfolioId}/projects`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ projectId })
        .expect(201);
      await request(server())
        .delete(`/api/v1/portfolios/${portfolioId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(204);
      await request(server())
        .get(`/api/v1/portfolios/${portfolioId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);
      // Le projet est redevenu non rattaché
      const unassigned = await request(server())
        .get("/api/v1/portfolios/unassigned-projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(unassigned.body.map((p: { id: string }) => p.id)).toContain(projectId);
    });
  });
});
