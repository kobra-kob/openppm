import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PortfolioStatus, ProjectStatus, RoleKey } from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { PORTFOLIO_REPOSITORY } from "../domain/portfolio.repository";
import type {
  PortfolioProjectSummary,
  PortfolioRepository,
  PortfolioWithProjects,
} from "../domain/portfolio.repository";
import type {
  AttachProjectDto,
  CreatePortfolioDto,
  UpdatePortfolioDto,
} from "./dto/portfolio.dtos";

/** Rôles autorisés à gérer les portefeuilles. */
const PORTFOLIO_MANAGER_ROLES: string[] = [
  RoleKey.admin,
  RoleKey.manager,
  RoleKey.pmo,
];
/** Statuts « engagés » : leur budget compte dans le consommé de l'enveloppe. */
const COMMITTED_STATUSES: ProjectStatus[] = [
  ProjectStatus.active,
  ProjectStatus.on_hold,
  ProjectStatus.completed,
];

export interface PortfolioView {
  id: string;
  name: string;
  description: string | null;
  status: PortfolioStatus;
  owner: { id: string; name: string } | null;
  budgetEnvelope: string | null;
  /** Somme des budgets des projets rattachés. */
  allocatedBudget: number;
  /** Somme des budgets des projets engagés (actif/pause/terminé). */
  committedBudget: number;
  projectCount: number;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    status: ProjectStatus;
    health: string;
    budget: string | null;
  }>;
  createdAt: Date;
}

