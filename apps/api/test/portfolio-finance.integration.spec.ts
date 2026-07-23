import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";

/**
 * Consolidation financière portefeuille : le module finance (budget, coûts,
 * main-d'œuvre, devis) doit remonter au portefeuille avec des chiffres
 * strictement identiques à la somme des projets — « mêmes stats partout ».
 */
describe("Consolidation financière du portefeuille (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let orgId: string;
  let userId: string;
  let portfolioId: string;
  const projectIds: string[] = [];

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

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
      organizationName: "Conso Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@conso.test",
      password: "SuperSecret123",
    });
    token = admin.body.accessToken;
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "conso-corp" } });
    orgId = org.id;
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@conso.test" } })).id;

    const portfolio = await request(server())
      .post("/api/v1/portfolios")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Programme 2026", budgetEnvelope: 500000 })
      .expect(201);
    portfolioId = portfolio.body.id;

    // Deux projets rattachés, avec des finances distinctes
    for (const name of ["Projet Alpha", "Projet Beta"]) {
      const project = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${token}`)
        .send({ name })
        .expect(201);
      projectIds.push(project.body.id);
      await request(server())
        .post(`/api/v1/portfolios/${portfolioId}/projects`)
        .set("Authorization", `Bearer ${token}`)
        .send({ projectId: project.body.id })
        .expect(201);
    }
    const alpha = projectIds[0]!;
    const beta = projectIds[1]!;

    // Budgets approuvés (pilotés normalement par la gouvernance)
    await prisma.project.update({ where: { id: alpha }, data: { budget: 200000, laborRate: 100 } });
    await prisma.project.update({ where: { id: beta }, data: { budget: 100000 } });

    // Coûts réels
    await request(server())
      .post(`/api/v1/projects/${alpha}/finance/costs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "capex", label: "Matériel", amount: 30000, incurredOn: "2026-03-01" })
      .expect(201);
    await request(server())
      .post(`/api/v1/projects/${beta}/finance/costs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "opex", label: "Licences", amount: 10000, incurredOn: "2026-03-02" })
      .expect(201);

    // Main-d'œuvre sur Alpha : 10 h × 100 € = 1000 €
    const task = await prisma.task.create({
      data: { organizationId: orgId, projectId: alpha, title: "Dev", createdById: userId },
    });
    await prisma.timeEntry.create({
      data: { organizationId: orgId, taskId: task.id, userId, spentOn: new Date("2026-03-03"), hours: 10 },
    });

    // Devis approuvé sur Alpha (relié à la finance)
    const quote = await request(server())
      .post(`/api/v1/projects/${alpha}/quotes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Devis client", vatRate: 20 })
      .expect(201);
    await request(server())
      .post(`/api/v1/projects/${alpha}/quotes/${quote.body.id}/lines`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "Prestation", quantity: 1, unitPrice: 50000 })
      .expect(201);
    await request(server())
      .post(`/api/v1/projects/${alpha}/quotes/${quote.body.id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    await request(server())
      .post(`/api/v1/projects/${alpha}/quotes/${quote.body.id}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({ approve: true })
      .expect(201);
    await request(server())
      .post(`/api/v1/projects/${alpha}/quotes/${quote.body.id}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .send({ approve: true })
      .expect(201);
    // Un second devis Beta laissé en attente (soumis)
    const pending = await request(server())
      .post(`/api/v1/projects/${beta}/quotes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Devis en cours" })
      .expect(201);
    await request(server())
      .post(`/api/v1/projects/${beta}/quotes/${pending.body.id}/lines`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "Option", quantity: 1, unitPrice: 8000 })
      .expect(201);
    await request(server())
      .post(`/api/v1/projects/${beta}/quotes/${pending.body.id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it("le devis approuvé apparaît dans la finance du projet", async () => {
    const alpha = projectIds[0]!;
    const finance = await request(server())
      .get(`/api/v1/projects/${alpha}/finance`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(finance.body.quotes.approvedCount).toBe(1);
    expect(finance.body.quotes.approvedTotalHT).toBe(50000);
    expect(finance.body.quotes.approvedTotalTTC).toBe(60000); // 50000 + 20% TVA
    // Coût réel Alpha = 30000 (matériel) + 1000 (10 h × 100 €)
    expect(finance.body.actual.total).toBe(31000);
  });

  it("la consolidation portefeuille agrège exactement la somme des projets", async () => {
    const alpha = projectIds[0]!;
    const beta = projectIds[1]!;
    const [fa, fb, conso] = await Promise.all([
      request(server()).get(`/api/v1/projects/${alpha}/finance`).set("Authorization", `Bearer ${token}`),
      request(server()).get(`/api/v1/projects/${beta}/finance`).set("Authorization", `Bearer ${token}`),
      request(server()).get(`/api/v1/portfolios/${portfolioId}/finance`).set("Authorization", `Bearer ${token}`),
    ]);

    expect(conso.body.projectCount).toBe(2);
    expect(conso.body.budgetEnvelope).toBe(500000);

    // Budget approuvé consolidé = 200000 + 100000
    expect(conso.body.approvedBudget).toBe(fa.body.approvedBudget + fb.body.approvedBudget);
    expect(conso.body.approvedBudget).toBe(300000);

    // Coût réel consolidé = somme des coûts projets (31000 + 10000)
    expect(conso.body.actual.total).toBe(fa.body.actual.total + fb.body.actual.total);
    expect(conso.body.actual.total).toBe(41000);

    // Reste disponible consolidé
    expect(conso.body.remaining).toBe(300000 - 41000);

    // Devis : 1 approuvé (50000 HT), 1 en attente
    expect(conso.body.quotes.approvedCount).toBe(1);
    expect(conso.body.quotes.pendingCount).toBe(1);
    expect(conso.body.quotes.approvedTotalHT).toBe(50000);
    expect(conso.body.quotes.approvedTotalTTC).toBe(60000);

    // Consommation de l'enveloppe = 41000 / 500000
    expect(conso.body.envelopeConsumedPct).toBe(8.2);

    // Ventilation par projet cohérente
    const rowAlpha = conso.body.projects.find((p: { id: string }) => p.id === alpha);
    expect(rowAlpha.actualTotal).toBe(31000);
    expect(rowAlpha.quotesApprovedHT).toBe(50000);
  });

  it("le résumé de tous les portefeuilles (liste) reprend les mêmes chiffres", async () => {
    const rows = await request(server())
      .get("/api/v1/finance/portfolios")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const row = rows.body.find((r: { portfolioId: string }) => r.portfolioId === portfolioId);
    expect(row).toBeDefined();
    expect(row.budgetEnvelope).toBe(500000);
    expect(row.approvedBudget).toBe(300000);
    expect(row.actualTotal).toBe(41000);
    expect(row.remaining).toBe(259000);
    expect(row.envelopeConsumedPct).toBe(8.2);
    expect(row.quotesApprovedHT).toBe(50000);
  });

  it("refuse un portefeuille inexistant (404)", async () => {
    await request(server())
      .get(`/api/v1/portfolios/019f0000-0000-7000-8000-000000000000/finance`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });
});
