import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/** S7 — Multi-tenant : sélecteur d'orgs, switch sécurisé, rôles par org, isolation. */
describe("Multi-tenant (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let aliceToken: string; // admin de l'org A
  let bobToken: string; // admin de l'org B
  let orgAId: string;
  let orgBId: string;
  let aliceId: string;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    const a = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Alpha SAS",
      firstName: "Alice",
      lastName: "A",
      email: "alice@alpha.test",
      password: "SuperSecret123",
    });
    aliceToken = a.body.accessToken;
    orgAId = a.body.user.organization.id;
    aliceId = a.body.user.id;

    const b = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Beta SAS",
      firstName: "Bob",
      lastName: "B",
      email: "bob@beta.test",
      password: "SuperSecret123",
    });
    bobToken = b.body.accessToken;
    orgBId = b.body.user.organization.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("register crée un membership owner + owner d'org", async () => {
    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { userId_organizationId: { userId: aliceId, organizationId: orgAId } },
    });
    expect(membership.status).toBe("ACTIVE");
    expect(membership.isOwner).toBe(true);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgAId } });
    expect(org.ownerUserId).toBe(aliceId);
  });

  it("/auth/me liste les organisations du compte et l'org courante", async () => {
    const me = await request(server())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${aliceToken}`)
      .expect(200);
    expect(me.body.organizationId).toBe(orgAId);
    expect(me.body.organizations.map((o: { id: string }) => o.id)).toEqual([orgAId]);
    expect(me.body.organizations[0].isOwner).toBe(true);
  });

  it("refuse le switch vers une org non membre (403 NOT_A_MEMBER) et l'audite", async () => {
    const res = await request(server())
      .post("/api/v1/auth/switch-organization")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ organizationId: orgBId })
      .expect(403);
    expect(res.body.code).toBe("NOT_A_MEMBER");
    const audit = await prisma.auditLog.findMany({
      where: { action: "security.cross_tenant_access_attempt", userId: aliceId },
    });
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it("isolation : Alice (org A) ne voit pas un projet de l'org B (404)", async () => {
    const projectB = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ name: "Projet secret Beta" })
      .expect(201);

    await request(server())
      .get(`/api/v1/projects/${projectB.body.id}`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .expect(404);
  });

  it("compte multi-org : switch autorisé + rôles résolus PAR organisation", async () => {
    // Alice devient membre de l'org B avec le rôle observer (simulé : futur invite S7c)
    const observer = await prisma.role.findUniqueOrThrow({ where: { key: "observer" as never } });
    const membership = await prisma.organizationMembership.create({
      data: { userId: aliceId, organizationId: orgBId, status: "ACTIVE" },
    });
    await prisma.membershipRole.create({
      data: { membershipId: membership.id, roleId: observer.id },
    });

    // /me voit désormais les 2 organisations
    const me = await request(server())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${aliceToken}`)
      .expect(200);
    expect(me.body.organizations.map((o: { id: string }) => o.id).sort()).toEqual(
      [orgAId, orgBId].sort(),
    );

    // Switch vers B → nouveau jeton, org courante = B
    const switched = await request(server())
      .post("/api/v1/auth/switch-organization")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ organizationId: orgBId })
      .expect(200);
    const bTokenForAlice = switched.body.accessToken;
    expect(switched.body.user.organization.id).toBe(orgBId);

    // Dans B, Alice est observer (pas admin) : /roles (ROLE_MANAGE) est refusé
    await request(server())
      .get("/api/v1/roles")
      .set("Authorization", `Bearer ${bTokenForAlice}`)
      .expect(403);

    // Toujours admin dans A avec son jeton d'origine : /roles autorisé
    await request(server())
      .get("/api/v1/roles")
      .set("Authorization", `Bearer ${aliceToken}`)
      .expect(200);
  });
});
