import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ApprovalDecision,
  BudgetRequestStatus,
  ProjectRole,
  ProjectStatus,
  RoleKey,
} from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import { NotificationsService } from "../../../core/notifications/notifications.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { resolveApproverRoles } from "../domain/budget-approval-policy";
import { BUDGET_GOVERNANCE_REPOSITORY } from "../domain/budget-governance.repository";
import type {
  BudgetGovernanceRepository,
  BudgetRequestWithSteps,
  ProjectGovernanceContext,
} from "../domain/budget-governance.repository";
import type {
  CreateBudgetRequestDto,
  DecideStepDto,
} from "./dto/budget-governance.dtos";

const ORG_WIDE_ROLES: string[] = [RoleKey.admin, RoleKey.manager, RoleKey.pmo];

export interface GovernanceView {
  projectStatus: ProjectStatus;
  hasPortfolio: boolean;
  approvedBudget: number | null;
  canRequest: boolean;
  request: BudgetRequestView | null;
}

export interface BudgetRequestView {
  id: string;
  amount: number;
  capexAmount: number;
  opexAmount: number;
  justification: string | null;
  status: BudgetRequestStatus;
  currentStep: number;
  requestedByName: string;
  createdAt: Date;
  steps: Array<{
    id: string;
    stepOrder: number;
    approverRole: string;
    status: ApprovalDecision;
    decidedByName: string | null;
    comment: string | null;
    decidedAt: Date | null;
    /** L'utilisateur courant peut-il décider de cette étape maintenant ? */
    canDecide: boolean;
  }>;
}

