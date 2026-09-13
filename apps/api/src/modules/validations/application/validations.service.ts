import { Inject, Injectable } from "@nestjs/common";
import { RoleKey } from "@openppm/db";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { BUDGET_GOVERNANCE_REPOSITORY } from "../../budget-governance/domain/budget-governance.repository";
import type { BudgetGovernanceRepository } from "../../budget-governance/domain/budget-governance.repository";
import {
  committeeRequired,
  DEMAND_ENTITY_TYPE,
  FINANCE_REVIEW_STATE,
  T_FINANCE_CREATES_PROJECT,
  T_SUBMIT_TO_COMMITTEE,
} from "../../demand/domain/demand-workflow";
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

export interface DemandTransitionOption {
  key: string;
  label: string;
  requiresComment: boolean;
}

export interface DemandValidationItem {
  type: "demand";
  demandId: string;
  reference: string;
  title: string;
  stateKey: string;
  stateLabel: string;
  /** Transitions d'approbation que l'utilisateur peut franchir depuis cet état. */
  transitions: DemandTransitionOption[];
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
    private readonly prisma: PrismaService,
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
      .filter((item) => isAdmin || payload.roles.includes(item.currentApproverRole))
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
    // Transitions d'approbation franchissables par l'utilisateur, groupées par
    // état de départ. Restreintes à un rôle : l'administrateur les franchit
    // toutes (bypass), sinon il faut posséder l'un des rôles autorisés. Les
    // transitions ouvertes à tous (ex. « Soumettre ») restent hors de la file.
    const isAdmin = payload.roles.includes(RoleKey.admin);
    const optionsByState = new Map<string, DemandTransitionOption[]>();
    for (const transition of definition.transitions) {
      const roleGated = transition.allowedRoles.length > 0;
      const canAct =
        roleGated &&
        (isAdmin || transition.allowedRoles.some((role) => payload.roles.includes(role)));
      if (!canAct) {
        continue;
      }
      const list = optionsByState.get(transition.fromStateKey) ?? [];
      list.push({
        key: transition.key,
        label: transition.label,
        requiresComment: transition.requiresComment,
      });
      optionsByState.set(transition.fromStateKey, list);
    }
    if (optionsByState.size === 0) {
      return [];
    }

    const open = await this.workflow.listOpenInstanceStates(payload.org, DEMAND_ENTITY_TYPE);
    const relevant = open.filter((instance) => optionsByState.has(instance.currentStateKey));
    if (relevant.length === 0) {
      return [];
    }

    const stateByEntity = new Map(relevant.map((r) => [r.entityId, r.currentStateKey]));
    const stateLabelByKey = new Map(definition.states.map((s) => [s.key, s.label]));
    const summaries = await this.demands.findSummariesByIds(
      payload.org,
      relevant.map((r) => r.entityId),
    );
    // Règle de gouvernance : à l'étape Finance, une seule des deux issues
    // (comité ou création directe) est proposée, selon le budget de la demande.
    const org = await this.prisma.organization.findUnique({
      where: { id: payload.org },
      select: { committeeRuleEnabled: true },
    });
    const ruleEnabled = org?.committeeRuleEnabled ?? false;
    return summaries.map((summary) => {
      const stateKey = stateByEntity.get(summary.id) ?? "";
      let transitions = optionsByState.get(stateKey) ?? [];
      if (stateKey === FINANCE_REVIEW_STATE) {
        const committeeReq = committeeRequired(ruleEnabled, summary.estimatedBudget);
        transitions = transitions.filter((option) => {
          if (option.key === T_SUBMIT_TO_COMMITTEE) return committeeReq;
          if (option.key === T_FINANCE_CREATES_PROJECT) return !committeeReq;
          return true;
        });
      }
      return {
        type: "demand" as const,
        demandId: summary.id,
        reference: summary.reference,
        title: summary.title,
        stateKey,
        stateLabel: stateLabelByKey.get(stateKey) ?? stateKey,
        transitions,
      };
    });
  }
}
