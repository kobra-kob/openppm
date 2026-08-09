import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { WorkflowStateKind } from "@openppm/db";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { resetDatabase } from "./reset-db";
import type { JwtPayload } from "../src/modules/auth/application/jwt-payload";
import {
  WorkflowService,
} from "../src/modules/workflow/application/workflow.service";
import type { WorkflowDefinitionInput } from "../src/modules/workflow/domain/workflow.repository";

/**
 * Moteur de workflow générique (lot D0). Aucun contrôleur n'est exposé à ce
 * stade : le service est éprouvé directement sur une base MySQL réelle.
 */
describe("Moteur de workflow (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let workflow: WorkflowService;
  let orgId: string;
  let collaborateur: JwtPayload;
  let manager: JwtPayload;
  let admin: JwtPayload;

  const ENTITY = "demand";
  const context = { ip: "127.0.0.1", userAgent: "jest" };

  /** Circuit d'essai : brouillon → soumise → validée / rejetée. */
  const definition: WorkflowDefinitionInput = {
    key: "demand-test",
    entityType: ENTITY,
    name: "Circuit de test",
    isDefault: true,
    states: [
      { key: "draft", label: "Brouillon", kind: WorkflowStateKind.initial },
      { key: "submitted", label: "Soumise", kind: WorkflowStateKind.intermediate },
      { key: "approved", label: "Validée", kind: WorkflowStateKind.final_ok },
      { key: "rejected", label: "Rejetée", kind: WorkflowStateKind.final_ko },
    ],
    transitions: [
      { key: "submit", label: "Soumettre", fromStateKey: "draft", toStateKey: "submitted" },
      {
        key: "approve",
        label: "Approuver",
        fromStateKey: "submitted",
        toStateKey: "approved",
        allowedRoles: ["manager"],
        autoAction: { createProject: true },
      },
      {
        key: "reject",
        label: "Rejeter",
        fromStateKey: "submitted",
        toStateKey: "rejected",
        allowedRoles: ["manager"],
        requiresComment: true,
      },
    ],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await resetDatabase(prisma);

    workflow = app.get(WorkflowService);

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

    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      organizationName: "Workflow Corp",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@workflow.test",
      password: "SuperSecret123",
    });
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "workflow-corp" } });
    orgId = org.id;
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@workflow.test" } });

    admin = { sub: alice.id, email: alice.email, org: orgId, roles: ["admin"], name: "Alice" };
    collaborateur = { ...admin, roles: ["employee"], name: "Bob" };
    manager = { ...admin, roles: ["manager"], name: "Mona" };
  });

  afterAll(async () => {
    await app.close();
  });

  it("refuse une définition sans état initial unique (400)", async () => {
    await expect(
      workflow.defineWorkflow(orgId, {
        ...definition,
        key: "invalide",
        states: [{ key: "a", label: "A", kind: WorkflowStateKind.intermediate }],
        transitions: [],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuse une transition dont l'état cible est inconnu (400)", async () => {
    await expect(
      workflow.defineWorkflow(orgId, {
        ...definition,
        key: "invalide-2",
        transitions: [
          { key: "x", label: "X", fromStateKey: "draft", toStateKey: "inexistant" },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("enregistre la définition, et la réappliquer est idempotent", async () => {
    const created = await workflow.defineWorkflow(orgId, definition);
    expect(created.states).toHaveLength(4);
    expect(created.transitions).toHaveLength(3);

    // Rejouer la même définition ne duplique rien (fusion par clé)
    const again = await workflow.defineWorkflow(orgId, definition);
    expect(again.states).toHaveLength(4);
    expect(again.transitions).toHaveLength(3);
    expect(again.id).toBe(created.id);
  });

  it("démarre une instance sur l'état initial et refuse un second démarrage", async () => {
    const view = await workflow.start(collaborateur, ENTITY, "entity-1");
    expect(view.currentState.key).toBe("draft");
    expect(view.isFinal).toBe(false);
    expect(view.states.map((s) => s.key)).toEqual(["draft", "submitted", "approved", "rejected"]);
    // Transition « submit » sans restriction de rôle : ouverte au collaborateur
    expect(view.available.map((t) => t.key)).toEqual(["submit"]);

    await expect(workflow.start(collaborateur, ENTITY, "entity-1")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("n'expose que les transitions autorisées par le rôle de l'appelant", async () => {
    await workflow.fire(collaborateur, ENTITY, "entity-1", "submit", undefined, context);

    // Le collaborateur ne voit aucune suite : approve/reject sont réservés au manager
    const forEmployee = await workflow.describe(collaborateur, ENTITY, "entity-1");
    expect(forEmployee.currentState.key).toBe("submitted");
    expect(forEmployee.available).toHaveLength(0);

    const forManager = await workflow.describe(manager, ENTITY, "entity-1");
    expect(forManager.available.map((t) => t.key).sort()).toEqual(["approve", "reject"]);

    // L'administrateur peut arbitrer toute étape
    const forAdmin = await workflow.describe(admin, ENTITY, "entity-1");
    expect(forAdmin.available).toHaveLength(2);
  });

  it("refuse une transition hors de l'état courant (400) et un rôle insuffisant (403)", async () => {
    await expect(
      workflow.fire(manager, ENTITY, "entity-1", "submit", undefined, context),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      workflow.fire(collaborateur, ENTITY, "entity-1", "approve", undefined, context),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("impose le commentaire quand la transition l'exige (400)", async () => {
    await expect(
      workflow.fire(manager, ENTITY, "entity-1", "reject", "   ", context),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("franchit une transition, clôture sur un état terminal et remonte l'automatisation", async () => {
    const result = await workflow.fire(manager, ENTITY, "entity-1", "approve", undefined, context);

    expect(result.fromStateKey).toBe("submitted");
    expect(result.toStateKey).toBe("approved");
    expect(result.isFinal).toBe(true);
    expect(result.autoAction).toEqual({ createProject: true });
    expect(result.view.available).toHaveLength(0);

    // Historique complet : création + soumission + approbation
    expect(result.view.history.map((entry) => entry.toStateKey)).toEqual([
      "draft",
      "submitted",
      "approved",
    ]);
    expect(result.view.history.at(-1)?.transitionKey).toBe("approve");

    const instance = await prisma.workflowInstance.findUniqueOrThrow({
      where: { entityType_entityId: { entityType: ENTITY, entityId: "entity-1" } },
    });
    expect(instance.closedAt).not.toBeNull();
  });

  it("trace le franchissement dans le journal d'audit", async () => {
    const entries = await prisma.auditLog.findMany({
      where: { action: "workflow.transition", entityId: "entity-1" },
    });
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it("le chemin de rejet mène à un état terminal défavorable", async () => {
    await workflow.start(collaborateur, ENTITY, "entity-2");
    await workflow.fire(collaborateur, ENTITY, "entity-2", "submit", undefined, context);
    const rejected = await workflow.fire(
      manager,
      ENTITY,
      "entity-2",
      "reject",
      "Hors budget",
      context,
    );
    expect(rejected.toStateKey).toBe("rejected");
    expect(rejected.isFinal).toBe(true);
    expect(rejected.view.history.at(-1)?.comment).toBe("Hors budget");
  });
});
