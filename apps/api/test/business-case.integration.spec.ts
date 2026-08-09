import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

/** Demand Management, lot D3 : Business Case (justification + risques identifiés). */
describe("Business Case (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string; // Alice — admin
  let pmoToken: string; // Paul — PMO (rédige le Business Case)
  let collabToken: string; // Bob — collaborateur (auteur de la demande)
  let otherOrgToken: string;
  let demandId: string;

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
      organizationName: "BC Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@bc.test",
      password: "SuperSecret123",
    });
    adminToken = admin.body.accessToken;
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "bc-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@bc.test" } });
    pmoToken = await createUser(org.id, "paul@bc.test", "Paul", "pmo", alice.passwordHash);
    collabToken = await createUser(org.id, "bob@bc.test", "Bob", "employee", alice.passwordHash);

    const other = await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Autre BC",
      firstName: "Dan",
      lastName: "Dupont",
      email: "dan@autrebc.test",
      password: "SuperSecret123",
    });
    otherOrgToken = other.body.accessToken;

    const demand = await request(server())
      .post("/api/v1/demands")
      .set("Authorization", `Bearer ${collabToken}`)
      .send({ title: "Refonte du SI RH", estimatedBudget: 120000 })
      .expect(201);
    demandId = demand.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("aucun Business Case au départ : GET renvoie null", async () => {
    const response = await request(server())
      .get(`/api/v1/demands/${demandId}/business-case`)
      .set("Authorization", `Bearer ${collabToken}`)
      .expect(200);
    // Pas encore de Business Case : aucune donnée renvoyée
    expect(response.body?.id).toBeUndefined();
    expect(response.body?.roi).toBeUndefined();
  });

  it("un collaborateur sans rôle transverse ne peut pas rédiger le Business Case (403)", async () => {
    const response = await request(server())
      .put(`/api/v1/demands/${demandId}/business-case`)
      .set("Authorization", `Bearer ${collabToken}`)
      .send({ roi: "Tentative" })
      .expect(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });

  it("le PMO rédige le Business Case avec des risques ; la sévérité est calculée", async () => {
    const response = await request(server())
      .put(`/api/v1/demands/${demandId}/business-case`)
      .set("Authorization", `Bearer ${pmoToken}`)
      .send({
        roi: "Retour sur investissement en 18 mois",
        costs: "Licences + intégration",
        benefits: "Gain de productivité RH",
        assumptions: "Budget voté au T1",
        resources: "1 chef de projet, 2 développeurs",
        dependencies: "Fin du chantier réseau",
        plannedStartDate: "2027-01-15",
        plannedEndDate: "2027-09-30",
        risks: [
          { label: "Reprise de données incomplète", probability: "high", impact: "high", mitigation: "Audit préalable" },
          { label: "Adhésion des utilisateurs", probability: "low", impact: "medium" },
        ],
      })
      .expect(200);

    expect(response.body.roi).toContain("18 mois");
    expect(response.body.plannedStartDate).toBe("2027-01-15");
    expect(response.body.plannedEndDate).toBe("2027-09-30");
    expect(response.body.createdBy.name).toContain("Paul");
    expect(response.body.risks).toHaveLength(2);

    const dataRisk = response.body.risks.find(
      (r: { label: string }) => r.label === "Reprise de données incomplète",
    );
    expect(dataRisk.severity).toBe("high"); // high × high = 9

    const adoptionRisk = response.body.risks.find(
      (r: { label: string }) => r.label === "Adhésion des utilisateurs",
    );
    expect(adoptionRisk.severity).toBe("low"); // low × medium = 2
  });

  it("le PUT est un upsert : les risques sont remplacés intégralement", async () => {
    const response = await request(server())
      .put(`/api/v1/demands/${demandId}/business-case`)
      .set("Authorization", `Bearer ${pmoToken}`)
      .send({
        roi: "Version révisée",
        risks: [{ label: "Nouveau risque unique", probability: "medium", impact: "high" }],
      })
      .expect(200);

    expect(response.body.roi).toBe("Version révisée");
    expect(response.body.risks).toHaveLength(1);
    expect(response.body.risks[0].label).toBe("Nouveau risque unique");
    expect(response.body.risks[0].severity).toBe("high"); // medium × high = 6

    // Vérifie qu'aucun risque orphelin ne subsiste en base
    const remaining = await prisma.businessCaseRisk.count();
    expect(remaining).toBe(1);
  });

  it("le demandeur lit le Business Case mais ne peut pas l'éditer (canEdit=false)", async () => {
    const response = await request(server())
      .get(`/api/v1/demands/${demandId}/business-case`)
      .set("Authorization", `Bearer ${collabToken}`)
      .expect(200);
    expect(response.body.roi).toBe("Version révisée");
    expect(response.body.canEdit).toBe(false);
  });

  it("l'admin peut aussi éditer (canEdit=true)", async () => {
    const response = await request(server())
      .get(`/api/v1/demands/${demandId}/business-case`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body.canEdit).toBe(true);
  });

  it("n'expose pas le Business Case d'une autre organisation (404)", async () => {
    await request(server())
      .get(`/api/v1/demands/${demandId}/business-case`)
      .set("Authorization", `Bearer ${otherOrgToken}`)
      .expect(404);

    await request(server())
      .put(`/api/v1/demands/${demandId}/business-case`)
      .set("Authorization", `Bearer ${otherOrgToken}`)
      .send({ roi: "Intrusion" })
      .expect(404);
  });

  it("exige un jeton (401)", async () => {
    await request(server()).get(`/api/v1/demands/${demandId}/business-case`).expect(401);
  });
});
