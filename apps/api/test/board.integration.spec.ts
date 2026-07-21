import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";

describe("Board Kanban (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let otherOrgToken: string;
  let projectId: string;
  let taskA: string;
  let taskB: string;
  let columns: Array<{ id: string; name: string; mapsToStatus: string | null }>;

  const server = () => app.getHttpServer();
  const base = () => `/api/v1/projects/${projectId}/board`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

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
    await prisma.organization.deleteMany();

    const admin = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Board Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@board.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const other = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Autre Board",
      firstName: "Bob",
      lastName: "Boss",
      email: "bob@board.test",
      password: "SuperSecret123",
    });
    otherOrgToken = other.body.accessToken;

    const project = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Projet board" })
      .expect(201);
    projectId = project.body.id;

    const a = await request(server())
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Carte A" })
      .expect(201);
    taskA = a.body.id;
    const b = await request(server())
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Carte B" })
      .expect(201);
    taskB = b.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("crée le board par défaut au premier accès (3 colonnes mappées)", async () => {
    const response = await request(server())
      .get(base())
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    columns = response.body.columns;
    expect(columns.map((column) => column.name)).toEqual([
      "À faire",
      "En cours",
      "Terminé",
    ]);
    expect(columns.map((column) => column.mapsToStatus)).toEqual([
      "todo",
      "in_progress",
      "done",
    ]);
    // Les deux cartes todo sont dans la première colonne
    expect(response.body.columns[0].cards).toHaveLength(2);
  });

  it("le board est invisible pour une autre organisation (404)", async () => {
    await request(server())
      .get(base())
      .set("Authorization", `Bearer ${otherOrgToken}`)
      .expect(404);
  });

  it("déplacer une carte change sa colonne ET son statut (done → completedAt)", async () => {
    const doneColumn = columns.find((column) => column.mapsToStatus === "done")!;
    const view = await request(server())
      .post(`${base()}/move`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ taskId: taskA, columnId: doneColumn.id, position: 0 })
      .expect(201);
    const done = view.body.columns.find(
      (column: { id: string }) => column.id === doneColumn.id,
    );
    expect(done.cards.map((card: { id: string }) => card.id)).toContain(taskA);

    const task = await request(server())
      .get(`/api/v1/projects/${projectId}/tasks/${taskA}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(task.body.status).toBe("done");
    expect(task.body.completedAt).not.toBeNull();
  });

  it("un statut changé hors board reclasse la carte (le statut gagne)", async () => {
    await request(server())
      .patch(`/api/v1/projects/${projectId}/tasks/${taskA}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "in_progress" })
      .expect(200);
    const view = await request(server())
      .get(base())
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const inProgress = view.body.columns.find(
      (column: { mapsToStatus: string }) => column.mapsToStatus === "in_progress",
    );
    expect(inProgress.cards.map((card: { id: string }) => card.id)).toContain(taskA);
  });

  it("réordonne les cartes au sein d'une colonne", async () => {
    const todoColumn = columns.find((column) => column.mapsToStatus === "todo")!;
    // Ramener A en tête de À faire (B y est déjà)
    await request(server())
      .post(`${base()}/move`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ taskId: taskA, columnId: todoColumn.id, position: 0 })
      .expect(201);
    const view = await request(server())
      .get(base())
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const todo = view.body.columns.find(
      (column: { id: string }) => column.id === todoColumn.id,
    );
    expect(todo.cards.map((card: { id: string }) => card.id)).toEqual([taskA, taskB]);

    // Redescendre A sous B
    await request(server())
      .post(`${base()}/move`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ taskId: taskA, columnId: todoColumn.id, position: 1 })
      .expect(201);
    const after = await request(server())
      .get(base())
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const todoAfter = after.body.columns.find(
      (column: { id: string }) => column.id === todoColumn.id,
    );
    expect(todoAfter.cards.map((card: { id: string }) => card.id)).toEqual([taskB, taskA]);
  });

  it("gère les colonnes : ajout avec WIP, renommage, suppression (cartes reversées)", async () => {
    const added = await request(server())
      .post(`${base()}/columns`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Revue", wipLimit: 2 })
      .expect(201);
    const review = added.body.columns.find(
      (column: { name: string }) => column.name === "Revue",
    );
    expect(review.wipLimit).toBe(2);

    // Déposer A dans Revue (pas de mapping → statut inchangé)
    await request(server())
      .post(`${base()}/move`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ taskId: taskA, columnId: review.id, position: 0 })
      .expect(201);
    const task = await request(server())
      .get(`/api/v1/projects/${projectId}/tasks/${taskA}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(task.body.status).toBe("todo");

    await request(server())
      .patch(`${base()}/columns/${review.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Code review", wipLimit: null })
      .expect(200);

    // Suppression : A (todo) retourne dans la colonne À faire
    const view = await request(server())
      .delete(`${base()}/columns/${review.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const todo = view.body.columns.find(
      (column: { mapsToStatus: string }) => column.mapsToStatus === "todo",
    );
    expect(todo.cards.map((card: { id: string }) => card.id)).toContain(taskA);
  });

  it("refuse de supprimer la dernière colonne (400)", async () => {
    const view = await request(server())
      .get(base())
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const ids = view.body.columns.map((column: { id: string }) => column.id);
    for (const id of ids.slice(0, -1)) {
      await request(server())
        .delete(`${base()}/columns/${id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
    }
    const last = await request(server())
      .delete(`${base()}/columns/${ids[ids.length - 1]}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
    expect(last.body.code).toBe("LAST_COLUMN");
  });
});
