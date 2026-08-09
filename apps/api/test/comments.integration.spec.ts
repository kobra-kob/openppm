import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

describe("Commentaires + notifications (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string; // Alice (créatrice/manager du projet)
  let memberToken: string; // Bob (membre)
  let memberId: string;
  let observerToken: string; // Olivia (observatrice)
  let otherOrgToken: string;
  let projectId: string;
  let taskId: string;

  const server = () => app.getHttpServer();

  const addMember = async (
    org: { id: string },
    email: string,
    firstName: string,
    passwordHash: string,
    role: string,
  ): Promise<{ id: string; token: string }> => {
    const employeeRole = await prisma.role.findUniqueOrThrow({ where: { key: "employee" } });
    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
        email,
        passwordHash,
        firstName,
        lastName: "Test",
        userRoles: { create: { roleId: employeeRole.id } },
      },
    });
    await request(server())
      .post(`/api/v1/projects/${projectId}/members`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: user.id, role })
      .expect(201);
    const login = await request(server())
      .post("/api/v1/auth/login")
      .send({ email, password: "SuperSecret123" })
      .expect(200);
    return { id: user.id, token: login.body.accessToken };
  };

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
      organizationName: "Comment Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@comment.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const other = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Autre Comment",
      firstName: "Zoe",
      lastName: "Zephyr",
      email: "zoe@comment.test",
      password: "SuperSecret123",
    });
    otherOrgToken = other.body.accessToken;

    const project = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Projet commentaires" })
      .expect(201);
    projectId = project.body.id;

    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug: "comment-corp" },
    });
    const alice = await prisma.user.findUniqueOrThrow({
      where: { email: "alice@comment.test" },
    });
    const bob = await addMember(org, "bob@comment.test", "Bob", alice.passwordHash, "member");
    memberId = bob.id;
    memberToken = bob.token;
    const olivia = await addMember(org, "olivia@comment.test", "Olivia", alice.passwordHash, "observer");
    observerToken = olivia.token;

    // Tâche assignée à Bob (watcher)
    const task = await request(server())
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Rédiger la spec", assigneeIds: [memberId] })
      .expect(201);
    taskId = task.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const commentsUrl = () => `/api/v1/projects/${projectId}/tasks/${taskId}/comments`;

  it("assigner une tâche notifie l'assigné (in-app)", async () => {
    const notifs = await request(server())
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(200);
    expect(notifs.body.unread).toBeGreaterThanOrEqual(1);
    expect(
      notifs.body.items.some((n: { type: string }) => n.type === "task.assigned"),
    ).toBe(true);
  });

  it("un observateur ne peut pas commenter (403), un membre oui", async () => {
    await request(server())
      .post(commentsUrl())
      .set("Authorization", `Bearer ${observerToken}`)
      .send({ body: "Interdit" })
      .expect(403);

    const created = await request(server())
      .post(commentsUrl())
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ body: "Première remarque" })
      .expect(201);
    expect(created.body.author.name).toBe("Bob Test");
    expect(created.body.editable).toBe(true);
  });

  it("un commentaire notifie les watchers (créatrice), hors auteur", async () => {
    await request(server())
      .post(commentsUrl())
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ body: "Question pour l'équipe" })
      .expect(201);

    const aliceNotifs = await request(server())
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(
      aliceNotifs.body.items.some((n: { type: string }) => n.type === "task.comment"),
    ).toBe(true);

    // L'auteur (Bob) ne se notifie pas lui-même
    const bobNotifs = await request(server())
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(200);
    expect(
      bobNotifs.body.items.some((n: { type: string }) => n.type === "task.comment"),
    ).toBe(false);
  });

  it("une mention @membre déclenche une notification task.mention", async () => {
    await request(server())
      .post(commentsUrl())
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ body: "Regarde ça @Bob", mentions: [memberId] })
      .expect(201);

    const bobNotifs = await request(server())
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(200);
    const mention = bobNotifs.body.items.find(
      (n: { type: string }) => n.type === "task.mention",
    );
    expect(mention).toBeDefined();
    expect(mention.payload.authorName).toBe("Alice Admin");
  });

  it("ignore une mention qui n'est pas membre du projet", async () => {
    const zoe = await prisma.user.findUniqueOrThrow({
      where: { email: "zoe@comment.test" },
    });
    const created = await request(server())
      .post(commentsUrl())
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ body: "Mention externe", mentions: [zoe.id] })
      .expect(201);
    expect(created.body.mentions).toHaveLength(0);
  });

  it("liste les commentaires dans l'ordre et marque une notification lue", async () => {
    const list = await request(server())
      .get(commentsUrl())
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(200);
    expect(list.body.length).toBeGreaterThanOrEqual(3);

    const notifs = await request(server())
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(200);
    const firstId = notifs.body.items[0].id;
    await request(server())
      .post(`/api/v1/notifications/${firstId}/read`)
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(204);
    const after = await request(server())
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(200);
    expect(after.body.unread).toBeLessThan(notifs.body.unread);

    await request(server())
      .post("/api/v1/notifications/read-all")
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(204);
    const cleared = await request(server())
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(200);
    expect(cleared.body.unread).toBe(0);
  });

  it("l'auteur supprime son commentaire ; interdit pour un tiers non responsable", async () => {
    const created = await request(server())
      .post(commentsUrl())
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ body: "À supprimer" })
      .expect(201);
    // Impossible depuis une autre organisation
    await request(server())
      .delete(`${commentsUrl()}/${created.body.id}`)
      .set("Authorization", `Bearer ${otherOrgToken}`)
      .expect(404);
    // L'auteur supprime
    await request(server())
      .delete(`${commentsUrl()}/${created.body.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(204);
  });

  it("le fil de commentaires est invisible aux autres organisations (404)", async () => {
    await request(server())
      .get(commentsUrl())
      .set("Authorization", `Bearer ${otherOrgToken}`)
      .expect(404);
  });
});
