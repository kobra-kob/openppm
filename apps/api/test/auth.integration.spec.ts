import { createHash } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";

/**
 * Tests d'intégration : app Nest complète (mêmes pipes/guards que la prod)
 * contre un MySQL réel (openppm_test), migré et seedé par global-setup.
 */
describe("Auth (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const register = (overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        organizationName: "ACME SAS",
        firstName: "Marie",
        lastName: "Leroy",
        email: "marie@acme.test",
        password: "SuperSecret123",
        ...overrides,
      });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    // Base propre (les rôles système seedés sont conservés).
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
    await prisma.workflowTransitionLog.deleteMany();
    await prisma.workflowInstance.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflowState.deleteMany();
    await prisma.workflowDefinition.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("register", () => {
    it("crée l'organisation et son premier compte avec le rôle admin", async () => {
      const response = await register().expect(201);
      expect(response.body.user.email).toBe("marie@acme.test");
      expect(response.body.user.roles).toEqual(["admin"]);
      expect(response.body.user.organization.slug).toBe("acme-sas");
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();

      const audit = await prisma.auditLog.findFirst({
        where: { action: "auth.register" },
      });
      expect(audit).not.toBeNull();
    });

    it("suffixe le slug quand le nom d'organisation est déjà pris", async () => {
      const response = await register({ email: "paul@acme.test" }).expect(201);
      expect(response.body.user.organization.slug).toBe("acme-sas-2");
    });

    it("refuse un email déjà utilisé (409)", async () => {
      const response = await register().expect(409);
      expect(response.body.code).toBe("EMAIL_ALREADY_USED");
    });

    it("refuse un mot de passe hors politique (400)", async () => {
      const response = await register({
        email: "weak@acme.test",
        password: "faible1234567",
      }).expect(400);
      expect(response.body.code).toBe("PASSWORD_POLICY");
      expect(response.body.errors).toContain("password.missing_uppercase");
    });

    it("refuse les champs inconnus (400, whitelist stricte)", async () => {
      await register({ email: "extra@acme.test", injected: "x" }).expect(400);
    });
  });

  describe("login / verrouillage", () => {
    it("connecte avec les bons identifiants", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "marie@acme.test", password: "SuperSecret123" })
        .expect(200);
      expect(response.body.user.organization.slug).toBe("acme-sas");
    });

    it("rejette un mauvais mot de passe (401) et un email inconnu (401)", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "marie@acme.test", password: "MauvaisPass123" })
        .expect(401);
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "inconnu@acme.test", password: "SuperSecret123" })
        .expect(401);
    });

    it("verrouille le compte après 5 échecs (423), même avec le bon mot de passe", async () => {
      await register({ email: "lock@acme.test", organizationName: "LockCorp" }).expect(201);
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        await request(app.getHttpServer())
          .post("/api/v1/auth/login")
          .send({ email: "lock@acme.test", password: "MauvaisPass123" })
          .expect(401);
      }
      // 5e échec : le verrou se pose (la réponse reste 401 générique)
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "lock@acme.test", password: "MauvaisPass123" })
        .expect(401);
      const locked = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "lock@acme.test", password: "SuperSecret123" })
        .expect(423);
      expect(locked.body.code).toBe("ACCOUNT_LOCKED");
      expect(locked.body.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe("me", () => {
    it("renvoie le profil avec un jeton valide, 401 sans jeton", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "marie@acme.test", password: "SuperSecret123" })
        .expect(200);
      const me = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${login.body.accessToken}`)
        .expect(200);
      expect(me.body.email).toBe("marie@acme.test");

      await request(app.getHttpServer()).get("/api/v1/auth/me").expect(401);
    });
  });

  describe("refresh — rotation et détection de réutilisation", () => {
    it("fait tourner le refresh token puis révoque la famille en cas de réutilisation", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "marie@acme.test", password: "SuperSecret123" })
        .expect(200);
      const firstToken: string = login.body.refreshToken;

      const rotated = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: firstToken })
        .expect(200);
      expect(rotated.body.refreshToken).not.toBe(firstToken);

      // Réutilisation du token consommé → 401 + toute la famille révoquée
      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: firstToken })
        .expect(401);
      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: rotated.body.refreshToken })
        .expect(401);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "auth.refresh.reuse_detected" },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe("logout", () => {
    it("révoque la session : le refresh token ne fonctionne plus", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "marie@acme.test", password: "SuperSecret123" })
        .expect(200);
      await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .send({ refreshToken: login.body.refreshToken })
        .expect(204);
      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);
    });
  });

  describe("changement de mot de passe (connecté)", () => {
    it("refuse un mot de passe actuel incorrect (401) et une politique violée (400)", async () => {
      await register({
        email: "change@acme.test",
        organizationName: "ChangeCorp",
      }).expect(201);
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "change@acme.test", password: "SuperSecret123" })
        .expect(200);
      const token = login.body.accessToken;

      await request(app.getHttpServer())
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: "Mauvais12345", newPassword: "NouveauSecret456" })
        .expect(401);
      await request(app.getHttpServer())
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: "SuperSecret123", newPassword: "faible-sans-maj-1" })
        .expect(400);
    });

    it("change le mot de passe, révoque les anciennes sessions et en ouvre une neuve", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "change@acme.test", password: "SuperSecret123" })
        .expect(200);

      const changed = await request(app.getHttpServer())
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${login.body.accessToken}`)
        .send({ currentPassword: "SuperSecret123", newPassword: "NouveauSecret456" })
        .expect(200);
      expect(changed.body.accessToken).toBeDefined();

      // Ancien refresh token révoqué, nouveau valide
      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);
      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: changed.body.refreshToken })
        .expect(200);

      // Ancien mot de passe refusé, nouveau accepté
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "change@acme.test", password: "SuperSecret123" })
        .expect(401);
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "change@acme.test", password: "NouveauSecret456" })
        .expect(200);
    });
  });

  describe("réinitialisation de mot de passe", () => {
    it("répond 202 que l'email existe ou non (anti-énumération)", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/forgot-password")
        .send({ email: "marie@acme.test" })
        .expect(202);
      await request(app.getHttpServer())
        .post("/api/v1/auth/forgot-password")
        .send({ email: "nexiste-pas@acme.test" })
        .expect(202);
    });

    it("réinitialise le mot de passe et révoque les sessions", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "marie@acme.test", password: "SuperSecret123" })
        .expect(200);

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: "marie@acme.test" },
      });
      const rawToken = "jeton-de-test-connu";
      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: createHash("sha256").update(rawToken).digest("hex"),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await request(app.getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({ token: rawToken, password: "NouveauSecret456" })
        .expect(204);

      // Ancien mot de passe refusé, nouveau accepté
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "marie@acme.test", password: "SuperSecret123" })
        .expect(401);
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "marie@acme.test", password: "NouveauSecret456" })
        .expect(200);

      // Les refresh tokens antérieurs sont révoqués
      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);

      // Le jeton de réinitialisation est à usage unique
      await request(app.getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({ token: rawToken, password: "EncoreUnAutre789" })
        .expect(400);
    });
  });
});
