import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DemandUrgency, RoleKey } from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import { NotificationsService } from "../../../core/notifications/notifications.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { WorkflowService, WorkflowView } from "../../workflow/application/workflow.service";
import {
  BUSINESS_CASE_REPOSITORY,
  isBusinessCaseComplete,
} from "../domain/business-case.repository";
import type { BusinessCaseRepository } from "../domain/business-case.repository";
import { formatDemandCode } from "../domain/demand-code";
import {
  DEFAULT_DEMAND_WORKFLOW,
  DEMAND_ENTITY_TYPE,
} from "../domain/demand-workflow";
import { DEMAND_REPOSITORY } from "../domain/demand.repository";
import type { DemandRecord, DemandRepository } from "../domain/demand.repository";
import { DemandConversionService } from "./demand-conversion.service";
import type { CreateDemandDto, ListDemandsQuery, UpdateDemandDto } from "./dto/demand.dtos";

/** Rôles transverses pouvant intervenir sur toutes les demandes (édition). */
const DEMAND_MANAGER_ROLES: string[] = [RoleKey.admin, RoleKey.manager, RoleKey.pmo];

/** Rôles pouvant tenter une transition sur une demande dont ils ne sont pas l'auteur. */
const DEMAND_WORKFLOW_ROLES: string[] = [
  RoleKey.admin,
  RoleKey.manager,
  RoleKey.pmo,
  RoleKey.finance,
  RoleKey.business_analyst,
  RoleKey.executive,
];

