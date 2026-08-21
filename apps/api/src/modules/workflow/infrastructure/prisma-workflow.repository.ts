import { Injectable } from "@nestjs/common";
import { Prisma, WorkflowStateKind } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type {
  WorkflowDefinitionInput,
  WorkflowDefinitionRecord,
  WorkflowInstanceRecord,
  WorkflowRepository,
} from "../domain/workflow.repository";

const DEFINITION_INCLUDE = {
  states: { orderBy: { position: "asc" } },
  transitions: {
    orderBy: { position: "asc" },
    include: { fromState: { select: { key: true } }, toState: { select: { key: true } } },
  },
} as const;

const INSTANCE_INCLUDE = {
  currentState: { select: { key: true } },
  logs: {
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { firstName: true, lastName: true } } },
  },
} as const;

@Injectable()
export class PrismaWorkflowRepository implements WorkflowRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findDefinitionByKey(
    organizationId: string,
    key: string,
  ): Promise<WorkflowDefinitionRecord | null> {
    const found = await this.prisma.workflowDefinition.findFirst({
      where: { organizationId, key },
      include: DEFINITION_INCLUDE,
    });
    return found ? toDefinition(found) : null;
  }

  async findDefaultDefinition(
    organizationId: string,
    entityType: string,
  ): Promise<WorkflowDefinitionRecord | null> {
    const found = await this.prisma.workflowDefinition.findFirst({
      where: { organizationId, entityType, active: true, isDefault: true },
      include: DEFINITION_INCLUDE,
    });
    return found ? toDefinition(found) : null;
  }

  async findDefinitionById(id: string): Promise<WorkflowDefinitionRecord | null> {
    const found = await this.prisma.workflowDefinition.findUnique({
      where: { id },
      include: DEFINITION_INCLUDE,
    });
    return found ? toDefinition(found) : null;
  }

  async listDefinitions(organizationId: string): Promise<WorkflowDefinitionRecord[]> {
    const rows = await this.prisma.workflowDefinition.findMany({
      where: { organizationId },
      include: DEFINITION_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => toDefinition(row));
  }

  /**
   * Fusion par clé : les états et transitions existants sont mis à jour,
   * les nouveaux ajoutés, les disparus supprimés. On ne détruit donc jamais
   * un état encore référencé par une instance en cours.
   */
  async upsertDefinition(
    organizationId: string,
    input: WorkflowDefinitionInput,
  ): Promise<WorkflowDefinitionRecord> {
    const definitionId = await this.prisma.$transaction(async (tx) => {
      const definition = await tx.workflowDefinition.upsert({
        where: { organizationId_key: { organizationId, key: input.key } },
        create: {
          organizationId,
          key: input.key,
          entityType: input.entityType,
          name: input.name,
          isDefault: input.isDefault ?? false,
        },
        update: {
          entityType: input.entityType,
          name: input.name,
          isDefault: input.isDefault ?? false,
        },
      });

      // États
      for (const [index, state] of input.states.entries()) {
        await tx.workflowState.upsert({
          where: { definitionId_key: { definitionId: definition.id, key: state.key } },
          create: {
            definitionId: definition.id,
            key: state.key,
            label: state.label,
            kind: state.kind,
            position: index,
          },
          update: { label: state.label, kind: state.kind, position: index },
        });
      }
      const stateKeys = input.states.map((state) => state.key);
      const states = await tx.workflowState.findMany({ where: { definitionId: definition.id } });
      const byKey = new Map(states.map((state) => [state.key, state.id]));

      // Transitions (avant la purge des états : elles les référencent)
      for (const [index, transition] of input.transitions.entries()) {
        const fromId = byKey.get(transition.fromStateKey);
        const toId = byKey.get(transition.toStateKey);
        if (!fromId || !toId) {
          throw new Error(
            `Transition « ${transition.key} » : état ${!fromId ? transition.fromStateKey : transition.toStateKey} inconnu`,
          );
        }
        await tx.workflowTransition.upsert({
          where: { definitionId_key: { definitionId: definition.id, key: transition.key } },
          create: {
            definitionId: definition.id,
            key: transition.key,
            label: transition.label,
            fromStateId: fromId,
            toStateId: toId,
            allowedRoles: (transition.allowedRoles ?? []) as Prisma.InputJsonValue,
            requiresComment: transition.requiresComment ?? false,
            autoAction: (transition.autoAction ?? null) as Prisma.InputJsonValue,
            position: index,
          },
          update: {
            label: transition.label,
            fromStateId: fromId,
            toStateId: toId,
            allowedRoles: (transition.allowedRoles ?? []) as Prisma.InputJsonValue,
            requiresComment: transition.requiresComment ?? false,
            autoAction: (transition.autoAction ?? null) as Prisma.InputJsonValue,
            position: index,
          },
        });
      }

      await tx.workflowTransition.deleteMany({
        where: {
          definitionId: definition.id,
          key: { notIn: input.transitions.map((transition) => transition.key) },
        },
      });
      await tx.workflowState.deleteMany({
        where: { definitionId: definition.id, key: { notIn: stateKeys } },
      });
      return definition.id;
    });

    const saved = await this.findDefinitionById(definitionId);
    if (!saved) {
      throw new Error("Définition de workflow introuvable après enregistrement");
    }
    return saved;
  }

  async findInstance(
    entityType: string,
    entityId: string,
  ): Promise<WorkflowInstanceRecord | null> {
    const found = await this.prisma.workflowInstance.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
      include: INSTANCE_INCLUDE,
    });
    return found ? toInstance(found) : null;
  }

  async listOpenInstanceStates(
    organizationId: string,
    entityType: string,
  ): Promise<Array<{ entityId: string; currentStateKey: string }>> {
    const rows = await this.prisma.workflowInstance.findMany({
      where: { organizationId, entityType, closedAt: null },
      select: { entityId: true, currentState: { select: { key: true } } },
    });
    return rows.map((row) => ({
      entityId: row.entityId,
      currentStateKey: row.currentState.key,
    }));
  }

  async findInstanceStates(
    entityType: string,
    entityIds: string[],
  ): Promise<Map<string, { stateKey: string; stateLabel: string; kind: WorkflowStateKind }>> {
    if (entityIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.workflowInstance.findMany({
      where: { entityType, entityId: { in: entityIds } },
      select: {
        entityId: true,
        currentState: { select: { key: true, label: true, kind: true } },
      },
    });
    return new Map(
      rows.map((row) => [
        row.entityId,
        {
          stateKey: row.currentState.key,
          stateLabel: row.currentState.label,
          kind: row.currentState.kind,
        },
      ]),
    );
  }

  async createInstance(input: {
    organizationId: string;
    definitionId: string;
    entityType: string;
    entityId: string;
    initialStateId: string;
    initialStateKey: string;
    actorId: string | null;
  }): Promise<WorkflowInstanceRecord> {
    const created = await this.prisma.workflowInstance.create({
      data: {
        organizationId: input.organizationId,
        definitionId: input.definitionId,
        entityType: input.entityType,
        entityId: input.entityId,
        currentStateId: input.initialStateId,
        logs: {
          create: {
            toStateKey: input.initialStateKey,
            actorId: input.actorId,
          },
        },
      },
      include: INSTANCE_INCLUDE,
    });
    return toInstance(created);
  }

  async applyTransition(input: {
    instanceId: string;
    toStateId: string;
    closed: boolean;
    transitionKey: string;
    fromStateKey: string;
    toStateKey: string;
    actorId: string | null;
    comment: string | null;
  }): Promise<WorkflowInstanceRecord> {
    const updated = await this.prisma.workflowInstance.update({
      where: { id: input.instanceId },
      data: {
        currentStateId: input.toStateId,
        closedAt: input.closed ? new Date() : null,
        logs: {
          create: {
            transitionKey: input.transitionKey,
            fromStateKey: input.fromStateKey,
            toStateKey: input.toStateKey,
            actorId: input.actorId,
            comment: input.comment,
          },
        },
      },
      include: INSTANCE_INCLUDE,
    });
    return toInstance(updated);
  }
}

