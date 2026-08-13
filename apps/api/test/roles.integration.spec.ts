import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/** R2 — administration des rôles (permission ROLE_MANAGE requise). */
describe("Administration des rôles (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let employeeToken: string;
  let orgId: string;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    const admin = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Roles Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@roles.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    orgId = (await prisma.organization.findUniqueOrThrow({ where: { slug: "roles-corp" } })).id;
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@roles.test" } });
    const employeeRole = await prisma.role.findUniqueOrThrow({ where: { key: "employee" } });
    await prisma.user.create({
      data: {
        organizationId: orgId,
        email: "bob@roles.test",
        passwordHash: alice.passwordHash,
        firstName: "Bob",
        lastName: "Employe",
        userRoles: { create: { roleId: employeeRole.id } },
      },
    });
    employeeToken = (
      await request(server())
        .post("/api/v1/auth/login")
        .send({ email: "bob@roles.test", password: "SuperSecret123" })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("refuse l'accès à un utilisateur sans ROLE_MANAGE (403)", async () => {
    await request(server())
      .get("/api/v1/roles")
      .set("Authorization", `Bearer ${employeeToken}`)
      .expect(403);
  });

  it("exige un jeton (401)", async () => {
    await request(server()).get("/api/v1/roles").expect(401);
  });

  it("l'admin liste les rôles système avec leurs permissions et le nombre d'utilisateurs", async () => {
    const res = await request(server())
      .get("/api/v1/roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const admin = res.body.find((r: { key: string }) => r.key === "admin");
    expect(admin.isSystem).toBe(true);
    expect(admin.permissionKeys).toContain("ROLE_MANAGE");
    const employee = res.body.find((r: { key: string }) => r.key === "employee");
    expect(employee.userCount).toBe(1); // Bob
  });

  it("expose le catalogue de permissions", async () => {
    const res = await request(server())
      .get("/api/v1/permissions")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(30);
    expect(res.body[0]).toHaveProperty("key");
  });

  let customRoleId: string;

  it("l'admin crée un rôle personnalisé avec des permissions", async () => {
    const res = await request(server())
      .post("/api/v1/roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Auditeur",
        description: "Lecture seule étendue",
        permissionKeys: ["DEMAND_READ", "PROJECT_READ", "BUDGET_READ"],
      })
      .expect(201);
    customRoleId = res.body.id;
    expect(res.body.isSystem).toBe(false);
    expect(res.body.permissionKeys.sort()).toEqual(["BUDGET_READ", "DEMAND_READ", "PROJECT_READ"]);
  });

  it("refuse une permission inconnue (400)", async () => {
    const res = await request(server())
      .post("/api/v1/roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Bidon", permissionKeys: ["NON_EXISTENT"] })
      .expect(400);
    expect(res.body.code).toBe("PERMISSION_UNKNOWN");
  });

  it("l'admin modifie le rôle personnalisé (renommage, permissions, désactivation)", async () => {
    const res = await request(server())
      .patch(`/api/v1/roles/${customRoleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Auditeur senior", active: false, permissionKeys: ["PROJECT_READ"] })
      .expect(200);
    expect(res.body.name).toBe("Auditeur senior");
    expect(res.body.active).toBe(false);
    expect(res.body.permissionKeys).toEqual(["PROJECT_READ"]);
  });

  it("le rôle Administrateur est immuable (403)", async () => {
    const admin = await prisma.role.findUniqueOrThrow({ where: { key: "admin" } });
    const res = await request(server())
      .patch(`/api/v1/roles/${admin.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ permissionKeys: [] })
      .expect(403);
    expect(res.body.code).toBe("ROLE_IMMUTABLE");
  });

  it("un rôle système ne peut être ni renommé ni désactivé (400)", async () => {
    const finance = await prisma.role.findUniqueOrThrow({ where: { key: "finance" } });
    await request(server())
      .patch(`/api/v1/roles/${finance.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ active: false })
      .expect(400);
  });

  it("supprime un rôle personnalisé non attribué", async () => {
    await request(server())
      .delete(`/api/v1/roles/${customRoleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(204);
    const remaining = await request(server())
      .get("/api/v1/roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(remaining.body.some((r: { id: string }) => r.id === customRoleId)).toBe(false);
  });

  it("refuse la suppression d'un rôle système (400)", async () => {
    const observer = await prisma.role.findUniqueOrThrow({ where: { key: "observer" } });
    await request(server())
      .delete(`/api/v1/roles/${observer.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
  });

  it("liste les utilisateurs d'un rôle", async () => {
    const employee = await prisma.role.findUniqueOrThrow({ where: { key: "employee" } });
    const res = await request(server())
      .get(`/api/v1/roles/${employee.id}/users`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.some((u: { email: string }) => u.email === "bob@roles.test")).toBe(true);
  });
});
