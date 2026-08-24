import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/** R8 — Administration des workflows (§19) : reconfigurer les rôles par étape. */
describe("Administration des workflows (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string; // Alice — admin (WORKFLOW_MANAGE)
  let managerToken: string; // Mona — manager
  let pmoToken: string; // Pio — PMO
  let bobToken: string; // Bob — employé (auteur de demande)

  const server = () => app.getHttpServer();

  const createUser = async (
    orgId: string,
    email: string,
    firstName: string,
    roleKey: string,
    passwordHash: string,
  ): Promise<string> => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey as never } });
    await prisma.user.create({
      data: {
        organizationId: orgId,
        email,
        passwordHash,
        firstName,
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
      organizationName: "WF Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@wf.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "wf-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@wf.test" } });
    managerToken = await createUser(org.id, "mona@wf.test", "Mona", "manager", alice.passwordHash);
    pmoToken = await createUser(org.id, "pio@wf.test", "Pio", "pmo", alice.passwordHash);
    bobToken = await createUser(org.id, "bob@wf.test", "Bob", "employee", alice.passwordHash);
  });

  afterAll(async () => {
    await app.close();
  });

  it("réservé à WORKFLOW_MANAGE : un manager ne peut pas administrer (403)", async () => {
    await request(server())
      .get("/api/v1/workflows")
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(403);
  });

  it("l'admin liste le circuit des demandes, même sans demande créée", async () => {
    const response = await request(server())
      .get("/api/v1/workflows")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const demand = response.body.find((d: { key: string }) => d.key === "demand-default");
    expect(demand).toBeDefined();
    const approve = demand.transitions.find((t: { key: string }) => t.key === "manager_approve");
    expect(approve.allowedRoles).toEqual(["manager", "pmo"]);
  });

  it("rejette un rôle inconnu (400) et une transition inconnue (404)", async () => {
    await request(server())
      .patch("/api/v1/workflows/demand-default/transitions/manager_approve")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ allowedRoles: ["not_a_role"], requiresComment: false })
      .expect(400);

    await request(server())
      .patch("/api/v1/workflows/demand-default/transitions/does_not_exist")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ allowedRoles: ["manager"], requiresComment: false })
      .expect(404);
  });

  it("reconfigure une étape et la règle s'applique au moteur immédiatement", async () => {
    // La validation Manager devient réservée au PMO
    const updated = await request(server())
      .patch("/api/v1/workflows/demand-default/transitions/manager_approve")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ allowedRoles: ["pmo"], requiresComment: false })
      .expect(200);
    const approve = updated.body.transitions.find((t: { key: string }) => t.key === "manager_approve");
    expect(approve.allowedRoles).toEqual(["pmo"]);

    // Une demande soumise : le manager ne peut plus valider…
    const demand = await request(server())
      .post("/api/v1/demands")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ title: "Besoin métier" })
      .expect(201);
    const tr = (key: string) => `/api/v1/demands/${demand.body.id}/transitions/${key}`;
    await request(server())
      .post(tr("submit"))
      .set("Authorization", `Bearer ${bobToken}`)
      .send({})
      .expect(201);

    await request(server())
      .post(tr("manager_approve"))
      .set("Authorization", `Bearer ${managerToken}`)
      .send({})
      .expect(403);

    // …mais le PMO oui, désormais
    await request(server())
      .post(tr("manager_approve"))
      .set("Authorization", `Bearer ${pmoToken}`)
      .send({})
      .expect(201);
  });
});
