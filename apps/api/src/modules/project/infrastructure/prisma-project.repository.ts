import { Injectable } from "@nestjs/common";
import { Prisma, ProjectCategory, ProjectRole, ProjectStatus } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import {
  CreateCategoryInput,
  CreateProjectInput,
  CreateTemplateInput,
  ProjectActivityEntry,
  ProjectListFilters,
  ProjectRepository,
  ProjectWithRelations,
  TemplateWithCategory,
  UpdateProjectInput,
} from "../domain/project.repository";

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

const PROJECT_INCLUDE = {
  manager: { select: USER_SELECT },
  category: true,
  members: { include: { user: { select: USER_SELECT } }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.ProjectInclude;

@Injectable()
export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    filters: ProjectListFilters,
  ): Promise<{ items: ProjectWithRelations[]; total: number }> {
    const where: Prisma.ProjectWhereInput = {
      organizationId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : { status: { not: ProjectStatus.archived } }),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search } },
              { code: { contains: filters.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: PROJECT_INCLUDE,
        orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.project.count({ where }),
    ]);
    return { items, total };
  }

  listTrash(organizationId: string): Promise<ProjectWithRelations[]> {
    return this.prisma.project.findMany({
      where: { organizationId, deletedAt: { not: null } },
      include: PROJECT_INCLUDE,
      orderBy: { deletedAt: "desc" },
    });
  }

  findById(
    organizationId: string,
    id: string,
    includeDeleted = false,
  ): Promise<ProjectWithRelations | null> {
    return this.prisma.project.findFirst({
      where: {
        id,
        organizationId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      include: PROJECT_INCLUDE,
    });
  }

  async isCodeTaken(organizationId: string, code: string): Promise<boolean> {
    const found = await this.prisma.project.findUnique({
      where: { organizationId_code: { organizationId, code } },
      select: { id: true },
    });
    return found !== null;
  }

  countAll(organizationId: string): Promise<number> {
    return this.prisma.project.count({ where: { organizationId } });
  }

  create(input: CreateProjectInput): Promise<ProjectWithRelations> {
    return this.prisma.project.create({
      data: {
        organizationId: input.organizationId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        priority: input.priority ?? 3,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        budget: input.budget ?? null,
        categoryId: input.categoryId ?? null,
        managerId: input.managerId ?? null,
        createdById: input.createdById,
        members: {
          create: input.initialMembers.map((member) => ({
            userId: member.userId,
            role: member.role,
          })),
        },
      },
      include: PROJECT_INCLUDE,
    });
  }

  update(id: string, input: UpdateProjectInput): Promise<ProjectWithRelations> {
    return this.prisma.project.update({
      where: { id },
      data: input,
      include: PROJECT_INCLUDE,
    });
  }

  setStatus(
    id: string,
    status: ProjectStatus,
    archivedAt: Date | null,
  ): Promise<ProjectWithRelations> {
    return this.prisma.project.update({
      where: { id },
      data: { status, archivedAt },
      include: PROJECT_INCLUDE,
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  restore(id: string): Promise<ProjectWithRelations> {
    return this.prisma.project.update({
      where: { id },
      data: { deletedAt: null },
      include: PROJECT_INCLUDE,
    });
  }

  async addMember(projectId: string, userId: string, role: ProjectRole): Promise<void> {
    await this.prisma.projectMember.create({ data: { projectId, userId, role } });
  }

  async updateMemberRole(
    projectId: string,
    userId: string,
    role: ProjectRole,
  ): Promise<void> {
    await this.prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId } },
      data: { role },
    });
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
  }

  async userInOrganization(organizationId: string, userId: string): Promise<boolean> {
    const found = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    return found !== null;
  }

  // ── Catégories ───────────────────────────────────────────────────────

  listCategories(organizationId: string): Promise<ProjectCategory[]> {
    return this.prisma.projectCategory.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });
  }

  findCategory(organizationId: string, id: string): Promise<ProjectCategory | null> {
    return this.prisma.projectCategory.findFirst({ where: { id, organizationId } });
  }

  async categoryNameTaken(organizationId: string, name: string): Promise<boolean> {
    const found = await this.prisma.projectCategory.findUnique({
      where: { organizationId_name: { organizationId, name } },
      select: { id: true },
    });
    return found !== null;
  }

  createCategory(input: CreateCategoryInput): Promise<ProjectCategory> {
    return this.prisma.projectCategory.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        ...(input.color ? { color: input.color } : {}),
      },
    });
  }

  updateCategory(
    id: string,
    input: { name?: string; color?: string },
  ): Promise<ProjectCategory> {
    return this.prisma.projectCategory.update({ where: { id }, data: input });
  }

  async deleteCategory(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.project.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      }),
      this.prisma.projectTemplate.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      }),
      this.prisma.projectCategory.delete({ where: { id } }),
    ]);
  }

  // ── Templates ────────────────────────────────────────────────────────

  listTemplates(organizationId: string): Promise<TemplateWithCategory[]> {
    return this.prisma.projectTemplate.findMany({
      where: { organizationId },
      include: { category: true },
      orderBy: { name: "asc" },
    });
  }

  findTemplate(organizationId: string, id: string): Promise<TemplateWithCategory | null> {
    return this.prisma.projectTemplate.findFirst({
      where: { id, organizationId },
      include: { category: true },
    });
  }

  async templateNameTaken(organizationId: string, name: string): Promise<boolean> {
    const found = await this.prisma.projectTemplate.findUnique({
      where: { organizationId_name: { organizationId, name } },
      select: { id: true },
    });
    return found !== null;
  }

  createTemplate(input: CreateTemplateInput): Promise<TemplateWithCategory> {
    return this.prisma.projectTemplate.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        description: input.description ?? null,
        priority: input.priority ?? 3,
        budget: input.budget ?? null,
        durationDays: input.durationDays ?? null,
        categoryId: input.categoryId ?? null,
        createdById: input.createdById,
      },
      include: { category: true },
    });
  }

  async deleteTemplate(id: string): Promise<void> {
    await this.prisma.projectTemplate.delete({ where: { id } });
  }

  async listActivity(
    organizationId: string,
    projectId: string,
    limit: number,
  ): Promise<ProjectActivityEntry[]> {
    const entries = await this.prisma.auditLog.findMany({
      where: { organizationId, entityType: "project", entityId: projectId },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actorName: entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : null,
      after: entry.after,
      createdAt: entry.createdAt,
    }));
  }
}
