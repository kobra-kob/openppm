export type DemandUrgency = "low" | "medium" | "high" | "critical";
export type WorkflowStateKind = "initial" | "intermediate" | "final_ok" | "final_ko";
export type RiskLevel = "low" | "medium" | "high";

export interface BusinessCaseRisk {
  id: string;
  label: string;
  probability: RiskLevel;
  impact: RiskLevel;
  severity: RiskLevel;
  mitigation: string | null;
}

export interface BusinessCaseView {
  id: string;
  demandId: string;
  roi: string | null;
  costs: string | null;
  benefits: string | null;
  assumptions: string | null;
  resources: string | null;
  dependencies: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  risks: BusinessCaseRisk[];
  canEdit: boolean;
}

/** Couleur de pastille selon le niveau de risque (probabilité / impact / sévérité). */
export const RISK_BADGE: Record<RiskLevel, string> = {
  low: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  high: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export interface DemandState {
  key: string;
  label: string;
  isFinal: boolean;
}

export interface WorkflowState {
  key: string;
  label: string;
  kind: WorkflowStateKind;
  position: number;
}

export interface WorkflowTransition {
  key: string;
  label: string;
  toStateKey: string;
  toStateLabel: string;
  requiresComment: boolean;
}

export interface WorkflowHistoryEntry {
  transitionKey: string | null;
  fromStateKey: string | null;
  toStateKey: string;
  actorName: string | null;
  comment: string | null;
  createdAt: string;
}

export interface DemandWorkflow {
  definitionKey: string;
  currentState: WorkflowState;
  isFinal: boolean;
  states: WorkflowState[];
  available: WorkflowTransition[];
  history: WorkflowHistoryEntry[];
}

export interface DemandView {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  objectives: string | null;
  justification: string | null;
  requester: { id: string; name: string };
  department: string | null;
  priority: number;
  urgency: DemandUrgency;
  estimatedBudget: number | null;
  estimatedDurationDays: number | null;
  targetPortfolio: { id: string; name: string } | null;
  tags: string[];
  state: DemandState | null;
  /** Projet issu de la conversion (traçabilité), sinon null. */
  project: { id: string; code: string } | null;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DemandDetailView extends DemandView {
  workflow: DemandWorkflow;
}

export interface DemandListView {
  items: DemandView[];
  total: number;
  page: number;
  pageSize: number;
}

/** Couleur de la pastille d'état selon la nature de l'état de workflow. */
export function stateBadgeClass(kind: WorkflowStateKind | undefined): string {
  switch (kind) {
    case "initial":
      return "bg-border-subtle text-muted";
    case "final_ok":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "final_ko":
      return "bg-red-500/15 text-red-600 dark:text-red-400";
    default:
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  }
}

/** Pastille d'urgence. */
export const URGENCY_BADGE: Record<DemandUrgency, string> = {
  low: "bg-border-subtle text-muted",
  medium: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  critical: "bg-red-500/15 text-red-600 dark:text-red-400",
};
