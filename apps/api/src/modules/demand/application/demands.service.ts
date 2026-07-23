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
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { formatDemandCode } from "../domain/demand-code";
import { DEMAND_REPOSITORY } from "../domain/demand.repository";
import type { DemandRecord, DemandRepository } from "../domain/demand.repository";
import type { CreateDemandDto, ListDemandsQuery, UpdateDemandDto } from "./dto/demand.dtos";

/** Rôles transverses pouvant intervenir sur toutes les demandes. */
const DEMAND_MANAGER_ROLES: string[] = [RoleKey.admin, RoleKey.manager, RoleKey.pmo];

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
  canEdit: boolean;
  createdAt: Date;
  updatedAt: Date;
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
    private readonly audit: AuditService,
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
    return {
      items: items.map((item) => this.toView(payload, item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(payload: JwtPayload, id: string): Promise<DemandView> {
    return this.toView(payload, await this.require(payload, id));
  }

  async create(
    payload: JwtPayload,
    dto: CreateDemandDto,
    context: RequestContext,
  ): Promise<DemandView> {
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
    await this.audit.log({
      action: "demand.created",
      entityType: "demand",
      entityId: demand.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { reference: demand.reference, title: demand.title },
      ...context,
    });
    return this.toView(payload, demand);
  }

  async update(
    payload: JwtPayload,
    id: string,
    dto: UpdateDemandDto,
    context: RequestContext,
  ): Promise<DemandView> {
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
    return this.toView(payload, updated);
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

  private toView(payload: JwtPayload, demand: DemandRecord): DemandView {
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
      canEdit: this.canEdit(payload, demand),
      createdAt: demand.createdAt,
      updatedAt: demand.updatedAt,
    };
  }
}
