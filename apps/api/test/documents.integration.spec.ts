import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";

describe("Documents / GED v1 + export CSV (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let otherOrgToken: string;
  let projectId: string;
  let documentId: string;

  const server = () => app.getHttpServer();
  const base = () => `/api/v1/projects/${projectId}/documents`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.document.deleteMany();
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
      organizationName: "Docs Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@docs.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const other = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Autre Docs",
      firstName: "Bob",
      lastName: "Boss",
      email: "bob@docs.test",
      password: "SuperSecret123",
    });
    otherOrgToken = other.body.accessToken;

    const project = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Projet GED" })
      .expect(201);
    projectId = project.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("documents", () => {
    it("téléverse un fichier et l'expose dans la liste avec ses métadonnées", async () => {
      const uploaded = await request(server())
        .post(base())
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("file", Buffer.from("Cahier des charges GED", "utf8"), {
          filename: "cahier-des-charges.txt",
          contentType: "text/plain",
        })
        .expect(201);
      documentId = uploaded.body.id;
      expect(uploaded.body.name).toBe("cahier-des-charges.txt");
      expect(uploaded.body.size).toBeGreaterThan(0);
      expect(uploaded.body.uploadedByName).toBe("Alice Admin");

      const list = await request(server())
        .get(base())
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body).toHaveLength(1);
    });

    it("refuse un upload sans fichier (400)", async () => {
      await request(server())
        .post(base())
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(400);
    });

    it("télécharge le contenu exact avec les bons en-têtes", async () => {
      const response = await request(server())
        .get(`${base()}/${documentId}/download`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(response.headers["content-type"]).toContain("text/plain");
      expect(response.headers["content-disposition"]).toContain("cahier-des-charges.txt");
      expect(response.text ?? response.body.toString()).toBe("Cahier des charges GED");
    });

    it("est isolé par organisation (404) ", async () => {
      await request(server())
        .get(base())
        .set("Authorization", `Bearer ${otherOrgToken}`)
        .expect(404);
      await request(server())
        .get(`${base()}/${documentId}/download`)
        .set("Authorization", `Bearer ${otherOrgToken}`)
        .expect(404);
    });

    it("supprime le document (liste vide, download 404, audit)", async () => {
      await request(server())
        .delete(`${base()}/${documentId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(204);
      const list = await request(server())
        .get(base())
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body).toHaveLength(0);
      await request(server())
        .get(`${base()}/${documentId}/download`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);
      const audit = await prisma.auditLog.findFirst({
        where: { action: "document.deleted", entityId: documentId },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe("export CSV des tâches", () => {
    it("renvoie un CSV avec en-tête, BOM et lignes de tâches", async () => {
      await request(server())
        .post(`/api/v1/projects/${projectId}/tasks`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: "Tâche; avec point-virgule",
          startDate: "2026-09-01",
          dueDate: "2026-09-05",
          estimateHours: 8,
        })
        .expect(201);

      const response = await request(server())
        .get(`/api/v1/projects/${projectId}/tasks/export`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(response.headers["content-type"]).toContain("text/csv");
      expect(response.headers["content-disposition"]).toContain("taches.csv");
      const text: string = response.text;
      expect(text.charCodeAt(0)).toBe(0xfeff);
      expect(text).toContain("Titre;Statut;Priorité");
      expect(text).toContain('"Tâche; avec point-virgule"');
      expect(text).toContain("2026-09-01;2026-09-05;8");
    });
  });
});
