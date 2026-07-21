import { Injectable } from "@nestjs/common";
import { Prisma, ProjectStatus } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import {
  CreatePortfolioInput,
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

/** Projets rattachés, hors corbeille, triés par priorité. */
const PROJECTS_INCLUDE = {
  projects: {
    where: { deletedAt: null },
    select: PROJECT_SELECT,
    orderBy: [{ priority: "asc" }, { name: "asc" }],
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

@Injectable()
export class PrismaPortfolioRepository implements PortfolioRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<PortfolioWithProjects[]> {
    const rows = await this.prisma.portfolio.findMany({
      where: { organizationId, deletedAt: null },
      include: { ...OWNER_SELECT, ...PROJECTS_INCLUDE },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({ ...row, projects: row.projects.map(mapProject) }));
  }

  async findById(
    organizationId: string,
    id: string,
  ): Promise<PortfolioWithProjects | null> {
    const row = await this.prisma.portfolio.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { ...OWNER_SELECT, ...PROJECTS_INCLUDE },
    });
    return row ? { ...row, projects: row.projects.map(mapProject) } : null;
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
      include: { ...OWNER_SELECT, ...PROJECTS_INCLUDE },
    });
    return { ...row, projects: row.projects.map(mapProject) };
  }

  async update(
    id: string,
    input: UpdatePortfolioInput,
  ): Promise<PortfolioWithProjects> {
    const row = await this.prisma.portfolio.update({
      where: { id },
      data: input,
      include: { ...OWNER_SELECT, ...PROJECTS_INCLUDE },
    });
    return { ...row, projects: row.projects.map(mapProject) };
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
