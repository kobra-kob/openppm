import { Injectable } from "@nestjs/common";
import { Prisma, ProjectRole, ProjectStatus } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import {
  CreateProjectInput,
  ProjectActivityEntry,
  ProjectListFilters,
  ProjectRepository,
  ProjectWithRelations,
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
