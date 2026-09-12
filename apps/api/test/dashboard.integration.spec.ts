import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/** Tableau de bord global du tenant : agrégats org-scopés (projets, demandes, livraisons). */
describe("Tableau de bord global (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    const admin = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Dash Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@dash.test",
      password: "SuperSecret123",
    });
    token = admin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("exige un jeton (401)", async () => {
    await request(server()).get("/api/v1/dashboard").expect(401);
  });

  it("org neuve : compteurs à zéro, 6 trimestres, 1 membre", async () => {
    const res = await request(server())
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.totalProjects).toBe(0);
    expect(res.body.activeProjects).toBe(0);
    expect(res.body.completedProjects).toBe(0);
    expect(res.body.completionRate).toBe(0);
    expect(res.body.portfolios).toBe(0);
    expect(res.body.totalDemands).toBe(0);
    expect(res.body.pendingDemands).toBe(0);
    expect(res.body.engagedBudget).toBe(0);
    expect(res.body.consumedBudget).toBe(0);
    expect(res.body.memberCount).toBe(1);
    expect(res.body.openTasks).toBe(0);
    expect(res.body.overdueProjects).toBe(0);
    expect(res.body.projectsAtRisk).toBe(0);
    expect(res.body.objectivesRatio).toBe(0);
    expect(res.body.projectsByHealth).toEqual({ green: 0, amber: 0, red: 0 });
    expect(res.body.deliveriesByQuarter).toHaveLength(6);
    // Les trimestres sont ordonnés du plus ancien au plus récent.
    const quarters = res.body.deliveriesByQuarter as Array<{ key: string; count: number }>;
    expect(quarters.every((q) => q.count === 0)).toBe(true);
  });

  it("un projet créé est compté dans le total et la répartition par statut", async () => {
    await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Projet tableau de bord" })
      .expect(201);

    const res = await request(server())
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.totalProjects).toBe(1);
    const byStatus = res.body.projectsByStatus as Record<string, number>;
    const sum = Object.values(byStatus).reduce((acc, n) => acc + n, 0);
    expect(sum).toBe(1);
  });

  it("les livraisons du trimestre courant suivent les tâches terminées", async () => {
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "dash-corp" } });
    const project = await prisma.project.findFirstOrThrow({ where: { organizationId: org.id } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@dash.test" } });
    // Une tâche terminée aujourd'hui (completedAt dans le trimestre courant).
    await prisma.task.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        title: "Livrable",
        status: "done",
        completedAt: new Date(),
        createdById: alice.id,
      },
    });

    const res = await request(server())
      .get("/api/v1/dashboard")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const quarters = res.body.deliveriesByQuarter as Array<{ count: number }>;
    // Le dernier bucket est le trimestre courant → au moins 1 livraison.
    expect(quarters[quarters.length - 1]!.count).toBe(1);
    expect(res.body.objectivesRatio).toBe(100);
  });
});