@Injectable()
export class BudgetGovernanceService {
  constructor(
    @Inject(BUDGET_GOVERNANCE_REPOSITORY)
    private readonly repository: BudgetGovernanceRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async getGovernance(payload: JwtPayload, projectId: string): Promise<GovernanceView> {
    const project = await this.requireProject(payload, projectId);
    const request = await this.repository.findLatestRequest(projectId);
    return {
      projectStatus: project.status,
      hasPortfolio: project.portfolioId !== null,
      approvedBudget: null, // le budget approuvé est porté par le projet (module project)
      canRequest:
        this.canRequestBudget(payload, project) &&
        project.portfolioId !== null &&
        (request === null || request.status === BudgetRequestStatus.rejected),
      request: request ? this.toRequestView(payload, request) : null,
    };
  }

  async createRequest(
    payload: JwtPayload,
    projectId: string,
    dto: CreateBudgetRequestDto,
    context: RequestContext,
  ): Promise<BudgetRequestView> {
    const project = await this.requireProject(payload, projectId);
    if (!this.canRequestBudget(payload, project)) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Seul le chef de projet ou un rôle transverse peut demander un budget",
      });
    }
    // Le budget passe obligatoirement par le rattachement à un portefeuille
    if (project.portfolioId === null) {
      throw new BadRequestException({
        code: "PROJECT_NOT_IN_PORTFOLIO",
        message: "Rattachez d'abord le projet à un portefeuille",
      });
    }
    if (await this.repository.hasPendingRequest(projectId)) {
      throw new ConflictException({
        code: "BUDGET_REQUEST_PENDING",
        message: "Une demande de budget est déjà en cours",
      });
    }
    const amount = Number((dto.capexAmount + dto.opexAmount).toFixed(2));
    if (amount <= 0) {
      throw new BadRequestException({
        code: "BUDGET_AMOUNT_REQUIRED",
        message: "Le montant total doit être supérieur à zéro",
      });
    }

    // La chaîne d'approbateurs dépend du montant (seuils configurables par org,
    // sinon barème par défaut : <10k Manager, 10-100k Finance, ≥100k Finance+Direction).
    const tiers = await this.repository.loadApprovalTiers(payload.org);
    const approverRoles = resolveApproverRoles(amount, tiers);
    const steps = approverRoles.map((approverRole, stepOrder) => ({
      stepOrder,
      approverRole,
    }));

    const request = await this.repository.create({
      organizationId: payload.org,
      projectId,
      amount,
      capexAmount: dto.capexAmount,
      opexAmount: dto.opexAmount,
      justification: dto.justification,
      requestedById: payload.sub,
      steps,
    });
    await this.audit.log({
      action: "budget_request.created",
      entityType: "budget_request",
      entityId: request.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { projectId, amount },
      ...context,
    });
    return this.toRequestView(payload, request);
  }

  async decideStep(
    payload: JwtPayload,
    projectId: string,
    requestId: string,
    stepId: string,
    dto: DecideStepDto,
    context: RequestContext,
  ): Promise<BudgetRequestView> {
    const project = await this.requireProject(payload, projectId);
    const request = await this.repository.findRequestById(payload.org, requestId);
    if (!request || request.projectId !== projectId) {
      throw new NotFoundException({
        code: "BUDGET_REQUEST_NOT_FOUND",
        message: "Demande de budget introuvable",
      });
    }
    if (request.status !== BudgetRequestStatus.pending) {
      throw new BadRequestException({
        code: "BUDGET_REQUEST_CLOSED",
        message: "Cette demande est déjà clôturée",
      });
    }
    const step = request.steps.find((entry) => entry.id === stepId);
    if (!step) {
      throw new NotFoundException({
        code: "APPROVAL_STEP_NOT_FOUND",
        message: "Étape d'approbation introuvable",
      });
    }
    if (step.stepOrder !== request.currentStep) {
      throw new BadRequestException({
        code: "STEP_NOT_CURRENT",
        message: "Ce n'est pas l'étape en attente de décision",
      });
    }
    // Séparation des responsabilités : nul ne valide son propre budget,
    // pas même un administrateur.
    if (request.requestedById === payload.sub) {
      throw new ForbiddenException({
        code: "SELF_APPROVAL_FORBIDDEN",
        message: "Vous ne pouvez pas valider votre propre demande de budget",
      });
    }
    if (!this.canDecideStep(payload, step.approverRole)) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Vous n'avez pas le rôle requis pour valider cette étape",
      });
    }

    const isLastStep = step.stepOrder === request.steps.length - 1;
    if (!dto.approve) {
      // Refus : la demande est rejetée, le projet reste en l'état
      await this.repository.decideStep({
        requestId,
        stepId,
        decision: ApprovalDecision.rejected,
        decidedById: payload.sub,
        comment: dto.comment,
        requestStatus: "rejected",
      });
      await this.audit.log({
        action: "budget_request.rejected",
        entityType: "budget_request",
        entityId: requestId,
        organizationId: payload.org,
        userId: payload.sub,
        after: { step: step.stepOrder },
        ...context,
      });
    } else if (isLastStep) {
      // Dernière approbation : budget fixé, projet activé
      const activate = project.status === ProjectStatus.draft;
      await this.repository.decideStep({
        requestId,
        stepId,
        decision: ApprovalDecision.approved,
        decidedById: payload.sub,
        comment: dto.comment,
        requestStatus: "approved",
        finalize: {
          projectId,
          amount: Number(request.amount),
          activate,
        },
      });
      await this.audit.log({
        action: "budget_request.approved",
        entityType: "budget_request",
        entityId: requestId,
        organizationId: payload.org,
        userId: payload.sub,
        after: { amount: Number(request.amount), activated: activate },
        ...context,
      });
    } else {
      // Approbation intermédiaire : on avance d'une étape
      await this.repository.decideStep({
        requestId,
        stepId,
        decision: ApprovalDecision.approved,
        decidedById: payload.sub,
        comment: dto.comment,
        nextStep: step.stepOrder + 1,
      });
      await this.audit.log({
        action: "budget_request.step_approved",
        entityType: "budget_request",
        entityId: requestId,
        organizationId: payload.org,
        userId: payload.sub,
        after: { step: step.stepOrder },
        ...context,
      });
    }

    // Notifie le demandeur de l'avancement (hors décideur lui-même)
    if (request.requestedById !== payload.sub) {
      await this.notifications.notify({
        organizationId: payload.org,
        userId: request.requestedById,
        type: "task.assigned",
        payload: {
          taskId: projectId,
          taskTitle: "Demande de budget",
          projectId,
          authorName: payload.name,
        },
      });
    }

    const updated = await this.repository.findRequestById(payload.org, requestId);
    return this.toRequestView(payload, updated!);
  }

  // ── Aides privées ────────────────────────────────────────────────────

  private toRequestView(
    payload: JwtPayload,
    request: BudgetRequestWithSteps,
  ): BudgetRequestView {
    return {
      id: request.id,
      amount: Number(request.amount),
      capexAmount: Number(request.capexAmount),
      opexAmount: Number(request.opexAmount),
      justification: request.justification,
      status: request.status,
      currentStep: request.currentStep,
      requestedByName: `${request.requestedBy.firstName} ${request.requestedBy.lastName}`,
      createdAt: request.createdAt,
      steps: request.steps.map((step) => ({
        id: step.id,
        stepOrder: step.stepOrder,
        approverRole: step.approverRole,
        status: step.status,
        decidedByName: step.decidedBy
          ? `${step.decidedBy.firstName} ${step.decidedBy.lastName}`
          : null,
        comment: step.comment,
        decidedAt: step.decidedAt,
        canDecide:
          request.status === BudgetRequestStatus.pending &&
          step.stepOrder === request.currentStep &&
          request.requestedById !== payload.sub &&
          this.canDecideStep(payload, step.approverRole),
      })),
    };
  }

  private async requireProject(
    payload: JwtPayload,
    projectId: string,
  ): Promise<ProjectGovernanceContext> {
    const project = await this.repository.loadProjectContext(payload.org, projectId);
    if (!project) {
      throw new NotFoundException({
        code: "PROJECT_NOT_FOUND",
        message: "Projet introuvable",
      });
    }
    return project;
  }

  /** Demander un budget : rôle transverse, chef de projet ou manager du projet. */
  private canRequestBudget(payload: JwtPayload, project: ProjectGovernanceContext): boolean {
    if (payload.roles.some((role) => ORG_WIDE_ROLES.includes(role))) {
      return true;
    }
    if (project.managerId === payload.sub) {
      return true;
    }
    return project.members.some(
      (member) => member.userId === payload.sub && member.role === ProjectRole.manager,
    );
  }

  /** Décider d'une étape : l'admin peut tout valider, sinon le rôle exact requis. */
  private canDecideStep(payload: JwtPayload, approverRole: string): boolean {
    return (
      payload.roles.includes(RoleKey.admin) || payload.roles.includes(approverRole as RoleKey)
    );
  }
}
