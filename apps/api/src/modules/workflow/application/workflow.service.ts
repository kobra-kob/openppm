import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { RoleKey, WorkflowStateKind } from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { WORKFLOW_REPOSITORY } from "../domain/workflow.repository";
import type {
  WorkflowDefinitionInput,
  WorkflowDefinitionRecord,
  WorkflowInstanceRecord,
  WorkflowRepository,
} from "../domain/workflow.repository";

/** États terminaux : plus aucune transition n'est proposée. */
const FINAL_KINDS: WorkflowStateKind[] = [WorkflowStateKind.final_ok, WorkflowStateKind.final_ko];

export interface WorkflowStateView {
  key: string;
  label: string;
  kind: WorkflowStateKind;
  position: number;
}

export interface WorkflowTransitionView {
  key: string;
  label: string;
  toStateKey: string;
  toStateLabel: string;
  requiresComment: boolean;
}

export interface WorkflowView {
  definitionKey: string;
  entityType: string;
  entityId: string;
  currentState: WorkflowStateView;
  isFinal: boolean;
  /** Tous les états, dans l'ordre : alimente l'indicateur d'étapes. */
  states: WorkflowStateView[];
  /** Transitions franchissables *par l'appelant* depuis l'état courant. */
  available: WorkflowTransitionView[];
  history: Array<{
    transitionKey: string | null;
    fromStateKey: string | null;
    toStateKey: string;
    actorName: string | null;
    comment: string | null;
    createdAt: Date;
  }>;
}

export interface TransitionResult {
  view: WorkflowView;
  fromStateKey: string;
  toStateKey: string;
  isFinal: boolean;
  /** Automatisation déclarée sur la transition, à interpréter par l'appelant. */
  autoAction: Record<string, unknown> | null;
}

/**
 * Moteur de workflow générique. Il ignore tout du métier : les états, les
 * transitions et les rôles autorisés proviennent de la base. Les modules
 * métier l'appellent pour démarrer une instance, lire l'état courant et
 * franchir une transition.
 */
@Injectable()
export class WorkflowService {
  constructor(
    @Inject(WORKFLOW_REPOSITORY) private readonly repository: WorkflowRepository,
    private readonly audit: AuditService,
  ) {}

  /** Crée ou mets à jour une définition (administration, amorçage). */
  async defineWorkflow(
    organizationId: string,
    input: WorkflowDefinitionInput,
  ): Promise<WorkflowDefinitionRecord> {
    const initial = input.states.filter((state) => state.kind === WorkflowStateKind.initial);
    if (initial.length !== 1) {
      throw new BadRequestException({
        code: "WORKFLOW_INVALID_DEFINITION",
        message: "La définition doit comporter exactement un état initial",
      });
    }
    const keys = new Set(input.states.map((state) => state.key));
    for (const transition of input.transitions) {
      if (!keys.has(transition.fromStateKey) || !keys.has(transition.toStateKey)) {
        throw new BadRequestException({
          code: "WORKFLOW_INVALID_DEFINITION",
          message: `Transition « ${transition.key} » : état source ou cible inconnu`,
        });
      }
    }
    return this.repository.upsertDefinition(organizationId, input);
  }

  listDefinitions(payload: JwtPayload): Promise<WorkflowDefinitionRecord[]> {
    return this.repository.listDefinitions(payload.org);
  }

  /** Démarre le workflow d'une entité sur l'état initial de la définition. */
  async start(
    payload: JwtPayload,
    entityType: string,
    entityId: string,
    definitionKey?: string,
  ): Promise<WorkflowView> {
    const existing = await this.repository.findInstance(entityType, entityId);
    if (existing) {
      throw new BadRequestException({
        code: "WORKFLOW_ALREADY_STARTED",
        message: "Un workflow est déjà en cours pour cette entité",
      });
    }
    const definition = definitionKey
      ? await this.repository.findDefinitionByKey(payload.org, definitionKey)
      : await this.repository.findDefaultDefinition(payload.org, entityType);
    if (!definition) {
      throw new NotFoundException({
        code: "WORKFLOW_DEFINITION_NOT_FOUND",
        message: "Aucune définition de workflow disponible pour ce type d'entité",
      });
    }
    const initial = definition.states.find((state) => state.kind === WorkflowStateKind.initial);
    if (!initial) {
      throw new BadRequestException({
        code: "WORKFLOW_INVALID_DEFINITION",
        message: "La définition ne comporte pas d'état initial",
      });
    }
    const instance = await this.repository.createInstance({
      organizationId: payload.org,
      definitionId: definition.id,
      entityType,
      entityId,
      initialStateId: initial.id,
      initialStateKey: initial.key,
      actorId: payload.sub,
    });
    return this.toView(payload, definition, instance);
  }

