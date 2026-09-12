import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/**
 * Profil de l'organisation (nom + coordonnées) et profil utilisateur (prénom /
 * nom). L'écriture du profil d'organisation exige ORGANIZATION_MANAGE (admin).
 */
describe("Profil organisation & compte (intégration)", () => {
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
        lastName: "Manager",
        userRoles: { create: { roleId: role.id } },
        memberships: {
          create: {
            organizationId: orgId,
            status: "ACTIVE",
            roles: { create: { roleId: role.id } },
          },
        },
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
      organizationName: "Profil Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@profil.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "profil-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@profil.test" } });
    managerToken = await createUser(org.id, "bob@profil.test", "manager", alice.passwordHash);
  });

  afterAll(async () => {
    await app.close();
  });

  it("tout membre lit le profil de l'organisation", async () => {
    const res = await request(server())
      .get("/api/v1/organization/profile")
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(200);
    expect(res.body.name).toBe("Profil Corp");
    expect(res.body.slug).toBe("profil-corp");
  });

  it("un non-administrateur ne peut pas modifier le profil (403)", async () => {
    await request(server())
      .patch("/api/v1/organization/profile")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ name: "Interdit" })
      .expect(403);
  });

  it("l'admin met à jour le nom et les coordonnées de l'organisation", async () => {
    const res = await request(server())
      .patch("/api/v1/organization/profile")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Profil Corp International",
        country: "FR",
        address: "12 rue de la Paix, 75002 Paris",
        vatNumber: "FR12345678901",
        logoUrl: "https://cdn.profil.test/logo.png",
      })
      .expect(200);
    expect(res.body.name).toBe("Profil Corp International");
    expect(res.body.country).toBe("FR");
    expect(res.body.vatNumber).toBe("FR12345678901");
    // Le slug reste immuable malgré le changement de nom.
    expect(res.body.slug).toBe("profil-corp");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "organization.profile_updated" },
    });
    expect(audit).not.toBeNull();
  });

  it("un champ optionnel vide est effacé (null)", async () => {
    const res = await request(server())
      .patch("/api/v1/organization/profile")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ address: "" })
      .expect(200);
    expect(res.body.address).toBeNull();
  });

  it("refuse un nom trop court (400)", async () => {
    await request(server())
      .patch("/api/v1/organization/profile")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "A" })
      .expect(400);
  });

  it("exige un jeton (401)", async () => {
    await request(server()).get("/api/v1/organization/profile").expect(401);
  });

  it("un utilisateur modifie son prénom et son nom, reflété dans /auth/me", async () => {
    const updated = await request(server())
      .patch("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ firstName: "Robert", lastName: "Martin" })
      .expect(200);
    expect(updated.body.firstName).toBe("Robert");
    expect(updated.body.lastName).toBe("Martin");

    const me = await request(server())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(200);
    expect(me.body.firstName).toBe("Robert");
    expect(me.body.lastName).toBe("Martin");
  });

  it("refuse un prénom vide (400)", async () => {
    await request(server())
      .patch("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ firstName: "", lastName: "Martin" })
      .expect(400);
  });
});
