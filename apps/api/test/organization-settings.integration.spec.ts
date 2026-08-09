import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";

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

    await prisma.businessCaseRisk.deleteMany();
    await prisma.businessCase.deleteMany();
    await prisma.risk.deleteMany();
    await prisma.document.deleteMany();
    await prisma.approvalStep.deleteMany();
    await prisma.budgetRequest.deleteMany();
    await prisma.workflowTransitionLog.deleteMany();
    await prisma.workflowInstance.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflowState.deleteMany();
    await prisma.workflowDefinition.deleteMany();
    await prisma.demandTag.deleteMany();
    await prisma.demand.deleteMany();
    await prisma.quoteLine.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.costEntry.deleteMany();
    await prisma.budgetLine.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.notification.deleteMany();
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
    await prisma.refreshToken.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.groupMember.deleteMany();
    await prisma.group.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();

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

  it("désactivée, un administrateur peut toujours créer un projet directement", async () => {
    await request(server())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Projet admin" })
      .expect(201);
  });

  it("exige un jeton (401)", async () => {
    await request(server()).get("/api/v1/organization/settings").expect(401);
  });
});