  /** État courant, étapes et transitions franchissables par l'appelant. */
  async describe(
    payload: JwtPayload,
    entityType: string,
    entityId: string,
  ): Promise<WorkflowView> {
    const { definition, instance } = await this.load(entityType, entityId);
    return this.toView(payload, definition, instance);
  }

  /** Franchit une transition depuis l'état courant. */
  async fire(
    payload: JwtPayload,
    entityType: string,
    entityId: string,
    transitionKey: string,
    comment: string | undefined,
    context: RequestContext,
  ): Promise<TransitionResult> {
    const { definition, instance } = await this.load(entityType, entityId);
    const transition = definition.transitions.find(
      (candidate) =>
        candidate.key === transitionKey && candidate.fromStateKey === instance.currentStateKey,
    );
    if (!transition) {
      throw new BadRequestException({
        code: "WORKFLOW_TRANSITION_NOT_AVAILABLE",
        message: "Cette transition n'est pas franchissable depuis l'état courant",
      });
    }
    if (!this.canFire(payload, transition.allowedRoles)) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Votre rôle ne permet pas de franchir cette étape",
      });
    }
    if (transition.requiresComment && !comment?.trim()) {
      throw new BadRequestException({
        code: "WORKFLOW_COMMENT_REQUIRED",
        message: "Un commentaire est obligatoire pour cette transition",
      });
    }
    const target = definition.states.find((state) => state.key === transition.toStateKey);
    if (!target) {
      throw new BadRequestException({
        code: "WORKFLOW_INVALID_DEFINITION",
        message: "État cible introuvable dans la définition",
      });
    }

    const isFinal = FINAL_KINDS.includes(target.kind);
    const fromStateKey = instance.currentStateKey;
    const updated = await this.repository.applyTransition({
      instanceId: instance.id,
      toStateId: target.id,
      closed: isFinal,
      transitionKey: transition.key,
      fromStateKey,
      toStateKey: target.key,
      actorId: payload.sub,
      comment: comment?.trim() || null,
    });

    await this.audit.log({
      action: "workflow.transition",
      entityType,
      entityId,
      organizationId: payload.org,
      userId: payload.sub,
      after: { transition: transition.key, from: fromStateKey, to: target.key },
      ...context,
    });

    return {
      view: this.toView(payload, definition, updated),
      fromStateKey,
      toStateKey: target.key,
      isFinal,
      autoAction: transition.autoAction,
    };
  }

  // ── Aides privées ────────────────────────────────────────────────────

  private async load(
    entityType: string,
    entityId: string,
  ): Promise<{ definition: WorkflowDefinitionRecord; instance: WorkflowInstanceRecord }> {
    const instance = await this.repository.findInstance(entityType, entityId);
    if (!instance) {
      throw new NotFoundException({
        code: "WORKFLOW_INSTANCE_NOT_FOUND",
        message: "Aucun workflow en cours pour cette entité",
      });
    }
    const definition = await this.repository.findDefinitionById(instance.definitionId);
    if (!definition) {
      throw new NotFoundException({
        code: "WORKFLOW_DEFINITION_NOT_FOUND",
        message: "Définition de workflow introuvable",
      });
    }
    return { definition, instance };
  }

  /** L'administrateur peut arbitrer toute étape, comme ailleurs dans l'app. */
  private canFire(payload: JwtPayload, allowedRoles: string[]): boolean {
    if (allowedRoles.length === 0) {
      return true;
    }
    return (
      payload.roles.includes(RoleKey.admin) ||
      payload.roles.some((role) => allowedRoles.includes(role))
    );
  }

  private toView(
    payload: JwtPayload,
    definition: WorkflowDefinitionRecord,
    instance: WorkflowInstanceRecord,
  ): WorkflowView {
    const current = definition.states.find((state) => state.key === instance.currentStateKey);
    if (!current) {
      throw new NotFoundException({
        code: "WORKFLOW_INVALID_DEFINITION",
        message: "État courant absent de la définition",
      });
    }
    const isFinal = FINAL_KINDS.includes(current.kind);
    const labels = new Map(definition.states.map((state) => [state.key, state.label]));
    return {
      definitionKey: definition.key,
      entityType: instance.entityType,
      entityId: instance.entityId,
      currentState: view(current),
      isFinal,
      states: definition.states.map(view),
      available: isFinal
        ? []
        : definition.transitions
            .filter(
              (transition) =>
                transition.fromStateKey === current.key &&
                this.canFire(payload, transition.allowedRoles),
            )
            .map((transition) => ({
              key: transition.key,
              label: transition.label,
              toStateKey: transition.toStateKey,
              toStateLabel: labels.get(transition.toStateKey) ?? transition.toStateKey,
              requiresComment: transition.requiresComment,
            })),
      history: instance.logs,
    };
  }
}

function view(state: {
  key: string;
  label: string;
  kind: WorkflowStateKind;
  position: number;
}): WorkflowStateView {
  return { key: state.key, label: state.label, kind: state.kind, position: state.position };
}