// ── Correspondances Prisma → domaine ───────────────────────────────────

type DefinitionRow = Prisma.WorkflowDefinitionGetPayload<{ include: typeof DEFINITION_INCLUDE }>;
type InstanceRow = Prisma.WorkflowInstanceGetPayload<{ include: typeof INSTANCE_INCLUDE }>;

function toDefinition(row: DefinitionRow): WorkflowDefinitionRecord {
  return {
    id: row.id,
    key: row.key,
    entityType: row.entityType,
    name: row.name,
    isDefault: row.isDefault,
    active: row.active,
    states: row.states.map((state) => ({
      id: state.id,
      key: state.key,
      label: state.label,
      kind: state.kind,
      position: state.position,
    })),
    transitions: row.transitions.map((transition) => ({
      id: transition.id,
      key: transition.key,
      label: transition.label,
      fromStateKey: transition.fromState.key,
      toStateKey: transition.toState.key,
      allowedRoles: toStringArray(transition.allowedRoles),
      requiresComment: transition.requiresComment,
      autoAction: toRecord(transition.autoAction),
      position: transition.position,
    })),
  };
}

function toInstance(row: InstanceRow): WorkflowInstanceRecord {
  return {
    id: row.id,
    definitionId: row.definitionId,
    entityType: row.entityType,
    entityId: row.entityId,
    currentStateKey: row.currentState.key,
    startedAt: row.startedAt,
    closedAt: row.closedAt,
    logs: row.logs.map((log) => ({
      transitionKey: log.transitionKey,
      fromStateKey: log.fromStateKey,
      toStateKey: log.toStateKey,
      actorName: log.actor ? `${log.actor.firstName} ${log.actor.lastName}` : null,
      comment: log.comment,
      createdAt: log.createdAt,
    })),
  };
}

function toStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
