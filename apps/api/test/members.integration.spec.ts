import { createHash } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { RoleKey } from "@openppm/db";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";

describe("Members / invitations (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let otherOrgToken: string;
  let employeeToken: string;

  const login = async (email: string, password: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    return response.body.accessToken as string;
  };

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
    await prisma.refreshToken.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.groupMember.deleteMany();
    await prisma.group.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();

    // Deux organisations pour vérifier l'isolation
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      organizationName: "Alpha Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@alpha.test",
      password: "SuperSecret123",
    });
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      organizationName: "Beta SARL",
      firstName: "Bob",
      lastName: "Boss",
      email: "bob@beta.test",
      password: "SuperSecret123",
    });
    adminToken = await login("alice@alpha.test", "SuperSecret123");
    otherOrgToken = await login("bob@beta.test", "SuperSecret123");
  });

  afterAll(async () => {
    await app.close();
  });

  it("liste les membres de sa propre organisation uniquement", async () => {
    const alpha = await request(app.getHttpServer())
      .get("/api/v1/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(alpha.body).toHaveLength(1);
    expect(alpha.body[0].email).toBe("alice@alpha.test");
    expect(alpha.body[0].roles).toEqual([RoleKey.admin]);
  });

  it("refuse l'accès sans jeton", async () => {
    await request(app.getHttpServer()).get("/api/v1/members").expect(401);
  });

  describe("inviter", () => {
    it("crée une invitation avec rôle (admin) et l'expose dans la liste", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/members/invitations")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email: "emma@alpha.test", roleKey: "employee" })
        .expect(201);
      expect(created.body.email).toBe("emma@alpha.test");
      expect(created.body.roleKey).toBe("employee");

      const list = await request(app.getHttpServer())
        .get("/api/v1/members/invitations")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].invitedByName).toBe("Alice Admin");
    });

    it("n'expose pas les invitations d'une autre organisation", async () => {
      const list = await request(app.getHttpServer())
        .get("/api/v1/members/invitations")
        .set("Authorization", `Bearer ${otherOrgToken}`)
        .expect(200);
      expect(list.body).toHaveLength(0);
    });

    it("refuse un doublon d'invitation en attente (409)", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/members/invitations")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email: "emma@alpha.test", roleKey: "employee" })
        .expect(409);
      expect(response.body.code).toBe("INVITATION_ALREADY_PENDING");
    });

    it("refuse un email qui possède déjà un compte (409)", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/members/invitations")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email: "alice@alpha.test", roleKey: "employee" })
        .expect(409);
    });

    it("refuse un rôle inconnu (400, validation)", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/members/invitations")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email: "x@alpha.test", roleKey: "super_admin" })
        .expect(400);
    });
  });

  describe("accepter", () => {
    const RAW_TOKEN = "jeton-invitation-connu";

    const insertInvitation = async (
      email: string,
      rawToken: string,
      expiresAt: Date,
    ): Promise<string> => {
      const org = await prisma.organization.findUniqueOrThrow({
        where: { slug: "alpha-corp" },
      });
      const alice = await prisma.user.findUniqueOrThrow({
        where: { email: "alice@alpha.test" },
      });
      const role = await prisma.role.findUniqueOrThrow({
        where: { key: RoleKey.project_manager },
      });
      const invitation = await prisma.invitation.create({
        data: {
          organizationId: org.id,
          email,
          roleId: role.id,
          tokenHash: createHash("sha256").update(rawToken).digest("hex"),
          expiresAt,
          invitedById: alice.id,
        },
      });
      return invitation.id;
    };

    it("crée le compte dans l'organisation avec le rôle pré-assigné", async () => {
      await insertInvitation(
        "jean@alpha.test",
        RAW_TOKEN,
        new Date(Date.now() + 60_000),
      );
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/accept-invitation")
        .send({
          token: RAW_TOKEN,
          firstName: "Jean",
          lastName: "Dupont",
          password: "SuperSecret123",
        })
        .expect(201);
      expect(response.body.user.email).toBe("jean@alpha.test");
      expect(response.body.user.roles).toEqual([RoleKey.project_manager]);
      expect(response.body.user.organization.slug).toBe("alpha-corp");
      employeeToken = response.body.accessToken;

      const members = await request(app.getHttpServer())
        .get("/api/v1/members")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(members.body).toHaveLength(2);
    });

    it("le jeton d'invitation est à usage unique (400)", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/accept-invitation")
        .send({
          token: RAW_TOKEN,
          firstName: "X",
          lastName: "Y",
          password: "SuperSecret123",
        })
        .expect(400);
      expect(response.body.code).toBe("INVALID_INVITATION");
    });

    it("refuse une invitation expirée (400)", async () => {
      await insertInvitation(
        "late@alpha.test",
        "jeton-expire",
        new Date(Date.now() - 1000),
      );
      await request(app.getHttpServer())
        .post("/api/v1/auth/accept-invitation")
        .send({
          token: "jeton-expire",
          firstName: "Trop",
          lastName: "Tard",
          password: "SuperSecret123",
        })
        .expect(400);
    });

    it("un membre non admin/manager ne peut pas inviter (403)", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/members/invitations")
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({ email: "z@alpha.test", roleKey: "employee" })
        .expect(403);
    });
  });

  describe("révoquer", () => {
    it("supprime une invitation en attente ; introuvable depuis une autre org", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/members/invitations")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email: "revoke@alpha.test", roleKey: "observer" })
        .expect(201);

      // L'admin d'une autre organisation ne peut pas la révoquer
      await request(app.getHttpServer())
        .delete(`/api/v1/members/invitations/${created.body.id}`)
        .set("Authorization", `Bearer ${otherOrgToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/members/invitations/${created.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(204);

      const list = await request(app.getHttpServer())
        .get("/api/v1/members/invitations")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(
        list.body.some((invitation: { id: string }) => invitation.id === created.body.id),
      ).toBe(false);
    });
  });
});
