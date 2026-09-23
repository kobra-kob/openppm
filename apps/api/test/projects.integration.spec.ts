import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

describe("Projects (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string; // admin org Alpha
  let employeeToken: string; // employé org Alpha
  let employeeId: string;
  let pmId: string;
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

    await resetDatabase(prisma);

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

    // Un chef de projet éligible (rôle project_manager) pour l'affectation
    const pmRole = await prisma.role.findUniqueOrThrow({ where: { key: "project_manager" } });
    const pm = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: "paul@projets.test",
        passwordHash: employee.passwordHash,
        firstName: "Paul",
        lastName: "ChefDeProjet",
        userRoles: { create: { roleId: pmRole.id } },
      },
    });
    pmId = pm.id;
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
        })
        .expect(201);
      // Premier projet de l'organisation → PROJ00001
      expect(response.body.code).toBe("PROJ00001");
      expect(response.body.status).toBe("draft");
      expect(response.body.members).toHaveLength(1);
      expect(response.body.members[0].role).toBe("manager");
      expect(response.body.allowedTransitions).toEqual(["active", "archived"]);
      projectId = response.body.id;
    });

    it("attribue un numéro PROJxxxxx séquentiel et unique", async () => {
      const first = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Projet numéroté A" })
        .expect(201);
      const second = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Projet numéroté B" })
        .expect(201);

      expect(first.body.code).toMatch(/^PROJ\d{5}$/);
      expect(second.body.code).toMatch(/^PROJ\d{5}$/);
      expect(second.body.code).not.toBe(first.body.code);
      // La séquence s'incrémente
      expect(Number(second.body.code.slice(4))).toBe(Number(first.body.code.slice(4)) + 1);
    });

    it("définit le chef de projet à la création, puis le change et le retire", async () => {
      // À la création : le chef de projet (rôle project_manager) rejoint l'équipe
      const created = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Projet avec chef", managerId: pmId })
        .expect(201);
      expect(created.body.manager.id).toBe(pmId);
      expect(
        created.body.members.find((m: { userId: string }) => m.userId === pmId).role,
      ).toBe("manager");

      // Modification depuis la fiche : on retire le chef de projet
      const cleared = await request(server())
        .patch(`/api/v1/projects/${created.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ managerId: null })
        .expect(200);
      expect(cleared.body.manager).toBeNull();

      // Puis on le redéfinit
      const restored = await request(server())
        .patch(`/api/v1/projects/${created.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ managerId: pmId })
        .expect(200);
      expect(restored.body.manager.id).toBe(pmId);

      await request(server())
        .delete(`/api/v1/projects/${created.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(204);
    });

    it("assigner un chef de projet via la fiche l'ajoute à l'équipe (manager)", async () => {
      // Projet créé sans chef : l'équipe ne contient que le créateur
      const created = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Projet sans chef" })
        .expect(201);
      expect(
        created.body.members.some((m: { userId: string }) => m.userId === pmId),
      ).toBe(false);

      // On assigne un chef de projet : il doit rejoindre l'équipe comme manager
      const assigned = await request(server())
        .patch(`/api/v1/projects/${created.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ managerId: pmId })
        .expect(200);
      const pmMember = assigned.body.members.find(
        (m: { userId: string; role: string }) => m.userId === pmId,
      );
      expect(pmMember).toBeDefined();
      expect(pmMember.role).toBe("manager");
    });

    it("refuse un chef de projet sans le rôle « Chef de projet » (400)", async () => {
      const response = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Chef sans rôle", managerId: employeeId })
        .expect(400);
      expect(response.body.code).toBe("MANAGER_MISSING_ROLE");
    });

    it("refuse un chef de projet hors de l'organisation (400)", async () => {
      // Bob appartient à l'organisation Beta
      const outsider = await prisma.user.findUniqueOrThrow({
        where: { email: "bob@projets.test" },
        select: { id: true },
      });
      const response = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Chef externe", managerId: outsider.id })
        .expect(400);
      expect(response.body.code).toBe("MANAGER_NOT_IN_ORG");
    });

    it("refuse un numéro fourni par l'utilisateur (400)", async () => {
      await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Code imposé", code: "CRM-2026" })
        .expect(400);
    });

    it("refuse de modifier le numéro d'un projet (400)", async () => {
      await request(server())
        .patch(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ code: "HACK00001" })
        .expect(400);
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
      // Seul « Refonte CRM » correspond (recherche sur le nom et le numéro)
      expect(response.body.total).toBe(1);
      expect(response.body.items.map((p: { code: string }) => p.code)).toContain("PROJ00001");
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
        .send({ health: "amber", priority: 1 })
        .expect(200);
      expect(response.body.health).toBe("amber");
      expect(response.body.priority).toBe(1);
    });

    it("refuse la saisie directe d'un budget (400) — géré par la gouvernance", async () => {
      await request(server())
        .patch(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ budget: 300000 })
        .expect(400);
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

  describe("gouvernance : contournement administrateur", () => {
    const auth = () => `Bearer ${adminToken}`;

    it("création directe désactivée : motif obligatoire et tracé en audit", async () => {
      await request(server())
        .patch("/api/v1/organization/settings")
        .set("Authorization", auth())
        .send({ allowDirectProjectCreation: false })
        .expect(200);

      // Sans motif → refus
      const noReason = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", auth())
        .send({ name: "Hors gouvernance" })
        .expect(400);
      expect(noReason.body.code).toBe("BYPASS_REASON_REQUIRED");

      // Avec motif → créé et audité comme contournement
      const created = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", auth())
        .send({ name: "Hors gouvernance", bypassReason: "Projet urgent Direction" })
        .expect(201);
      const audits = await prisma.auditLog.findMany({
        where: { action: "project.created_bypass", entityId: created.body.id },
      });
      expect(audits).toHaveLength(1);
      expect((audits[0]!.after as { bypassReason?: string }).bypassReason).toBe(
        "Projet urgent Direction",
      );

      // Réactive la création directe pour les autres scénarios
      await request(server())
        .patch("/api/v1/organization/settings")
        .set("Authorization", auth())
        .send({ allowDirectProjectCreation: true })
        .expect(200);
    });

    it("active un projet sous gouvernance sans budget uniquement avec motif (admin)", async () => {
      const portfolio = await request(server())
        .post("/api/v1/portfolios")
        .set("Authorization", auth())
        .send({ name: "Gouvernance", budgetEnvelope: 100000 })
        .expect(201);
      const project = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", auth())
        .send({ name: "Sans budget validé" })
        .expect(201);
      await request(server())
        .post(`/api/v1/portfolios/${portfolio.body.id}/projects`)
        .set("Authorization", auth())
        .send({ projectId: project.body.id })
        .expect(201);

      // draft → active sans budget validé, sans motif → refus
      const blocked = await request(server())
        .patch(`/api/v1/projects/${project.body.id}/status`)
        .set("Authorization", auth())
        .send({ status: "active" })
        .expect(400);
      expect(blocked.body.code).toBe("BYPASS_REASON_REQUIRED");

      // Avec motif → activé et tracé comme contournement
      const forced = await request(server())
        .patch(`/api/v1/projects/${project.body.id}/status`)
        .set("Authorization", auth())
        .send({ status: "active", bypassReason: "Démarrage anticipé validé en COMEX" })
        .expect(200);
      expect(forced.body.status).toBe("active");
      const audits = await prisma.auditLog.findMany({
        where: { action: "project.status_changed_bypass", entityId: project.body.id },
      });
      expect(audits).toHaveLength(1);
    });
  });
});
