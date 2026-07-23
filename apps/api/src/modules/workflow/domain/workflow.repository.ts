import type { WorkflowStateKind } from "@openppm/db";

export const WORKFLOW_REPOSITORY = Symbol("WORKFLOW_REPOSITORY");

/** État d'un workflow, identifié par sa clé au sein de la définition. */
export interface WorkflowStateRecord {
  id: string;
  key: string;
  label: string;
  kind: WorkflowStateKind;
  position: number;
}

/** Transition entre deux états, ouverte à certains rôles. */
export interface WorkflowTransitionRecord {
  id: string;
  key: string;
  label: string;
  fromStateKey: string;
  toStateKey: string;
  /** Clés de rôles autorisés ; vide = aucune restriction de rôle. */
  allowedRoles: string[];
  requiresComment: boolean;
  autoAction: Record<string, unknown> | null;
  position: number;
}

export interface WorkflowDefinitionRecord {
  id: string;
  key: string;
  entityType: string;
  name: string;
  isDefault: boolean;
  active: boolean;
  states: WorkflowStateRecord[];
  transitions: WorkflowTransitionRecord[];
}

export interface WorkflowLogRecord {
  transitionKey: string | null;
  fromStateKey: string | null;
  toStateKey: string;
  actorName: string | null;
  comment: string | null;
  createdAt: Date;
}

export interface WorkflowInstanceRecord {
  id: string;
  definitionId: string;
  entityType: string;
  entityId: string;
  currentStateKey: string;
  startedAt: Date;
  closedAt: Date | null;
  logs: WorkflowLogRecord[];
}

/** Définition déclarative, utilisée pour créer ou mettre à jour un workflow. */
export interface WorkflowDefinitionInput {
  key: string;
  entityType: string;
  name: string;
  isDefault?: boolean;
  states: Array<{
    key: string;
    label: string;
    kind: WorkflowStateKind;
  }>;
  transitions: Array<{
    key: string;
    label: string;
    fromStateKey: string;
    toStateKey: string;
    allowedRoles?: string[];
    requiresComment?: boolean;
    autoAction?: Record<string, unknown>;
  }>;
}

export interface WorkflowRepository {
  findDefinitionByKey(
    organizationId: string,
    key: string,
  ): Promise<WorkflowDefinitionRecord | null>;
  /** Définition active marquée par défaut pour ce type d'entité. */
  findDefaultDefinition(
    organizationId: string,
    entityType: string,
  ): Promise<WorkflowDefinitionRecord | null>;
  findDefinitionById(id: string): Promise<WorkflowDefinitionRecord | null>;
  listDefinitions(organizationId: string): Promise<WorkflowDefinitionRecord[]>;
  /** Crée la définition ou remplace intégralement ses états et transitions. */
  upsertDefinition(
    organizationId: string,
    input: WorkflowDefinitionInput,
  ): Promise<WorkflowDefinitionRecord>;

  findInstance(entityType: string, entityId: string): Promise<WorkflowInstanceRecord | null>;
  /** État courant de plusieurs entités, en une requête (listes). */
  findInstanceStates(
    entityType: string,
    entityIds: string[],
  ): Promise<Map<string, { stateKey: string; stateLabel: string; kind: WorkflowStateKind }>>;
  createInstance(input: {
    organizationId: string;
    definitionId: string;
    entityType: string;
    entityId: string;
    initialStateId: string;
    initialStateKey: string;
    actorId: string | null;
  }): Promise<WorkflowInstanceRecord>;
  /** Déplace l'instance et journalise le franchissement (transaction). */
  applyTransition(input: {
    instanceId: string;
    toStateId: string;
    closed: boolean;
    transitionKey: string;
    fromStateKey: string;
    toStateKey: string;
    actorId: string | null;
    comment: string | null;
  }): Promise<WorkflowInstanceRecord>;
}