export interface DemandStateView {
  key: string;
  label: string;
  isFinal: boolean;
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
  state: DemandStateView | null;
  /** Projet issu de la conversion (traçabilité), sinon null. */
  project: { id: string; code: string } | null;
  canEdit: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Détail : le workflow complet (états, transitions franchissables, historique). */
export interface DemandDetailView extends DemandView {
  workflow: WorkflowView;
}

export interface DemandListView {
  items: DemandView[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class DemandsService {
  constructor(
    @Inject(DEMAND_REPOSITORY) private readonly repository: DemandRepository,
    @Inject(BUSINESS_CASE_REPOSITORY)
    private readonly businessCases: BusinessCaseRepository,
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly conversion: DemandConversionService,
  ) {}

  async list(payload: JwtPayload, query: ListDemandsQuery): Promise<DemandListView> {
    const { items, total } = await this.repository.list({
      organizationId: payload.org,
      requesterId: query.scope === "mine" ? payload.sub : undefined,
      targetPortfolioId: query.targetPortfolioId,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
    });
    const states = await this.workflow.currentStates(
      DEMAND_ENTITY_TYPE,
      items.map((item) => item.id),
    );
    return {
      items: items.map((item) => this.toView(payload, item, states.get(item.id) ?? null)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(payload: JwtPayload, id: string): Promise<DemandDetailView> {
    const demand = await this.require(payload, id);
    const workflow = await this.workflow.describe(payload, DEMAND_ENTITY_TYPE, id);
    return this.toDetailView(payload, demand, workflow);
  }

  async create(
    payload: JwtPayload,
    dto: CreateDemandDto,
    context: RequestContext,
  ): Promise<DemandDetailView> {
    await this.assertPortfolio(payload.org, dto.targetPortfolioId);
    const reference = await this.nextReference(payload.org);
    const demand = await this.repository.create({
      organizationId: payload.org,
      reference,
      title: dto.title,
      description: dto.description ?? null,
      objectives: dto.objectives ?? null,
      justification: dto.justification ?? null,
      requesterId: payload.sub,
      department: dto.department ?? null,
      priority: dto.priority ?? 3,
      urgency: dto.urgency ?? DemandUrgency.medium,
      estimatedBudget: dto.estimatedBudget ?? null,
      estimatedDurationDays: dto.estimatedDurationDays ?? null,
      targetPortfolioId: dto.targetPortfolioId ?? null,
      tags: dto.tags ?? [],
    });

    // Démarrage du cycle de vie : la définition par défaut est créée si absente
    await this.workflow.ensureDefinition(payload.org, DEFAULT_DEMAND_WORKFLOW);
    const workflow = await this.workflow.start(payload, DEMAND_ENTITY_TYPE, demand.id);

    await this.audit.log({
      action: "demand.created",
      entityType: "demand",
      entityId: demand.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { reference: demand.reference, title: demand.title },
      ...context,
    });
    return this.toDetailView(payload, demand, workflow);
  }

  async update(
    payload: JwtPayload,
    id: string,
    dto: UpdateDemandDto,
    context: RequestContext,
  ): Promise<DemandDetailView> {
    const demand = await this.require(payload, id);
    this.assertCanEdit(payload, demand);
    if (dto.targetPortfolioId) {
      await this.assertPortfolio(payload.org, dto.targetPortfolioId);
    }
    const updated = await this.repository.update(id, {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description || null } : {}),
      ...(dto.objectives !== undefined ? { objectives: dto.objectives || null } : {}),
      ...(dto.justification !== undefined ? { justification: dto.justification || null } : {}),
      ...(dto.department !== undefined ? { department: dto.department || null } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.urgency !== undefined ? { urgency: dto.urgency } : {}),
      ...(dto.estimatedBudget !== undefined ? { estimatedBudget: dto.estimatedBudget } : {}),
      ...(dto.estimatedDurationDays !== undefined
        ? { estimatedDurationDays: dto.estimatedDurationDays }
        : {}),
      ...(dto.targetPortfolioId !== undefined
        ? { targetPortfolioId: dto.targetPortfolioId || null }
        : {}),
      ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
    });
    await this.audit.log({
      action: "demand.updated",
      entityType: "demand",
      entityId: id,
      organizationId: payload.org,
      userId: payload.sub,
      after: JSON.parse(JSON.stringify(dto)),
      ...context,
    });
    const workflow = await this.workflow.describe(payload, DEMAND_ENTITY_TYPE, id);
    return this.toDetailView(payload, updated, workflow);
  }

  /** Franchit une étape du workflow de la demande. */
  async transition(
    payload: JwtPayload,
    id: string,
    transitionKey: string,
    comment: string | undefined,
    context: RequestContext,
  ): Promise<DemandDetailView> {
    const demand = await this.require(payload, id);
    // Un utilisateur non transverse ne peut agir que sur ses propres demandes.
    // Les rôles habilités par la transition sont ensuite contrôlés par le moteur.
    if (
      demand.requesterId !== payload.sub &&
      !payload.roles.some((role) => DEMAND_WORKFLOW_ROLES.includes(role))
    ) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Vous ne pouvez agir que sur vos propres demandes",
      });
    }

    // Garde « Business Case complet » : on ne peut quitter l'étape Business
    // Case vers la validation Finance sans un dossier financier complet
    // (coûts, bénéfices, ROI). La seule transition avançant depuis cet état est
    // `finance_validate` ; les compléments/rejets ne sont pas concernés.
    const currentState = (
      await this.workflow.currentStates(DEMAND_ENTITY_TYPE, [id])
    ).get(id);
    if (currentState?.stateKey === "business_case" && transitionKey === "finance_validate") {
      const businessCase = await this.businessCases.findByDemandId(id);
      if (!isBusinessCaseComplete(businessCase)) {
        throw new BadRequestException({
          code: "BUSINESS_CASE_INCOMPLETE",
          message:
            "Le Business Case doit être complété (coûts, bénéfices et ROI) avant la validation Finance",
        });
      }
    }

    const result = await this.workflow.fire(
      payload,
      DEMAND_ENTITY_TYPE,
      id,
      transitionKey,
      comment,
      context,
    );

    // Notifie le demandeur de l'avancement (hors action de sa part)
    if (demand.requesterId !== payload.sub) {
      await this.notifications.notify({
        organizationId: payload.org,
        userId: demand.requesterId,
        type: "demand.transition",
        payload: {
          demandId: demand.id,
          reference: demand.reference,
          stateLabel: result.view.currentState.label,
          actorName: payload.name,
        },
      });
    }

    // À l'approbation du comité, la demande est convertie en projet
    // (budget approuvé, reprise des pièces et des risques, traçabilité).
    if (result.autoAction?.createProject) {
      await this.conversion.convertFromDemand(payload, demand, context);
      // La demande porte désormais le lien vers le projet créé.
      const converted = await this.require(payload, id);
      return this.toDetailView(payload, converted, result.view);
    }

    return this.toDetailView(payload, demand, result.view);
  }

