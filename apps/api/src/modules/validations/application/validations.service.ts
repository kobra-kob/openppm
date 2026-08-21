import { Inject, Injectable } from "@nestjs/common";
import { RoleKey } from "@openppm/db";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import { BUDGET_GOVERNANCE_REPOSITORY } from "../../budget-governance/domain/budget-governance.repository";
import type { BudgetGovernanceRepository } from "../../budget-governance/domain/budget-governance.repository";
import { DEMAND_ENTITY_TYPE } from "../../demand/domain/demand-workflow";
import { DEMAND_REPOSITORY } from "../../demand/domain/demand.repository";
import type { DemandRepository } from "../../demand/domain/demand.repository";
import { WORKFLOW_REPOSITORY } from "../../workflow/domain/workflow.repository";
import type { WorkflowRepository } from "../../workflow/domain/workflow.repository";

export interface BudgetValidationItem {
  type: "budget";
  requestId: string;
  projectId: string;
  projectName: string;
  amount: number;
  approverRole: string;
  stepId: string;
  createdAt: Date;
}

export interface DemandValidationItem {
  type: "demand";
  demandId: string;
  reference: string;
  title: string;
  stateKey: string;
  stateLabel: string;
}

export interface ValidationsView {
  budget: BudgetValidationItem[];
  demands: DemandValidationItem[];
  total: number;
}

/**
 * Agrège les éléments en attente d'une décision de l'utilisateur courant :
 * étapes d'approbation budgétaire qui lui reviennent (hors ses propres demandes,
 * séparation des responsabilités) et demandes dont il peut franchir une étape.
 */
@Injectable()
export class ValidationsService {
  constructor(
    @Inject(BUDGET_GOVERNANCE_REPOSITORY)
    private readonly budget: BudgetGovernanceRepository,
    @Inject(DEMAND_REPOSITORY) private readonly demands: DemandRepository,
    @Inject(WORKFLOW_REPOSITORY) private readonly workflow: WorkflowRepository,
  ) {}

  async listForUser(payload: JwtPayload): Promise<ValidationsView> {
    const [budget, demands] = await Promise.all([
      this.budgetValidations(payload),
      this.demandValidations(payload),
    ]);
    return { budget, demands, total: budget.length + demands.length };
  }

  private async budgetValidations(payload: JwtPayload): Promise<BudgetValidationItem[]> {
    const pending = await this.budget.listPendingApprovals(payload.org);
    const isAdmin = payload.roles.includes(RoleKey.admin);
    return pending
      .filter(
        (item) =>
          // Séparation des responsabilités : jamais sa propre demande
          item.requestedById !== payload.sub &&
          (isAdmin || payload.roles.includes(item.currentApproverRole)),
      )
      .map((item) => ({
        type: "budget" as const,
        requestId: item.requestId,
        projectId: item.projectId,
        projectName: item.projectName,
        amount: item.amount,
        approverRole: item.currentApproverRole,
        stepId: item.currentStepId,
        createdAt: item.createdAt,
      }));
  }

  private async demandValidations(payload: JwtPayload): Promise<DemandValidationItem[]> {
    const definition = await this.workflow.findDefaultDefinition(payload.org, DEMAND_ENTITY_TYPE);
    if (!definition) {
      return [];
    }
    // États depuis lesquels l'utilisateur dispose d'une transition d'approbation
    // (restreinte à un rôle qu'il possède). Les transitions ouvertes à tous
    // (ex. « Soumettre », action du demandeur) sont exclues de la file.
    const actionableStates = new Set<string>();
    for (const transition of definition.transitions) {
      if (
        transition.allowedRoles.length > 0 &&
        transition.allowedRoles.some((role) => payload.roles.includes(role))
      ) {
        actionableStates.add(transition.fromStateKey);
      }
    }
    if (actionableStates.size === 0) {
      return [];
    }

    const open = await this.workflow.listOpenInstanceStates(payload.org, DEMAND_ENTITY_TYPE);
    const relevant = open.filter((instance) => actionableStates.has(instance.currentStateKey));
    if (relevant.length === 0) {
      return [];
    }

    const stateByEntity = new Map(relevant.map((r) => [r.entityId, r.currentStateKey]));
    const stateLabelByKey = new Map(definition.states.map((s) => [s.key, s.label]));
    const summaries = await this.demands.findSummariesByIds(
      payload.org,
      relevant.map((r) => r.entityId),
    );
    return summaries.map((summary) => {
      const stateKey = stateByEntity.get(summary.id) ?? "";
      return {
        type: "demand" as const,
        demandId: summary.id,
        reference: summary.reference,
        title: summary.title,
        stateKey,
        stateLabel: stateLabelByKey.get(stateKey) ?? stateKey,
      };
    });
  }
}
