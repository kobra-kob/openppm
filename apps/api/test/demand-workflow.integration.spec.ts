import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";

/**
 * D2 : le cycle de vie d'une demande piloté par le moteur de workflow.
 * Vérifie le circuit complet, les rôles à chaque étape, le rejet, l'historique
 * et la notification du demandeur.
 */
describe("Workflow des demandes (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bobToken: string; // collaborateur (employee) — auteur
  let bobId: string;
  let chloeToken: string; // autre collaboratrice
  let managerToken: string; // Mona
  let pmoToken: string; // Paul
  let financeToken: string; // Fred
  let execToken: string; // Diane (Direction / comité)

  const server = () => app.getHttpServer();
  const tr = (id: string, key: string) => `/api/v1/demands/${id}/transitions/${key}`;

  const createUser = async (
    orgId: string,
    email: string,
    firstName: string,
    roleKey: string,
    passwordHash: string,
  ): Promise<{ id: string; token: string }> => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey as never } });
    const user = await prisma.user.create({
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
    return { id: user.id, token: login.body.accessToken };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.demandTag.deleteMany();
    await prisma.demand.deleteMany();
    await prisma.workflowTransitionLog.deleteMany();
    await prisma.workflowInstance.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflowState.deleteMany();
    await prisma.workflowDefinition.deleteMany();
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

    await request(server()).post("/api/v1/auth/register").send({
      organizationName: "Flux Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@flux.test",
      password: "SuperSecret123",
    });
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "flux-corp" } });
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@flux.test" } });
    const hash = alice.passwordHash;

    const bob = await createUser(org.id, "bob@flux.test", "Bob", "employee", hash);
    bobToken = bob.token;
    bobId = bob.id;
    chloeToken = (await createUser(org.id, "chloe@flux.test", "Chloé", "employee", hash)).token;
    managerToken = (await createUser(org.id, "mona@flux.test", "Mona", "manager", hash)).token;
    pmoToken = (await createUser(org.id, "paul@flux.test", "Paul", "pmo", hash)).token;
    financeToken = (await createUser(org.id, "fred@flux.test", "Fred", "finance", hash)).token;
    execToken = (await createUser(org.id, "diane@flux.test", "Diane", "executive", hash)).token;
  });

  afterAll(async () => {
    await app.close();
  });

  const newDemand = async (): Promise<string> => {
    const created = await request(server())
      .post("/api/v1/demands")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ title: "Nouvelle demande" })
      .expect(201);
    return created.body.id;
  };

  it("à la création, la demande démarre à l'état Brouillon avec la seule transition « Soumettre »", async () => {
    const created = await request(server())
      .post("/api/v1/demands")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ title: "Portail RH" })
      .expect(201);

    expect(created.body.state.key).toBe("draft");
    expect(created.body.state.isFinal).toBe(false);
    expect(created.body.workflow.currentState.key).toBe("draft");
    // Le demandeur (employee) ne peut que soumettre
    expect(created.body.workflow.available.map((t: { key: string }) => t.key)).toEqual(["submit"]);
    // Les 9 états du circuit sont présents pour l'indicateur d'étapes
    expect(created.body.workflow.states).toHaveLength(9);
  });

  it("déroule le circuit complet jusqu'à la création du projet (comité)", async () => {
    const id = await newDemand();

    await request(server()).post(tr(id, "submit")).set("Authorization", `Bearer ${bobToken}`).send({}).expect(201);

    const afterSubmit = await request(server())
      .get(`/api/v1/demands/${id}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(200);
    expect(afterSubmit.body.state.key).toBe("submitted");
    // Le manager voit valider / demander des compléments / rejeter
    expect(afterSubmit.body.workflow.available.map((t: { key: string }) => t.key).sort()).toEqual([
      "manager_approve",
      "reject_manager",
      "request_changes",
    ]);

    await request(server()).post(tr(id, "manager_approve")).set("Authorization", `Bearer ${managerToken}`).send({}).expect(201);
    await request(server()).post(tr(id, "pmo_qualify")).set("Authorization", `Bearer ${pmoToken}`).send({}).expect(201);
    await request(server()).post(tr(id, "prepare_business_case")).set("Authorization", `Bearer ${pmoToken}`).send({}).expect(201);
    await request(server()).post(tr(id, "finance_validate")).set("Authorization", `Bearer ${financeToken}`).send({}).expect(201);
    await request(server()).post(tr(id, "submit_to_committee")).set("Authorization", `Bearer ${financeToken}`).send({}).expect(201);

    const approved = await request(server())
      .post(tr(id, "committee_approve"))
      .set("Authorization", `Bearer ${execToken}`)
      .send({})
      .expect(201);
    expect(approved.body.state.key).toBe("approved");
    expect(approved.body.state.isFinal).toBe(true);
    expect(approved.body.workflow.available).toHaveLength(0);
    // Historique : draft + 7 franchissements = 8 entrées
    expect(approved.body.workflow.history).toHaveLength(8);

    // L'automatisation « projet prêt » a été journalisée (conversion au lot D4)
    const ready = await prisma.auditLog.findMany({
      where: { action: "demand.ready_for_project", entityId: id },
    });
    expect(ready.length).toBe(1);
  });

  it("refuse une transition non autorisée par le rôle (403)", async () => {
    const id = await newDemand();
    await request(server()).post(tr(id, "submit")).set("Authorization", `Bearer ${bobToken}`).send({}).expect(201);

    // Bob (auteur mais employé) ne peut pas valider en tant que manager
    await request(server())
      .post(tr(id, "manager_approve"))
      .set("Authorization", `Bearer ${bobToken}`)
      .send({})
      .expect(403);

    // La finance ne peut pas valider à l'étape manager
    await request(server())
      .post(tr(id, "manager_approve"))
      .set("Authorization", `Bearer ${financeToken}`)
      .send({})
      .expect(403);
  });

  it("un tiers non transverse ne peut pas agir sur la demande d'autrui (403)", async () => {
    const id = await newDemand();
    await request(server())
      .post(tr(id, "submit"))
      .set("Authorization", `Bearer ${chloeToken}`)
      .send({})
      .expect(403);
  });

  it("refuse une transition hors de l'état courant (400)", async () => {
    const id = await newDemand();
    // « pmo_qualify » n'est pas franchissable depuis « draft »
    await request(server())
      .post(tr(id, "pmo_qualify"))
      .set("Authorization", `Bearer ${pmoToken}`)
      .send({})
      .expect(400);
  });

  it("le rejet exige un commentaire et mène à un état terminal défavorable", async () => {
    const id = await newDemand();
    await request(server()).post(tr(id, "submit")).set("Authorization", `Bearer ${bobToken}`).send({}).expect(201);

    // Sans commentaire → 400
    await request(server())
      .post(tr(id, "reject_manager"))
      .set("Authorization", `Bearer ${managerToken}`)
      .send({})
      .expect(400);

    const rejected = await request(server())
      .post(tr(id, "reject_manager"))
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ comment: "Hors périmètre stratégique" })
      .expect(201);
    expect(rejected.body.state.key).toBe("rejected");
    expect(rejected.body.state.isFinal).toBe(true);
    expect(rejected.body.workflow.history.at(-1).comment).toBe("Hors périmètre stratégique");
  });

  it("notifie le demandeur quand quelqu'un d'autre fait avancer sa demande", async () => {
    const id = await newDemand();
    await request(server()).post(tr(id, "submit")).set("Authorization", `Bearer ${bobToken}`).send({}).expect(201);
    await request(server()).post(tr(id, "manager_approve")).set("Authorization", `Bearer ${managerToken}`).send({}).expect(201);

    const notifs = await prisma.notification.findMany({
      where: { userId: bobId, type: "demand.transition" },
    });
    expect(notifs.length).toBeGreaterThanOrEqual(1);
  });

  it("« demander des compléments » renvoie la demande au brouillon", async () => {
    const id = await newDemand();
    await request(server()).post(tr(id, "submit")).set("Authorization", `Bearer ${bobToken}`).send({}).expect(201);
    const back = await request(server())
      .post(tr(id, "request_changes"))
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ comment: "Merci de préciser le budget" })
      .expect(201);
    expect(back.body.state.key).toBe("draft");
    // Le demandeur peut à nouveau soumettre
    const forBob = await request(server())
      .get(`/api/v1/demands/${id}`)
      .set("Authorization", `Bearer ${bobToken}`)
      .expect(200);
    expect(forBob.body.workflow.available.map((t: { key: string }) => t.key)).toEqual(["submit"]);
  });
});
