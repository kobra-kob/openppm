import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/**
 * Demand Management, lot D7 : la création directe de projet est gouvernée par
 * l'organisation (allowDirectProjectCreation). Désactivée, seul un admin crée.
 */
describe("Paramètres organisation — création directe de projet (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;

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
        firstName: "Bob",
        lastName: "Test",
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
      organizationName: "Gov Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@gov.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "gov-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@gov.test" } });
    managerToken = await createUser(org.id, "bob@gov.test", "manager", alice.passwordHash);
  });

  afterAll(async () => {
    await app.close();
  });

  it("par défaut, la création directe est autorisée et un membre peut créer un projet", async () => {
    const settings = await request(server())
      .get("/api/v1/organization/settings")
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(200);
    expect(settings.body.allowDirectProjectCreation).toBe(true);

    const project = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ name: "Projet direct autorisé" })
      .expect(201);
    // Projet créé directement : pas d'origine (demande)
    expect(project.body.origin).toBeNull();
  });

  it("un non-administrateur ne peut pas modifier le paramètre (403)", async () => {
    await request(server())
      .patch("/api/v1/organization/settings")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ allowDirectProjectCreation: false })
      .expect(403);
  });

  it("l'admin désactive la création directe", async () => {
    const response = await request(server())
      .patch("/api/v1/organization/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ allowDirectProjectCreation: false })
      .expect(200);
    expect(response.body.allowDirectProjectCreation).toBe(false);
  });

  it("désactivée, un membre non-admin ne peut plus créer de projet directement (403)", async () => {
    const response = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ name: "Projet refusé" })
      .expect(403);
    expect(response.body.code).toBe("DIRECT_PROJECT_CREATION_DISABLED");
  });

  it("désactivée, un administrateur doit motiver le contournement (400 sans motif)", async () => {
    const response = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Projet admin" })
      .expect(400);
    expect(response.body.code).toBe("BYPASS_REASON_REQUIRED");
  });

  it("désactivée, un administrateur crée avec motif, tracé comme contournement", async () => {
    const created = await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Projet admin", bypassReason: "Décision Direction hors circuit" })
      .expect(201);
    const audits = await prisma.auditLog.findMany({
      where: { action: "project.created_bypass", entityId: created.body.id },
    });
    expect(audits).toHaveLength(1);
    expect((audits[0]!.after as { bypass?: boolean }).bypass).toBe(true);
  });

  it("exige un jeton (401)", async () => {
    await request(server()).get("/api/v1/organization/settings").expect(401);
  });
});
