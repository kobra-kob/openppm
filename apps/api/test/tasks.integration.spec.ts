import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

describe("Tasks (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let observerToken: string;
  let observerId: string;
  let otherOrgToken: string;
  let projectId: string;

  const server = () => app.getHttpServer();
  const base = () => `/api/v1/projects/${projectId}/tasks`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await resetDatabase(prisma);

    const admin = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Tasks Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@tasks.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;

    const other = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Autre Tasks",
      firstName: "Bob",
      lastName: "Boss",
      email: "bob@tasks.test",
      password: "SuperSecret123",
    });
    otherOrgToken = other.body.accessToken;

    // Observateur dans l'org (créé en base, même hash de mot de passe)
    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug: "tasks-corp" },
    });
    const alice = await prisma.user.findUniqueOrThrow({
      where: { email: "alice@tasks.test" },
    });
    const employeeRole = await prisma.role.findUniqueOrThrow({
      where: { key: "employee" },
    });
    const observer = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: "olivia@tasks.test",
        passwordHash: alice.passwordHash,
        firstName: "Olivia",
        lastName: "Observatrice",
        userRoles: { create: { roleId: employeeRole.id } },
      },
    });
    observerId = observer.id;
    const login = await request(server())
      .post("/api/v1/auth/login")
      .send({ email: "olivia@tasks.test", password: "SuperSecret123" })
      .expect(200);
    observerToken = login.body.accessToken;

    const project = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Projet tâches" })
      .expect(201);
    projectId = project.body.id;

    // Olivia rejoint le projet comme observatrice
    await request(server())
      .post(`/api/v1/projects/${projectId}/members`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: observerId, role: "observer" })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  let rootId: string;
  let subId: string;
  let otherTaskId: string;

  describe("création et hiérarchie", () => {
    it("crée une tâche avec assigné (membre du projet)", async () => {
      const alice = await prisma.user.findUniqueOrThrow({
        where: { email: "alice@tasks.test" },
      });
      const response = await request(server())
        .post(base())
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: "Spécifier le module paiement",
          priority: 2,
          startDate: "2026-11-02",
          dueDate: "2026-11-20",
          estimateHours: 16,
          assigneeIds: [alice.id],
        })
        .expect(201);
      rootId = response.body.id;
      expect(response.body.status).toBe("todo");
      expect(response.body.assignees).toHaveLength(1);
      expect(response.body.position).toBe(1);
    });

    it("crée une sous-tâche rattachée au parent", async () => {
      const response = await request(server())
        .post(base())
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ title: "Rédiger le contrat d'API", parentId: rootId })
        .expect(201);
      subId = response.body.id;
      expect(response.body.parentId).toBe(rootId);

      const list = await request(server())
        .get(base())
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      const root = list.body.find((task: { id: string }) => task.id === rootId);
      expect(root.subtaskCount).toBe(1);
    });

    it("refuse un parent inexistant (400) et un assigné hors projet (400)", async () => {
      await request(server())
        .post(base())
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ title: "X", parentId: "00000000-0000-7000-8000-000000000000" })
        .expect(400);
      const bob = await prisma.user.findUniqueOrThrow({
        where: { email: "bob@tasks.test" },
      });
      const response = await request(server())
        .post(base())
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ title: "X", assigneeIds: [bob.id] })
        .expect(400);
      expect(response.body.code).toBe("ASSIGNEE_NOT_PROJECT_MEMBER");
    });

    it("un observateur du projet ne peut pas créer (403) mais peut lire (200)", async () => {
      await request(server())
        .post(base())
        .set("Authorization", `Bearer ${observerToken}`)
        .send({ title: "Interdit" })
        .expect(403);
      await request(server())
        .get(base())
        .set("Authorization", `Bearer ${observerToken}`)
        .expect(200);
    });

    it("le projet est invisible pour une autre organisation (404)", async () => {
      await request(server())
        .get(base())
        .set("Authorization", `Bearer ${otherOrgToken}`)
        .expect(404);
    });
  });

  describe("statut", () => {
    it("done fixe completedAt, la réouverture l'efface", async () => {
      const done = await request(server())
        .patch(`${base()}/${subId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "done" })
        .expect(200);
      expect(done.body.completedAt).not.toBeNull();

      const reopened = await request(server())
        .patch(`${base()}/${subId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "in_progress" })
        .expect(200);
      expect(reopened.body.completedAt).toBeNull();
    });
  });

  describe("checklist", () => {
    it("ajoute, coche et compte les éléments", async () => {
      const item = await request(server())
        .post(`${base()}/${rootId}/checklist`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ label: "Valider le schéma" })
        .expect(201);
      await request(server())
        .post(`${base()}/${rootId}/checklist`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ label: "Relire la doc" })
        .expect(201);
      await request(server())
        .patch(`${base()}/${rootId}/checklist/${item.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isDone: true })
        .expect(200);

      const detail = await request(server())
        .get(`${base()}/${rootId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.checklistTotal).toBe(2);
      expect(detail.body.checklistDone).toBe(1);
    });
  });

  describe("dépendances", () => {
    it("ajoute un prérequis et refuse doublon (409) et cycle (400)", async () => {
      const third = await request(server())
        .post(base())
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ title: "Développer le paiement" })
        .expect(201);
      otherTaskId = third.body.id;

      await request(server())
        .post(`${base()}/${otherTaskId}/dependencies`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ predecessorId: rootId })
        .expect(201);

      await request(server())
        .post(`${base()}/${otherTaskId}/dependencies`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ predecessorId: rootId })
        .expect(409);

      // rootId dépendrait de otherTaskId qui dépend déjà de rootId → cycle
      const cycle = await request(server())
        .post(`${base()}/${rootId}/dependencies`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ predecessorId: otherTaskId })
        .expect(400);
      expect(cycle.body.code).toBe("DEPENDENCY_CYCLE");
    });

    it("expose prédécesseurs et successeurs dans le détail, puis retire", async () => {
      const detail = await request(server())
        .get(`${base()}/${otherTaskId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.predecessors).toHaveLength(1);
      expect(detail.body.predecessors[0].taskId).toBe(rootId);

      const rootDetail = await request(server())
        .get(`${base()}/${rootId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(rootDetail.body.successors[0].taskId).toBe(otherTaskId);

      await request(server())
        .delete(`${base()}/${otherTaskId}/dependencies/${rootId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe("temps passé", () => {
    it("saisit du temps et agrège le total", async () => {
      await request(server())
        .post(`${base()}/${rootId}/time`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ spentOn: "2026-11-05", hours: 3.5, note: "Ateliers" })
        .expect(201);
      const detail = await request(server())
        .post(`${base()}/${rootId}/time`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ spentOn: "2026-11-06", hours: 2 })
        .expect(201);
      expect(detail.body.timeSpentHours).toBe(5.5);
      expect(detail.body.timeEntries).toHaveLength(2);
    });

    it("refuse une saisie hors bornes (400)", async () => {
      await request(server())
        .post(`${base()}/${rootId}/time`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ spentOn: "2026-11-05", hours: 30 })
        .expect(400);
    });

    it("supprime sa propre saisie", async () => {
      const detail = await request(server())
        .get(`${base()}/${rootId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      const entryId = detail.body.timeEntries[0].id;
      const after = await request(server())
        .delete(`${base()}/${rootId}/time/${entryId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(after.body.timeEntries).toHaveLength(1);
    });
  });

  describe("gantt", () => {
    it("expose tâches, dépendances et chemin critique (branche longue du diamant)", async () => {
      const make = (title: string, startDate: string, dueDate: string) =>
        request(server())
          .post(base())
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ title, startDate, dueDate })
          .expect(201)
          .then((response) => response.body.id as string);

      // Chaîne totale 29 j : plus longue que toute tâche datée créée plus haut
      const a = await make("G-A", "2026-12-01", "2026-12-02"); // 2 j
      const b = await make("G-B", "2026-12-03", "2026-12-27"); // 25 j
      const c = await make("G-C", "2026-12-03", "2026-12-04"); // 2 j
      const d = await make("G-D", "2026-12-28", "2026-12-29"); // 2 j
      for (const [pred, succ] of [
        [a, b],
        [a, c],
        [b, d],
        [c, d],
      ] as const) {
        await request(server())
          .post(`${base()}/${succ}/dependencies`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ predecessorId: pred })
          .expect(201);
      }

      const gantt = await request(server())
        .get(`${base()}/gantt`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(gantt.body.dependencies.length).toBeGreaterThanOrEqual(4);
      const critical: string[] = gantt.body.criticalPath;
      expect(critical).toEqual(expect.arrayContaining([a, b, d]));
      expect(critical).not.toContain(c);

      // Une autre organisation n'y accède pas
      await request(server())
        .get(`${base()}/gantt`)
        .set("Authorization", `Bearer ${otherOrgToken}`)
        .expect(404);
    });
  });

  describe("dashboard projet et mes tâches", () => {
    it("agrège statuts, retards, heures et échéances à venir", async () => {
      // Tâche en retard assignée à l'admin, avec estimation et temps saisi
      const alice = await prisma.user.findUniqueOrThrow({
        where: { email: "alice@tasks.test" },
      });
      const overdue = await request(server())
        .post(base())
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: "En retard",
          startDate: "2026-01-01",
          dueDate: "2026-01-05",
          estimateHours: 10,
          assigneeIds: [alice.id],
        })
        .expect(201);
      await request(server())
        .post(`${base()}/${overdue.body.id}/time`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ spentOn: "2026-01-03", hours: 4 })
        .expect(201);

      const dashboard = await request(server())
        .get(`/api/v1/projects/${projectId}/dashboard`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(dashboard.body.totalTasks).toBeGreaterThan(0);
      expect(dashboard.body.overdueCount).toBeGreaterThanOrEqual(1);
      expect(dashboard.body.estimateHours).toBeGreaterThanOrEqual(10);
      expect(dashboard.body.spentHours).toBeGreaterThanOrEqual(4);
      expect(dashboard.body.statusCounts.todo).toBeGreaterThanOrEqual(1);
      expect(
        dashboard.body.upcoming.map((task: { title: string }) => task.title),
      ).toContain("En retard");

      // Isolation : introuvable depuis une autre organisation
      await request(server())
        .get(`/api/v1/projects/${projectId}/dashboard`)
        .set("Authorization", `Bearer ${otherOrgToken}`)
        .expect(404);
    });

    it("liste mes tâches ouvertes avec leur projet, isolées par utilisateur", async () => {
      const mine = await request(server())
        .get("/api/v1/me/tasks")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(mine.body.length).toBeGreaterThanOrEqual(1);
      expect(mine.body[0].project.name).toBe("Projet tâches");
      expect(mine.body.map((task: { title: string }) => task.title)).toContain(
        "En retard",
      );

      const observerTasks = await request(server())
        .get("/api/v1/me/tasks")
        .set("Authorization", `Bearer ${observerToken}`)
        .expect(200);
      expect(observerTasks.body).toHaveLength(0);
    });
  });

  describe("suppression en cascade", () => {
    it("supprime la tâche et ses sous-tâches (soft delete)", async () => {
      await request(server())
        .delete(`${base()}/${rootId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(204);

      const list = await request(server())
        .get(base())
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      const ids = list.body.map((task: { id: string }) => task.id);
      expect(ids).not.toContain(rootId);
      expect(ids).not.toContain(subId);
      expect(ids).toContain(otherTaskId);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "task.deleted", entityId: rootId },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe("réordonnancement (liste + Gantt)", () => {
    let rp = "";
    const rid: string[] = [];

    it("prépare un projet avec 3 tâches (positions 1..3)", async () => {
      const project = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Réordonnancement" })
        .expect(201);
      rp = project.body.id;
      for (const title of ["Tâche A", "Tâche B", "Tâche C"]) {
        const created = await request(server())
          .post(`/api/v1/projects/${rp}/tasks`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ title })
          .expect(201);
        rid.push(created.body.id);
      }
      const list = await request(server())
        .get(`/api/v1/projects/${rp}/tasks`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.map((task: { id: string }) => task.id)).toEqual(rid);
    });

    it("réordonne (C, A, B) et la liste suit", async () => {
      const newOrder = [rid[2], rid[0], rid[1]];
      const res = await request(server())
        .patch(`/api/v1/projects/${rp}/tasks/reorder`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ orderedIds: newOrder })
        .expect(200);
      expect(res.body.map((task: { id: string }) => task.id)).toEqual(newOrder);
    });

    it("le Gantt reflète le même ordre", async () => {
      const gantt = await request(server())
        .get(`/api/v1/projects/${rp}/tasks/gantt`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(gantt.body.tasks.map((task: { id: string }) => task.id)).toEqual([
        rid[2],
        rid[0],
        rid[1],
      ]);
    });

    it("refuse une liste incomplète (400)", async () => {
      await request(server())
        .patch(`/api/v1/projects/${rp}/tasks/reorder`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ orderedIds: [rid[0]] })
        .expect(400);
    });
  });
});