@Injectable()
export class PortfoliosService {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY) private readonly repository: PortfolioRepository,
    private readonly audit: AuditService,
  ) {}

  private toView(portfolio: PortfolioWithProjects): PortfolioView {
    const allocated = portfolio.projects.reduce(
      (sum, project) => sum + (project.budget ? Number(project.budget) : 0),
      0,
    );
    const committed = portfolio.projects.reduce(
      (sum, project) =>
        COMMITTED_STATUSES.includes(project.status) && project.budget
          ? sum + Number(project.budget)
          : sum,
      0,
    );
    return {
      id: portfolio.id,
      name: portfolio.name,
      description: portfolio.description,
      status: portfolio.status,
      owner: portfolio.owner
        ? {
            id: portfolio.owner.id,
            name: `${portfolio.owner.firstName} ${portfolio.owner.lastName}`,
          }
        : null,
      budgetEnvelope: portfolio.budgetEnvelope?.toString() ?? null,
      allocatedBudget: allocated,
      committedBudget: committed,
      projectCount: portfolio.projects.length,
      projects: portfolio.projects,
      createdAt: portfolio.createdAt,
    };
  }

  async list(payload: JwtPayload): Promise<PortfolioView[]> {
    const portfolios = await this.repository.list(payload.org);
    return portfolios.map((portfolio) => this.toView(portfolio));
  }

  async get(payload: JwtPayload, id: string): Promise<PortfolioView> {
    return this.toView(await this.requirePortfolio(payload.org, id));
  }

  async unassignedProjects(payload: JwtPayload): Promise<PortfolioProjectSummary[]> {
    return this.repository.listUnassignedProjects(payload.org);
  }

  async create(
    payload: JwtPayload,
    dto: CreatePortfolioDto,
    context: RequestContext,
  ): Promise<PortfolioView> {
    this.assertCanManage(payload);
    await this.assertOwner(payload.org, dto.ownerId);
    const portfolio = await this.repository.create({
      organizationId: payload.org,
      name: dto.name,
      description: dto.description,
      ownerId: dto.ownerId,
      budgetEnvelope: dto.budgetEnvelope,
      createdById: payload.sub,
    });
    await this.audit.log({
      action: "portfolio.created",
      entityType: "portfolio",
      entityId: portfolio.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { name: portfolio.name },
      ...context,
    });
    return this.toView(portfolio);
  }

  async update(
    payload: JwtPayload,
    id: string,
    dto: UpdatePortfolioDto,
    context: RequestContext,
  ): Promise<PortfolioView> {
    this.assertCanManage(payload);
    const portfolio = await this.requirePortfolio(payload.org, id);
    if (dto.ownerId !== undefined) {
      await this.assertOwner(payload.org, dto.ownerId || undefined);
    }
    const updated = await this.repository.update(portfolio.id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId || null } : {}),
      ...(dto.budgetEnvelope !== undefined ? { budgetEnvelope: dto.budgetEnvelope } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    });
    await this.audit.log({
      action: "portfolio.updated",
      entityType: "portfolio",
      entityId: portfolio.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: JSON.parse(JSON.stringify(dto)),
      ...context,
    });
    return this.toView(updated);
  }

  async remove(payload: JwtPayload, id: string, context: RequestContext): Promise<void> {
    this.assertCanManage(payload);
    const portfolio = await this.requirePortfolio(payload.org, id);
    await this.repository.softDelete(portfolio.id);
    await this.audit.log({
      action: "portfolio.deleted",
      entityType: "portfolio",
      entityId: portfolio.id,
      organizationId: payload.org,
      userId: payload.sub,
      before: { name: portfolio.name },
      ...context,
    });
  }

  async attachProject(
    payload: JwtPayload,
    id: string,
    dto: AttachProjectDto,
    context: RequestContext,
  ): Promise<PortfolioView> {
    this.assertCanManage(payload);
    const portfolio = await this.requirePortfolio(payload.org, id);
    if (!(await this.repository.projectExists(payload.org, dto.projectId))) {
      throw new BadRequestException({
        code: "PROJECT_NOT_FOUND",
        message: "Projet introuvable",
      });
    }
    if (portfolio.projects.some((project) => project.id === dto.projectId)) {
      throw new ConflictException({
        code: "PROJECT_ALREADY_IN_PORTFOLIO",
        message: "Ce projet est déjà dans le portefeuille",
      });
    }
    await this.repository.attachProject(portfolio.id, dto.projectId);
    await this.audit.log({
      action: "portfolio.project_attached",
      entityType: "portfolio",
      entityId: portfolio.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { projectId: dto.projectId },
      ...context,
    });
    return this.get(payload, id);
  }

  async detachProject(
    payload: JwtPayload,
    id: string,
    projectId: string,
    context: RequestContext,
  ): Promise<PortfolioView> {
    this.assertCanManage(payload);
    const portfolio = await this.requirePortfolio(payload.org, id);
    if (!portfolio.projects.some((project) => project.id === projectId)) {
      throw new NotFoundException({
        code: "PROJECT_NOT_IN_PORTFOLIO",
        message: "Ce projet n'est pas dans le portefeuille",
      });
    }
    await this.repository.detachProject(payload.org, projectId);
    await this.audit.log({
      action: "portfolio.project_detached",
      entityType: "portfolio",
      entityId: portfolio.id,
      organizationId: payload.org,
      userId: payload.sub,
      before: { projectId },
      ...context,
    });
    return this.get(payload, id);
  }

  // ── Aides privées ────────────────────────────────────────────────────

  private async requirePortfolio(
    organizationId: string,
    id: string,
  ): Promise<PortfolioWithProjects> {
    const portfolio = await this.repository.findById(organizationId, id);
    if (!portfolio) {
      throw new NotFoundException({
        code: "PORTFOLIO_NOT_FOUND",
        message: "Portefeuille introuvable",
      });
    }
    return portfolio;
  }

  private assertCanManage(payload: JwtPayload): void {
    if (!payload.roles.some((role) => PORTFOLIO_MANAGER_ROLES.includes(role))) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Réservé aux rôles Administrateur, Manager ou PMO",
      });
    }
  }

  private async assertOwner(organizationId: string, ownerId?: string): Promise<void> {
    if (ownerId && !(await this.repository.userInOrganization(organizationId, ownerId))) {
      throw new BadRequestException({
        code: "OWNER_NOT_IN_ORG",
        message: "Le responsable doit appartenir à l'organisation",
      });
    }
  }
}
