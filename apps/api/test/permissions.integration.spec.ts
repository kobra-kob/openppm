import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/**
 * R1 — fondation des permissions fines : la matrice rôle → permissions seedée
 * est correctement résolue (union des rôles) et exposée par /auth/me. La garde
 * globale de permissions ne casse aucune route existante (aucune route ne
 * requiert encore de permission à ce stade).
 */
describe("Permissions effectives (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let employeeToken: string;

  const server = () => app.getHttpServer();

  const createUser = async (
    orgId: string,
    email: string,
    roleKey: string,
    passwordHash: string,
  ): Promise<string> => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey as never } });
    await prisma.user.create({
      data: {
        organizationId: orgId,
        email,
        passwordHash,
        firstName: "T",
        lastName: "U",
        userRoles: { create: { roleId: role.id } },
      },
    });
    const login = await request(server())
      .post("/api/v1/auth/login")
      .send({ email, password: "SuperSecret123" })
      .expect(200);
    return login.body.accessToken;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    const admin = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Perm Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@perm.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "perm-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@perm.test" } });
    employeeToken = await createUser(org.id, "bob@perm.test", "employee", alice.passwordHash);
  });

  afterAll(async () => {
    await app.close();
  });

  it("/auth/me expose les rôles ET les permissions effectives", async () => {
    const me = await request(server())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(me.body.roles).toContain("admin");
    expect(Array.isArray(me.body.permissions)).toBe(true);
    // L'administrateur possède toutes les permissions
    expect(me.body.permissions).toEqual(expect.arrayContaining([
      "PROJECT_CREATE", "PROJECT_DELETE", "BUDGET_APPROVE", "ROLE_MANAGE", "DEMAND_APPROVE",
    ]));
  });

  it("un collaborateur a des permissions limitées (création demande, lectures) et pas les droits admin", async () => {
    const me = await request(server())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${employeeToken}`)
      .expect(200);
    expect(me.body.roles).toEqual(["employee"]);
    expect(me.body.permissions).toEqual(expect.arrayContaining(["DEMAND_CREATE", "DEMAND_SUBMIT", "PROJECT_READ"]));
    // Ne doit PAS avoir les permissions sensibles
    for (const forbidden of ["PROJECT_CREATE", "PROJECT_DELETE", "BUDGET_APPROVE", "ROLE_MANAGE", "DEMAND_APPROVE"]) {
      expect(me.body.permissions).not.toContain(forbidden);
    }
  });

  it("l'union des rôles cumule les permissions (multi-rôles)", async () => {
    // Carol reçoit dès le départ deux rôles cumulés (employee + finance) —
    // utilisateur jamais interrogé, donc aucun cache de permissions à purger.
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "perm-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@perm.test" } });
    const employeeRole = await prisma.role.findUniqueOrThrow({ where: { key: "employee" } });
    const financeRole = await prisma.role.findUniqueOrThrow({ where: { key: "finance" } });
    await prisma.user.create({
      data: {
        organizationId: org.id,
        email: "carol@perm.test",
        passwordHash: alice.passwordHash,
        firstName: "Carol",
        lastName: "Multi",
        userRoles: { create: [{ roleId: employeeRole.id }, { roleId: financeRole.id }] },
      },
    });
    const login = await request(server())
      .post("/api/v1/auth/login")
      .send({ email: "carol@perm.test", password: "SuperSecret123" })
      .expect(200);
    const me = await request(server())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.roles.sort()).toEqual(["employee", "finance"]);
    // Union : permissions employee (DEMAND_CREATE) + finance (BUDGET_APPROVE/UPDATE)
    expect(me.body.permissions).toEqual(
      expect.arrayContaining(["DEMAND_CREATE", "DEMAND_SUBMIT", "BUDGET_APPROVE", "BUDGET_UPDATE"]),
    );
  });

  it("la garde globale ne casse pas les routes sans permission requise", async () => {
    // Route existante sans @RequirePermissions : doit répondre normalement
    await request(server())
      .get("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    await request(server()).get("/api/v1/projects").expect(401);
  });
});
