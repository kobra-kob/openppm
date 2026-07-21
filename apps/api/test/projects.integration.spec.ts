import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";

describe("Projects (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string; // admin org Alpha
  let employeeToken: string; // employé org Alpha
  let employeeId: string;
  let otherOrgToken: string; // admin org Beta

  const server = () => app.getHttpServer();

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
      organizationName: "Alpha Projets",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@projets.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;

    const other = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Beta Projets",
      firstName: "Bob",
      lastName: "Boss",
      email: "bob@projets.test",
      password: "SuperSecret123",
    });
    otherOrgToken = other.body.accessToken;

    // Employé dans l'org Alpha, créé via invitation directe en base
    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug: "alpha-projets" },
    });
    const employeeRole = await prisma.role.findUniqueOrThrow({
      where: { key: "employee" },
    });
    const employee = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: "emma@projets.test",
        passwordHash: (await prisma.user.findUniqueOrThrow({
          where: { email: "alice@projets.test" },
        })).passwordHash, // même mot de passe : SuperSecret123
        firstName: "Emma",
        lastName: "Employée",
        userRoles: { create: { roleId: employeeRole.id } },
      },
    });
    employeeId = employee.id;
    const login = await request(server())
      .post("/api/v1/auth/login")
      .send({ email: "emma@projets.test", password: "SuperSecret123" })
      .expect(200);
    employeeToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  let projectId: string;

  describe("création", () => {
    it("crée un projet avec code auto-généré ; le créateur est membre manager", async () => {
      const response = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Refonte CRM",
          description: "Migration vers le nouveau CRM",
          priority: 2,
          startDate: "2026-09-01",
          endDate: "2027-03-31",
          budget: 250000,
        })
        .expect(201);
      expect(response.body.code).toBe("P-0001");
      expect(response.body.status).toBe("draft");
      expect(response.body.members).toHaveLength(1);
      expect(response.body.members[0].role).toBe("manager");
      expect(response.body.allowedTransitions).toEqual(["active", "archived"]);
      projectId = response.body.id;
    });

    it("accepte un code personnalisé et refuse les doublons (409)", async () => {
      await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Projet codé", code: "crm-2026" })
        .expect(201)
        .then((response) => expect(response.body.code).toBe("CRM-2026"));
      const dup = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Doublon", code: "CRM-2026" })
        .expect(409);
      expect(dup.body.code).toBe("CODE_ALREADY_USED");
    });

    it("refuse une plage de dates incohérente (400)", async () => {
      const response = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Dates KO", startDate: "2027-01-01", endDate: "2026-01-01" })
        .expect(400);
      expect(response.body.code).toBe("INVALID_DATE_RANGE");
    });

    it("un employé ne peut pas créer de projet (403)", async () => {
      await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ name: "Interdit" })
        .expect(403);
    });
  });

  describe("lecture et isolation", () => {
    it("liste paginée avec recherche", async () => {
      const response = await request(server())
        .get("/api/v1/projects?search=CRM&page=1&pageSize=10")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(response.body.total).toBe(2);
      expect(response.body.items.map((p: { code: string }) => p.code)).toContain("P-0001");
    });

    it("scope=mine ne montre que les projets où l'on est impliqué", async () => {
      // Emma (employée) n'est membre d'aucun projet pour l'instant
      const mine = await request(server())
        .get("/api/v1/projects?scope=mine")
        .set("Authorization", `Bearer ${employeeToken}`)
        .expect(200);
      expect(mine.body.total).toBe(0);
      // Alice a tout créé : elle voit tout en scope=mine
      const alice = await request(server())
        .get("/api/v1/projects?scope=mine")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(alice.body.total).toBeGreaterThan(0);
    });

    it("sort=recent trie par dernière modification", async () => {
      await request(server())
        .patch(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ description: "touché pour remonter" })
        .expect(200);
      const response = await request(server())
        .get("/api/v1/projects?sort=recent")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(response.body.items[0].id).toBe(projectId);
    });

    it("une autre organisation ne voit rien (isolation)", async () => {
      const list = await request(server())
        .get("/api/v1/projects")
        .set("Authorization", `Bearer ${otherOrgToken}`)
        .expect(200);
      expect(list.body.total).toBe(0);
      await request(server())
        .get(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${otherOrgToken}`)
        .expect(404);
    });
  });

  describe("cycle de vie", () => {
    it("refuse une transition interdite (draft → completed)", async () => {
      const response = await request(server())
        .patch(`/api/v1/projects/${projectId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "completed" })
        .expect(400);
      expect(response.body.code).toBe("INVALID_STATUS_TRANSITION");
      expect(response.body.allowed).toEqual(["active", "archived"]);
    });

    it("draft → active → on_hold → active", async () => {
      for (const status of ["active", "on_hold", "active"]) {
        const response = await request(server())
          .patch(`/api/v1/projects/${projectId}/status`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ status })
          .expect(200);
        expect(response.body.status).toBe(status);
      }
    });

    it("un employé non membre ne peut pas changer l'état (403)", async () => {
      await request(server())
        .patch(`/api/v1/projects/${projectId}/status`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ status: "on_hold" })
        .expect(403);
    });
  });

  describe("mise à jour et membres", () => {
    it("met à jour les champs et la santé", async () => {
      const response = await request(server())
        .patch(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ health: "amber", priority: 1, budget: 300000 })
        .expect(200);
      expect(response.body.health).toBe("amber");
      expect(response.body.priority).toBe(1);
      expect(Number(response.body.budget)).toBe(300000);
    });

    it("ajoute un membre, change son rôle, l'édition lui devient possible", async () => {
      const added = await request(server())
        .post(`/api/v1/projects/${projectId}/members`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ userId: employeeId, role: "member" })
        .expect(201);
      expect(added.body.members).toHaveLength(2);

      // Simple membre : toujours pas le droit d'éditer
      await request(server())
        .patch(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ name: "Tentative" })
        .expect(403);

      await request(server())
        .patch(`/api/v1/projects/${projectId}/members/${employeeId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "manager" })
        .expect(200);

      // Devenu manager du projet : édition autorisée
      await request(server())
        .patch(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ name: "Refonte CRM v2" })
        .expect(200);
    });

    it("refuse un doublon de membre (409) et un inconnu (404 à la suppression)", async () => {
      await request(server())
        .post(`/api/v1/projects/${projectId}/members`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ userId: employeeId })
        .expect(409);
      await request(server())
        .delete(`/api/v1/projects/${projectId}/members/00000000-0000-7000-8000-000000000000`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe("activité", () => {
    it("expose l'historique des actions du projet", async () => {
      const response = await request(server())
        .get(`/api/v1/projects/${projectId}/activity`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      const actions = response.body.map((entry: { action: string }) => entry.action);
      expect(actions).toContain("project.created");
      expect(actions).toContain("project.status_changed");
      expect(actions).toContain("project.member_added");
      expect(response.body[0].actorName).toBeDefined();
    });
  });

  describe("corbeille", () => {
    it("supprime (soft), n'apparaît plus, se restaure", async () => {
      await request(server())
        .delete(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(204);

      await request(server())
        .get(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);

      const trash = await request(server())
        .get("/api/v1/projects/trash")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(trash.body.map((p: { id: string }) => p.id)).toContain(projectId);

      const restored = await request(server())
        .post(`/api/v1/projects/${projectId}/restore`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(201);
      expect(restored.body.deletedAt).toBeNull();

      await request(server())
        .get(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
    });

    it("la corbeille est réservée aux rôles transverses (403 employé)", async () => {
      await request(server())
        .get("/api/v1/projects/trash")
        .set("Authorization", `Bearer ${employeeToken}`)
        .expect(403);
    });
  });
});
