import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";

describe("Recherche globale (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let otherOrgToken: string;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.businessCaseRisk.deleteMany();
    await prisma.businessCase.deleteMany();
    await prisma.risk.deleteMany();
    await prisma.document.deleteMany();
    await prisma.approvalStep.deleteMany();
    await prisma.budgetRequest.deleteMany();
    await prisma.demandTag.deleteMany();
    await prisma.demand.deleteMany();

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
    await prisma.comment.deleteMany();
    await prisma.notification.deleteMany();
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
      organizationName: "Search Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@search.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const other = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Autre Search",
      firstName: "Bob",
      lastName: "Boss",
      email: "bob@search.test",
      password: "SuperSecret123",
    });
    otherOrgToken = other.body.accessToken;

    const project = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Migration Frankenstein", description: "Refonte du monolithe" })
      .expect(201);
    await request(server())
      .post(`/api/v1/projects/${project.body.id}/tasks`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Cartographier Frankenstein", description: "Inventaire des modules" })
      .expect(201);

    // Demande indexée par la recherche globale (D5)
    await request(server())
      .post("/api/v1/demands")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Chantier Frankenstein v2" })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it("trouve projets et tâches par sous-chaîne (nom, titre, description)", async () => {
    const byName = await request(server())
      .get("/api/v1/search?q=franken")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(byName.body.projects).toHaveLength(1);
    expect(byName.body.projects[0].name).toBe("Migration Frankenstein");
    expect(byName.body.tasks).toHaveLength(1);
    expect(byName.body.tasks[0].project.code).toBeDefined();
    // La recherche indexe aussi les demandes (référence DEMDxxxxx)
    expect(byName.body.demands).toHaveLength(1);
    expect(byName.body.demands[0].reference).toMatch(/^DEMD\d{5}$/);
    expect(byName.body.demands[0].projectId).toBeNull();

    const byDescription = await request(server())
      .get("/api/v1/search?q=monolithe")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(byDescription.body.projects).toHaveLength(1);
    expect(byDescription.body.tasks).toHaveLength(0);
  });

  it("trouve un projet par son numéro PROJxxxxx (complet ou partiel)", async () => {
    const projects = await request(server())
      .get("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const target = projects.body.items[0];
    expect(target.code).toMatch(/^PROJ\d{5}$/);

    // Numéro complet
    const exact = await request(server())
      .get(`/api/v1/search?q=${target.code}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(exact.body.projects.some((p: { id: string }) => p.id === target.id)).toBe(true);

    // Recherche partielle sur la séquence (ex. « 0001 »)
    const partial = await request(server())
      .get(`/api/v1/search?q=${target.code.slice(-4)}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(partial.body.projects.some((p: { id: string }) => p.id === target.id)).toBe(true);
  });

  it("refuse une requête trop courte (400) et exige un jeton (401)", async () => {
    await request(server())
      .get("/api/v1/search?q=a")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
    await request(server()).get("/api/v1/search?q=franken").expect(401);
  });

  it("n'expose rien aux autres organisations", async () => {
    const response = await request(server())
      .get("/api/v1/search?q=franken")
      .set("Authorization", `Bearer ${otherOrgToken}`)
      .expect(200);
    expect(response.body.projects).toHaveLength(0);
    expect(response.body.tasks).toHaveLength(0);
    expect(response.body.demands).toHaveLength(0);
  });
});
