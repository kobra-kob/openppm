import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";

/** Catégories, templates et favoris — fin du lot M1. */
describe("Catégories / templates / favoris (intégration)", () => {
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

    await prisma.timeEntry.deleteMany();
    await prisma.taskDependency.deleteMany();
    await prisma.checklistItem.deleteMany();
    await prisma.taskAssignee.deleteMany();
    await prisma.task.deleteMany();
    await prisma.favorite.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
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
      organizationName: "Catalog Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@catalog.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const other = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Autre Corp",
      firstName: "Bob",
      lastName: "Boss",
      email: "bob@catalog.test",
      password: "SuperSecret123",
    });
    otherOrgToken = other.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  let categoryId: string;
  let templateId: string;
  let projectId: string;

  describe("catégories", () => {
    it("crée, liste, renomme une catégorie ; refuse le doublon (409)", async () => {
      const created = await request(server())
        .post("/api/v1/project-categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Digital", color: "#ff9f0a" })
        .expect(201);
      categoryId = created.body.id;
      expect(created.body.color).toBe("#ff9f0a");

      await request(server())
        .post("/api/v1/project-categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Digital" })
        .expect(409);

      const updated = await request(server())
        .patch(`/api/v1/project-categories/${categoryId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Transformation digitale" })
        .expect(200);
      expect(updated.body.name).toBe("Transformation digitale");

      const list = await request(server())
        .get("/api/v1/project-categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body).toHaveLength(1);
    });

    it("refuse une couleur invalide (400) et n'expose pas les catégories d'autres orgs", async () => {
      await request(server())
        .post("/api/v1/project-categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "KO", color: "rouge" })
        .expect(400);
      const otherList = await request(server())
        .get("/api/v1/project-categories")
        .set("Authorization", `Bearer ${otherOrgToken}`)
        .expect(200);
      expect(otherList.body).toHaveLength(0);
    });

    it("assigne la catégorie à un projet et filtre la liste par catégorie", async () => {
      const project = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Site vitrine", categoryId })
        .expect(201);
      projectId = project.body.id;
      expect(project.body.category.name).toBe("Transformation digitale");

      await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Sans catégorie" })
        .expect(201);

      const filtered = await request(server())
        .get(`/api/v1/projects?categoryId=${categoryId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(filtered.body.total).toBe(1);
      expect(filtered.body.items[0].id).toBe(projectId);
    });
  });

  describe("templates", () => {
    it("crée un template depuis un projet (durée et catégorie copiées)", async () => {
      await request(server())
        .patch(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ startDate: "2026-09-01", endDate: "2026-09-11", budget: 50000, priority: 2 })
        .expect(200);

      const template = await request(server())
        .post("/api/v1/project-templates")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Modèle site vitrine", fromProjectId: projectId })
        .expect(201);
      templateId = template.body.id;
      expect(template.body.durationDays).toBe(10);
      expect(template.body.priority).toBe(2);
      expect(Number(template.body.budget)).toBe(50000);
      expect(template.body.category.id).toBe(categoryId);
    });

    it("crée un projet à partir du template : défauts appliqués, DTO prioritaire", async () => {
      const project = await request(server())
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Nouveau site client",
          templateId,
          startDate: "2026-10-01",
          budget: 60000,
        })
        .expect(201);
      expect(project.body.priority).toBe(2);
      expect(Number(project.body.budget)).toBe(60000);
      expect(project.body.category.id).toBe(categoryId);
      expect(project.body.endDate?.slice(0, 10)).toBe("2026-10-11");
    });

    it("refuse un doublon de nom (409) et supprime un template", async () => {
      await request(server())
        .post("/api/v1/project-templates")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Modèle site vitrine" })
        .expect(409);
      await request(server())
        .delete(`/api/v1/project-templates/${templateId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(204);
      const list = await request(server())
        .get("/api/v1/project-templates")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body).toHaveLength(0);
    });
  });

  describe("favoris", () => {
    it("ajoute (idempotent), expose isFavorite et liste les favoris", async () => {
      await request(server())
        .put(`/api/v1/favorites/project/${projectId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(204);
      await request(server())
        .put(`/api/v1/favorites/project/${projectId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(204);

      const detail = await request(server())
        .get(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.isFavorite).toBe(true);

      const favorites = await request(server())
        .get("/api/v1/favorites")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(favorites.body).toHaveLength(1);
      expect(favorites.body[0].name).toBe("Site vitrine");
    });

    it("les favoris sont propres à chaque utilisateur et organisation", async () => {
      const otherFavorites = await request(server())
        .get("/api/v1/favorites")
        .set("Authorization", `Bearer ${otherOrgToken}`)
        .expect(200);
      expect(otherFavorites.body).toHaveLength(0);
      // Un projet d'une autre org ne peut pas être mis en favori
      await request(server())
        .put(`/api/v1/favorites/project/${projectId}`)
        .set("Authorization", `Bearer ${otherOrgToken}`)
        .expect(404);
    });

    it("retire un favori", async () => {
      await request(server())
        .delete(`/api/v1/favorites/project/${projectId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(204);
      const detail = await request(server())
        .get(`/api/v1/projects/${projectId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.isFavorite).toBe(false);
    });
  });
});
