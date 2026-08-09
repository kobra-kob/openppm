import { Injectable } from "@nestjs/common";
import { Prisma, ProjectStatus } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import {
  CreatePortfolioInput,
  PortfolioDemandSummary,
  PortfolioProjectSummary,
  PortfolioRepository,
  PortfolioWithProjects,
  UpdatePortfolioInput,
} from "../domain/portfolio.repository";

const OWNER_SELECT = {
  owner: { select: { id: true, firstName: true, lastName: true } },
} as const;

const PROJECT_SELECT = {
  id: true,
  code: true,
  name: true,
  status: true,
  health: true,
  budget: true,
} satisfies Prisma.ProjectSelect;

const DEMAND_SELECT = {
  id: true,
  reference: true,
  title: true,
  estimatedBudget: true,
  project: { select: { id: true } },
} satisfies Prisma.DemandSelect;

/** Projets et demandes rattachés, hors corbeille. */
const PORTFOLIO_INCLUDE = {
  projects: {
    where: { deletedAt: null },
    select: PROJECT_SELECT,
    orderBy: [{ priority: "asc" }, { name: "asc" }],
  },
  demands: {
    where: { deletedAt: null },
    select: DEMAND_SELECT,
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.PortfolioInclude;

function mapProject(project: {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  health: string;
  budget: Prisma.Decimal | null;
}): PortfolioProjectSummary {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    status: project.status,
    health: project.health,
    budget: project.budget?.toString() ?? null,
  };
}

function mapDemand(demand: {
  id: string;
  reference: string;
  title: string;
  estimatedBudget: Prisma.Decimal | null;
  project: { id: string } | null;
}): PortfolioDemandSummary {
  return {
    id: demand.id,
    reference: demand.reference,
    title: demand.title,
    estimatedBudget: demand.estimatedBudget?.toString() ?? null,
    projectId: demand.project?.id ?? null,
  };
}

/** Reconstitue l'agrégat portefeuille (projets + demandes) à partir d'une ligne Prisma. */
function mapPortfolio(row: {
  projects: Parameters<typeof mapProject>[0][];
  demands: Parameters<typeof mapDemand>[0][];
}): { projects: PortfolioProjectSummary[]; demands: PortfolioDemandSummary[] } {
  return {
    projects: row.projects.map(mapProject),
    demands: row.demands.map(mapDemand),
  };
}

@Injectable()
export class PrismaPortfolioRepository implements PortfolioRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<PortfolioWithProjects[]> {
    const rows = await this.prisma.portfolio.findMany({
      where: { organizationId, deletedAt: null },
      include: { ...OWNER_SELECT, ...PORTFOLIO_INCLUDE },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({ ...row, ...mapPortfolio(row) }));
  }

  async findById(
    organizationId: string,
    id: string,
  ): Promise<PortfolioWithProjects | null> {
    const row = await this.prisma.portfolio.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { ...OWNER_SELECT, ...PORTFOLIO_INCLUDE },
    });
    return row ? { ...row, ...mapPortfolio(row) } : null;
  }

  async create(input: CreatePortfolioInput): Promise<PortfolioWithProjects> {
    const row = await this.prisma.portfolio.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        description: input.description ?? null,
        ownerId: input.ownerId ?? null,
        budgetEnvelope: input.budgetEnvelope ?? null,
        createdById: input.createdById,
      },
      include: { ...OWNER_SELECT, ...PORTFOLIO_INCLUDE },
    });
    return { ...row, ...mapPortfolio(row) };
  }

  async update(
    id: string,
    input: UpdatePortfolioInput,
  ): Promise<PortfolioWithProjects> {
    const row = await this.prisma.portfolio.update({
      where: { id },
      data: input,
      include: { ...OWNER_SELECT, ...PORTFOLIO_INCLUDE },
    });
    return { ...row, ...mapPortfolio(row) };
  }

  async softDelete(id: string): Promise<void> {
    // Détache les projets puis marque le portefeuille supprimé
    await this.prisma.$transaction([
      this.prisma.project.updateMany({
        where: { portfolioId: id },
        data: { portfolioId: null },
      }),
      this.prisma.portfolio.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    ]);
  }

  async userInOrganization(organizationId: string, userId: string): Promise<boolean> {
    const found = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    return found !== null;
  }

  async projectExists(organizationId: string, projectId: string): Promise<boolean> {
    const found = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: { id: true },
    });
    return found !== null;
  }

  async attachProject(portfolioId: string, projectId: string): Promise<void> {
    await this.prisma.project.update({
      where: { id: projectId },
      data: { portfolioId },
    });
  }

  async detachProject(organizationId: string, projectId: string): Promise<void> {
    await this.prisma.project.updateMany({
      where: { id: projectId, organizationId },
      data: { portfolioId: null },
    });
  }

  async listUnassignedProjects(
    organizationId: string,
  ): Promise<PortfolioProjectSummary[]> {
    const rows = await this.prisma.project.findMany({
      where: { organizationId, deletedAt: null, portfolioId: null },
      select: PROJECT_SELECT,
      orderBy: { name: "asc" },
    });
    return rows.map(mapProject);
  }
}
