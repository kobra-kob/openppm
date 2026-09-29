import { Injectable } from "@nestjs/common";
import { Prisma } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type {
  AssignmentRecord,
  CreateResourceInput,
  ResourceListFilters,
  ResourceRate,
  ResourceRecord,
  ResourceRepository,
  UpdateResourceInput,
} from "../domain/resource.repository";

const RESOURCE_INCLUDE = {
  rates: { where: { effectiveTo: null }, orderBy: { effectiveFrom: "desc" }, take: 1 },
} as const;

type ResourceRow = Prisma.ResourceGetPayload<{ include: typeof RESOURCE_INCLUDE }>;

const ASSIGNMENT_INCLUDE = {
  task: { select: { id: true, title: true, startDate: true, dueDate: true, projectId: true } },
  resource: { include: RESOURCE_INCLUDE },
} as const;

type AssignmentRow = Prisma.TaskResourceGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>;

/** Affectation jointe au projet (nom + heures/jour) : charge multi-projets. */
const ASSIGNMENT_WITH_PROJECT_INCLUDE = {
  task: {
    select: {
      id: true,
      title: true,
      startDate: true,
      dueDate: true,
      projectId: true,
      project: { select: { name: true, hoursPerDay: true } },
    },
  },
  resource: { include: RESOURCE_INCLUDE },
} as const;

type AssignmentWithProjectRow = Prisma.TaskResourceGetPayload<{
  include: typeof ASSIGNMENT_WITH_PROJECT_INCLUDE;
}>;

function toAssignmentWithProject(row: AssignmentWithProjectRow): AssignmentRecord {
  const rate = row.resource.rates[0];
  return {
    taskResourceId: row.id,
    resourceId: row.resourceId,
    resourceName: `${row.resource.firstName} ${row.resource.lastName}`.trim(),
    taskId: row.taskId,
    taskTitle: row.task.title,
    projectId: row.task.projectId,
    projectName: row.task.project.name,
    hoursPerDay: row.task.project.hoursPerDay,
    startDate: row.task.startDate,
    dueDate: row.task.dueDate,
    rate: rate ? { amount: Number(rate.amount), unit: rate.unit, currency: rate.currency } : null,
  };
}

function toResource(row: ResourceRow): ResourceRecord {
  const rate = row.rates[0];
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    resourceType: row.resourceType,
    company: row.company,
    email: row.email,
    phone: row.phone,
    jobTitle: row.jobTitle,
    active: row.active,
    notes: row.notes,
    currentRate: rate
      ? { amount: Number(rate.amount), unit: rate.unit, currency: rate.currency }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaResourceRepository implements ResourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, filters: ResourceListFilters): Promise<ResourceRecord[]> {
    const rows = await this.prisma.resource.findMany({
      where: {
        organizationId,
        ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
        ...(filters.active !== undefined ? { active: filters.active } : {}),
        ...(filters.search
          ? {
              OR: [
                { firstName: { contains: filters.search } },
                { lastName: { contains: filters.search } },
                { company: { contains: filters.search } },
              ],
            }
          : {}),
      },
      include: RESOURCE_INCLUDE,
      orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    });
    return rows.map(toResource);
  }

  async findById(organizationId: string, id: string): Promise<ResourceRecord | null> {
    const row = await this.prisma.resource.findFirst({
      where: { id, organizationId },
      include: RESOURCE_INCLUDE,
    });
    return row ? toResource(row) : null;
  }

  async create(input: CreateResourceInput): Promise<ResourceRecord> {
    const row = await this.prisma.resource.create({
      data: {
        organizationId: input.organizationId,
        firstName: input.firstName,
        lastName: input.lastName,
        resourceType: input.resourceType,
        company: input.company ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        jobTitle: input.jobTitle ?? null,
        notes: input.notes ?? null,
      },
      include: RESOURCE_INCLUDE,
    });
    return toResource(row);
  }

  async update(id: string, input: UpdateResourceInput): Promise<ResourceRecord> {
    const row = await this.prisma.resource.update({
      where: { id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        resourceType: input.resourceType,
        company: input.company,
        email: input.email,
        phone: input.phone,
        jobTitle: input.jobTitle,
        notes: input.notes,
        active: input.active,
      },
      include: RESOURCE_INCLUDE,
    });
    return toResource(row);
  }

  async setRate(resourceId: string, rate: ResourceRate): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.resourceRate.updateMany({
        where: { resourceId, effectiveTo: null },
        data: { effectiveTo: new Date() },
      }),
      this.prisma.resourceRate.create({
        data: {
          resourceId,
          amount: rate.amount,
          unit: rate.unit,
          currency: rate.currency,
        },
      }),
    ]);
  }

  async assignToTask(taskId: string, resourceId: string): Promise<void> {
    await this.prisma.taskResource.create({ data: { taskId, resourceId } });
  }

  async removeFromTask(taskId: string, resourceId: string): Promise<boolean> {
    const result = await this.prisma.taskResource.deleteMany({ where: { taskId, resourceId } });
    return result.count > 0;
  }

  async isAssigned(taskId: string, resourceId: string): Promise<boolean> {
    const found = await this.prisma.taskResource.findUnique({
      where: { taskId_resourceId: { taskId, resourceId } },
      select: { id: true },
    });
    return found !== null;
  }

  async listResourcesForTask(taskId: string): Promise<ResourceRecord[]> {
    const rows = await this.prisma.taskResource.findMany({
      where: { taskId },
      include: { resource: { include: RESOURCE_INCLUDE } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => toResource(row.resource));
  }

  private mapAssignment(row: AssignmentRow, hoursPerDay: number, projectName: string): AssignmentRecord {
    const rate = row.resource.rates[0];
    return {
      taskResourceId: row.id,
      resourceId: row.resourceId,
      resourceName: `${row.resource.firstName} ${row.resource.lastName}`.trim(),
      taskId: row.taskId,
      taskTitle: row.task.title,
      projectId: row.task.projectId,
      projectName,
      hoursPerDay,
      startDate: row.task.startDate,
      dueDate: row.task.dueDate,
      rate: rate ? { amount: Number(rate.amount), unit: rate.unit, currency: rate.currency } : null,
    };
  }

  async listAssignmentsForTask(projectId: string, taskId: string): Promise<AssignmentRecord[]> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, hoursPerDay: true },
    });
    const rows = await this.prisma.taskResource.findMany({
      where: { taskId, task: { projectId } },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.mapAssignment(row, project?.hoursPerDay ?? 8, project?.name ?? ""));
  }

  async listAssignmentsForProject(projectId: string): Promise<AssignmentRecord[]> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, hoursPerDay: true },
    });
    const rows = await this.prisma.taskResource.findMany({
      where: { task: { projectId, deletedAt: null } },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.mapAssignment(row, project?.hoursPerDay ?? 8, project?.name ?? ""));
  }

  async listAssignmentsForProjects(projectIds: string[]): Promise<AssignmentRecord[]> {
    if (projectIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.taskResource.findMany({
      where: { task: { projectId: { in: projectIds }, deletedAt: null } },
      include: ASSIGNMENT_WITH_PROJECT_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toAssignmentWithProject);
  }

  async listAssignmentsForResource(
    organizationId: string,
    resourceId: string,
  ): Promise<AssignmentRecord[]> {
    const rows = await this.prisma.taskResource.findMany({
      where: { resourceId, task: { organizationId, deletedAt: null } },
      include: ASSIGNMENT_WITH_PROJECT_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toAssignmentWithProject);
  }
}
