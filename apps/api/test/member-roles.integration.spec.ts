import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/** R3 — gestion multi-rôles d'un membre (endpoint + garde MEMBER_MANAGE + SoD admin). */
describe("Rôles d'un membre (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let aliceId: string;
  let bobToken: string;
  let bobId: string;
  const roleId: Record<string, string> = {};

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
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "roles-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@roles.test" } });
    aliceId = alice.id;

    const employeeRole = await prisma.role.findUniqueOrThrow({ where: { key: "employee" } });
    const bob = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: "bob@roles.test",
        passwordHash: alice.passwordHash,
        firstName: "Bob",
        lastName: "Collab",
        userRoles: { create: { roleId: employeeRole.id } },
      },
    });
    bobId = bob.id;
    bobToken = (
      await request(server())
        .post("/api/v1/auth/login")
        .send({ email: "bob@roles.test", password: "SuperSecret123" })
        .expect(200)
    ).body.accessToken;

    for (const key of ["admin", "manager", "finance", "employee"]) {
      roleId[key] = (await prisma.role.findUniqueOrThrow({ where: { key: key as never } })).id;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("l'admin attribue plusieurs rôles ; les permissions sont l'union (sans reconnexion)", async () => {
    const before = await request(server())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${bobToken}`)
      .expect(200);
    expect(before.body.permissions).not.toContain("BUDGET_APPROVE");

    const updated = await request(server())
      .put(`/api/v1/members/${bobId}/roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roleIds: [roleId.manager, roleId.finance] })
      .expect(200);
    expect(updated.body.roleIds.sort()).toEqual([roleId.manager, roleId.finance].sort());
    expect(updated.body.roles.sort()).toEqual(["finance", "manager"]);

    // Prise en compte immédiate (cache invalidé) avec le MÊME jeton
    const after = await request(server())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${bobToken}`)
      .expect(200);
    expect(after.body.permissions).toEqual(
      expect.arrayContaining(["DEMAND_APPROVE", "BUDGET_APPROVE", "BUDGET_UPDATE"]),
    );
  });

  it("un membre sans la permission MEMBER_MANAGE ne peut pas modifier les rôles (403)", async () => {
    // Bob est désormais manager+finance mais pas admin → pas de MEMBER_MANAGE
    await request(server())
      .put(`/api/v1/members/${aliceId}/roles`)
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ roleIds: [roleId.employee] })
      .expect(403);
  });

  it("refuse un identifiant de rôle inconnu (400)", async () => {
    const res = await request(server())
      .put(`/api/v1/members/${bobId}/roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roleIds: ["00000000-0000-7000-8000-000000000000"] })
      .expect(400);
    expect(res.body.code).toBe("ROLE_NOT_ASSIGNABLE");
  });

  it("empêche de retirer le rôle Administrateur au dernier administrateur (400)", async () => {
    const res = await request(server())
      .put(`/api/v1/members/${aliceId}/roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roleIds: [roleId.employee] })
      .expect(400);
    expect(res.body.code).toBe("LAST_ADMIN");
  });

  it("exige un jeton (401)", async () => {
    await request(server()).put(`/api/v1/members/${bobId}/roles`).send({ roleIds: [] }).expect(401);
  });
});
