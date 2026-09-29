import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/** Module Ressources : ressources, tarifs, affectation aux tâches, durée & coûts. */
describe("Ressources (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let projectId: string;

  const server = () => app.getHttpServer();
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  const newTask = async (title: string, startDate: string, dueDate: string): Promise<string> => {
    const res = await request(server())
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set(auth())
      .send({ title, startDate, dueDate })
      .expect(201);
    return res.body.id;
  };

  const newResource = async (
    firstName: string,
    unit: "DAY" | "HOUR",
    amount: number,
  ): Promise<string> => {
    const res = await request(server())
      .post("/api/v1/resources")
      .set(auth())
      .send({
        firstName,
        lastName: "Test",
        resourceType: "CONTRACTOR",
        company: "ABC",
        rate: { amount, unit, currency: "EUR" },
      })
      .expect(201);
    return res.body.id;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    const admin = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Resource Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@res.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const project = await request(server())
      .post("/api/v1/projects")
      .set(auth())
      .send({ name: "Migration ERP" })
      .expect(201);
    projectId = project.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("crée une ressource avec tarif et la liste", async () => {
    const id = await newResource("Jean", "DAY", 650);
    const detail = await request(server()).get(`/api/v1/resources/${id}`).set(auth()).expect(200);
    expect(detail.body.resource.name).toBe("Jean Test");
    expect(detail.body.resource.rate).toEqual({ amount: 650, unit: "DAY", currency: "EUR" });

    const list = await request(server()).get("/api/v1/resources").set(auth()).expect(200);
    expect(list.body.map((r: { id: string }) => r.id)).toContain(id);
  });

  it("tarif journalier : 5 jours × 650 = 3250 €", async () => {
    const taskId = await newTask("Architecture", "2026-10-01", "2026-10-05");
    const resourceId = await newResource("Paul", "DAY", 650);
    const res = await request(server())
      .post(`/api/v1/projects/${projectId}/tasks/${taskId}/resources`)
      .set(auth())
      .send({ resourceId })
      .expect(201);
    expect(res.body.durationDays).toBe(5);
    expect(res.body.resources[0].allocationDays).toBe(5);
    expect(res.body.resources[0].cost).toBe(3250);
    expect(res.body.totalCost).toBe(3250);
  });

  it("tarif horaire : 3 jours × 8 h × 85 = 2040 €", async () => {
    const taskId = await newTask("Audit", "2026-10-01", "2026-10-03");
    const resourceId = await newResource("Marie", "HOUR", 85);
    const res = await request(server())
      .post(`/api/v1/projects/${projectId}/tasks/${taskId}/resources`)
      .set(auth())
      .send({ resourceId })
      .expect(201);
    expect(res.body.durationDays).toBe(3);
    expect(res.body.resources[0].cost).toBe(2040);
  });

  it("plusieurs ressources sur une tâche : coût total additionné", async () => {
    const taskId = await newTask("Conception", "2026-10-01", "2026-10-05"); // 5 jours
    const jean = await newResource("JeanMulti", "DAY", 650); // 5 × 650 = 3250
    const marie = await newResource("MarieMulti", "HOUR", 75); // 5 × 8 × 75 = 3000
    await request(server())
      .post(`/api/v1/projects/${projectId}/tasks/${taskId}/resources`)
      .set(auth())
      .send({ resourceId: jean })
      .expect(201);
    const res = await request(server())
      .post(`/api/v1/projects/${projectId}/tasks/${taskId}/resources`)
      .set(auth())
      .send({ resourceId: marie })
      .expect(201);
    expect(res.body.totalCost).toBe(6250);
  });

  it("changement de date de fin → durée et coût recalculés", async () => {
    const taskId = await newTask("Dev", "2026-10-01", "2026-10-05"); // 5 jours
    const resourceId = await newResource("Sam", "DAY", 100);
    await request(server())
      .post(`/api/v1/projects/${projectId}/tasks/${taskId}/resources`)
      .set(auth())
      .send({ resourceId })
      .expect(201);
    // Décale la fin au 07/10 → 7 jours
    await request(server())
      .patch(`/api/v1/projects/${projectId}/tasks/${taskId}`)
      .set(auth())
      .send({ dueDate: "2026-10-07" })
      .expect(200);
    const res = await request(server())
      .get(`/api/v1/projects/${projectId}/tasks/${taskId}/resources`)
      .set(auth())
      .expect(200);
    expect(res.body.durationDays).toBe(7);
    expect(res.body.totalCost).toBe(700);
  });

  it("retrait de l'affectation : la ressource et son coût disparaissent de la tâche", async () => {
    const taskId = await newTask("Tests", "2026-10-01", "2026-10-02");
    const resourceId = await newResource("Léa", "DAY", 500);
    await request(server())
      .post(`/api/v1/projects/${projectId}/tasks/${taskId}/resources`)
      .set(auth())
      .send({ resourceId })
      .expect(201);
    const removed = await request(server())
      .delete(`/api/v1/projects/${projectId}/tasks/${taskId}/resources/${resourceId}`)
      .set(auth())
      .expect(200);
    expect(removed.body.resources).toHaveLength(0);
    expect(removed.body.totalCost).toBe(0);
  });

  it("coût total des ressources du projet (agrégé par ressource)", async () => {
    const cost = await request(server())
      .get(`/api/v1/projects/${projectId}/resources`)
      .set(auth())
      .expect(200);
    expect(cost.body.totalCost).toBeGreaterThan(0);
    expect(cost.body.resourceCount).toBeGreaterThan(0);
    expect(Array.isArray(cost.body.perResource)).toBe(true);
  });

  it("surcharge : deux tâches qui se chevauchent pour une même ressource sont signalées", async () => {
    const resourceId = await newResource("Chevauche", "DAY", 400);
    const a = await newTask("Tâche A", "2026-11-01", "2026-11-05");
    const b = await newTask("Tâche B", "2026-11-03", "2026-11-07");
    for (const taskId of [a, b]) {
      await request(server())
        .post(`/api/v1/projects/${projectId}/tasks/${taskId}/resources`)
        .set(auth())
        .send({ resourceId })
        .expect(201);
    }
    const detail = await request(server()).get(`/api/v1/resources/${resourceId}`).set(auth()).expect(200);
    expect(detail.body.overallocations.length).toBeGreaterThanOrEqual(1);
    expect(detail.body.totalAllocatedDays).toBe(10); // 5 + 5
  });

  it("une ressource archivée ne peut plus être affectée (400)", async () => {
    const resourceId = await newResource("Archivée", "DAY", 300);
    await request(server()).post(`/api/v1/resources/${resourceId}/archive`).set(auth()).expect(201);
    const taskId = await newTask("Nouvelle", "2026-12-01", "2026-12-02");
    const res = await request(server())
      .post(`/api/v1/projects/${projectId}/tasks/${taskId}/resources`)
      .set(auth())
      .send({ resourceId })
      .expect(400);
    expect(res.body.code).toBe("RESOURCE_INACTIVE");
  });

  it("isolation tenant : une ressource d'une autre organisation est invisible (404)", async () => {
    const other = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Autre Corp",
      firstName: "Bob",
      lastName: "B",
      email: "bob@autre.test",
      password: "SuperSecret123",
    });
    const otherToken = other.body.accessToken;
    const foreign = await request(server())
      .post("/api/v1/resources")
      .set({ Authorization: `Bearer ${otherToken}` })
      .send({ firstName: "Étranger", lastName: "X", resourceType: "OTHER" })
      .expect(201);
    await request(server()).get(`/api/v1/resources/${foreign.body.id}`).set(auth()).expect(404);
  });

  it("exige un jeton (401)", async () => {
    await request(server()).get("/api/v1/resources").expect(401);
  });
});
