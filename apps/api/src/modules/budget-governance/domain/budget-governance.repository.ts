import type {
  ApprovalDecision,
  ApprovalStep,
  BudgetRequest,
  ProjectStatus,
  RoleKey,
} from "@openppm/db";

export interface ProjectGovernanceContext {
  id: string;
  organizationId: string;
  status: ProjectStatus;
  portfolioId: string | null;
  managerId: string | null;
  members: Array<{ userId: string; role: string }>;
}

export type BudgetRequestWithSteps = BudgetRequest & {
  requestedBy: { firstName: string; lastName: string };
  steps: Array<
    ApprovalStep & { decidedBy: { firstName: string; lastName: string } | null }
  >;
};

export interface CreateBudgetRequestInput {
  organizationId: string;
  projectId: string;
  amount: number;
  capexAmount: number;
  opexAmount: number;
  justification?: string;
  requestedById: string;
  steps: Array<{ stepOrder: number; approverRole: RoleKey }>;
}

export interface BudgetGovernanceRepository {
  loadProjectContext(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectGovernanceContext | null>;
  /** Dernière demande de budget d'un projet (toutes statuts). */
  findLatestRequest(projectId: string): Promise<BudgetRequestWithSteps | null>;
  hasPendingRequest(projectId: string): Promise<boolean>;
  create(input: CreateBudgetRequestInput): Promise<BudgetRequestWithSteps>;
  findRequestById(
    organizationId: string,
    requestId: string,
  ): Promise<BudgetRequestWithSteps | null>;

  /** Applique une décision sur une étape et avance/finalise la demande. */
  decideStep(input: {
    requestId: string;
    stepId: string;
    decision: ApprovalDecision;
    decidedById: string;
    comment?: string;
    /** Si la demande est finalisée approuvée : budget + activation du projet. */
    finalize?: { projectId: string; amount: number; activate: boolean };
    /** Nouvel index d'étape courante si la demande continue. */
    nextStep?: number;
    /** Statut final de la demande si finalisée (approved/rejected). */
    requestStatus?: "approved" | "rejected";
  }): Promise<void>;
}

export const BUDGET_GOVERNANCE_REPOSITORY = Symbol("BUDGET_GOVERNANCE_REPOSITORY");