  async remove(payload: JwtPayload, id: string, context: RequestContext): Promise<void> {
    const demand = await this.require(payload, id);
    this.assertCanEdit(payload, demand);
    await this.repository.softDelete(id);
    await this.audit.log({
      action: "demand.deleted",
      entityType: "demand",
      entityId: id,
      organizationId: payload.org,
      userId: payload.sub,
      before: { reference: demand.reference },
      ...context,
    });
  }

  // ── Aides privées ────────────────────────────────────────────────────

  /** Attribue le prochain numéro unique DEMDxxxxx, toujours côté serveur. */
  private async nextReference(organizationId: string): Promise<string> {
    const start = (await this.repository.maxReferenceSequence(organizationId)) + 1;
    for (let sequence = start; sequence < start + 100; sequence += 1) {
      const reference = formatDemandCode(sequence);
      if (!(await this.repository.isReferenceTaken(organizationId, reference))) {
        return reference;
      }
    }
    throw new ConflictException({
      code: "DEMAND_REFERENCE_GENERATION_FAILED",
      message: "Impossible de générer un numéro de demande unique",
    });
  }

  private async require(payload: JwtPayload, id: string): Promise<DemandRecord> {
    const demand = await this.repository.findById(payload.org, id);
    if (!demand) {
      throw new NotFoundException({
        code: "DEMAND_NOT_FOUND",
        message: "Demande introuvable",
      });
    }
    return demand;
  }

  private async assertPortfolio(organizationId: string, portfolioId?: string): Promise<void> {
    if (portfolioId && !(await this.repository.portfolioExists(organizationId, portfolioId))) {
      throw new BadRequestException({
        code: "PORTFOLIO_NOT_FOUND",
        message: "Portefeuille introuvable",
      });
    }
  }

  private assertCanEdit(payload: JwtPayload, demand: DemandRecord): void {
    if (!this.canEdit(payload, demand)) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Vous ne pouvez modifier que vos propres demandes",
      });
    }
  }

  /** Le demandeur gère sa demande ; les rôles transverses interviennent partout. */
  private canEdit(payload: JwtPayload, demand: DemandRecord): boolean {
    return (
      demand.requesterId === payload.sub ||
      payload.roles.some((role) => DEMAND_MANAGER_ROLES.includes(role))
    );
  }

  private toView(
    payload: JwtPayload,
    demand: DemandRecord,
    state: { stateKey: string; stateLabel: string; kind: string } | null,
  ): DemandView {
    return {
      id: demand.id,
      reference: demand.reference,
      title: demand.title,
      description: demand.description,
      objectives: demand.objectives,
      justification: demand.justification,
      requester: { id: demand.requesterId, name: demand.requesterName },
      department: demand.department,
      priority: demand.priority,
      urgency: demand.urgency,
      estimatedBudget: demand.estimatedBudget !== null ? Number(demand.estimatedBudget) : null,
      estimatedDurationDays: demand.estimatedDurationDays,
      targetPortfolio: demand.targetPortfolio,
      tags: demand.tags,
      state: state
        ? {
            key: state.stateKey,
            label: state.stateLabel,
            isFinal: state.kind === "final_ok" || state.kind === "final_ko",
          }
        : null,
      project: demand.project,
      canEdit: this.canEdit(payload, demand),
      createdAt: demand.createdAt,
      updatedAt: demand.updatedAt,
    };
  }

  private toDetailView(
    payload: JwtPayload,
    demand: DemandRecord,
    workflow: WorkflowView,
  ): DemandDetailView {
    const base = this.toView(payload, demand, {
      stateKey: workflow.currentState.key,
      stateLabel: workflow.currentState.label,
      kind: workflow.currentState.kind,
    });
    return { ...base, workflow };
  }
}
