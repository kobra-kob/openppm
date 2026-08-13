import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/**
 * R1 — fondation permissions : les permissions effectives d'un utilisateur sont
 * l'union des permissions de ses rôles (cumulables), résolues côté serveur et
 * exposées par /auth/me. Aucune route n'exige encore de permission (bascule R4).
 */
describe("Permissions effectives (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let orgId: string;

  const server = () => app.getHttpServer();

  const createUserWithRoles = async (
    email: string,
    roleKeys: string[],
    passwordHash: string,
  ): Promise<string> => {
    const roles = await prisma.role.findMany({ where: { key: { in: roleKeys as never } } });
    await prisma.user.create({
      data: {
        organizationId: orgId,
        email,
        passwordHash,
        firstName: "Test",
        lastName: "User",
        userRoles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
    });
    const login = await request(server())
      .post("/api/v1/auth/login")
      .send({ email, password: "SuperSecret123" })
      .expect(200);
    return login.body.accessToken;
  };

  const permissionsOf = async (token: string): Promise<string[]> => {
    const me = await request(server())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    return me.body.permissions as string[];
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    const admin = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "RBAC Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@rbac.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    orgId = (await prisma.organization.findUniqueOrThrow({ where: { slug: "rbac-corp" } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("le catalogue et la matrice sont bien seedés", async () => {
    expect(await prisma.permission.count()).toBeGreaterThanOrEqual(30);
    expect(await prisma.rolePermission.count()).toBeGreaterThan(0);
  });

  it("l'administrateur possède l'ensemble des permissions", async () => {
    const perms = await permissionsOf(adminToken);
    // quelques permissions clés, dont l'administration
    for (const key of ["PROJECT_CREATE", "PROJECT_DELETE", "BUDGET_APPROVE", "ROLE_MANAGE", "DEMAND_APPROVE"]) {
      expect(perms).toContain(key);
    }
    expect(perms.length).toBe(await prisma.permission.count());
  });

  it("un collaborateur a des droits limités (crée/lit mais ne valide pas)", async () => {
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@rbac.test" } });
    const token = await createUserWithRoles("bob@rbac.test", ["employee"], alice.passwordHash);
    const perms = await permissionsOf(token);
    expect(perms).toContain("DEMAND_CREATE");
    expect(perms).toContain("PROJECT_READ");
    // Ne peut ni approuver une demande, ni valider un budget, ni créer un projet
    expect(perms).not.toContain("DEMAND_APPROVE");
    expect(perms).not.toContain("BUDGET_APPROVE");
    expect(perms).not.toContain("PROJECT_CREATE");
  });

  it("le responsable financier peut valider un budget mais pas approuver une demande", async () => {
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@rbac.test" } });
    const token = await createUserWithRoles("fred@rbac.test", ["finance"], alice.passwordHash);
    const perms = await permissionsOf(token);
    expect(perms).toContain("BUDGET_APPROVE");
    expect(perms).toContain("BUSINESS_CASE_VALIDATE");
    expect(perms).not.toContain("DEMAND_APPROVE");
  });

  it("multi-rôles : les permissions sont l'UNION des rôles", async () => {
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@rbac.test" } });
    const token = await createUserWithRoles(
      "jean@rbac.test",
      ["employee", "finance"],
      alice.passwordHash,
    );
    const perms = await permissionsOf(token);
    // employee → DEMAND_CREATE ; finance → BUDGET_APPROVE ; les deux présents
    expect(perms).toContain("DEMAND_CREATE");
    expect(perms).toContain("BUDGET_APPROVE");
  });

  it("exige un jeton pour /auth/me (401)", async () => {
    await request(server()).get("/api/v1/auth/me").expect(401);
  });
});
