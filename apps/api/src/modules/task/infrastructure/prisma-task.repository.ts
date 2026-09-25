import { Injectable } from "@nestjs/common";
import { ChecklistItem, Prisma, TaskStatus, TimeEntry } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type { DependencyEdge } from "../domain/task-graph.policy";
import {
  AssignedTask,
  CreateTaskInput,
  ProjectAccess,
  TaskDetail,
  TaskRepository,
  TaskWithAggregates,
  UpdateTaskInput,
} from "../domain/task.repository";

const USER_SELECT = { id: true, firstName: true, lastName: true } as const;

const LIST_INCLUDE = {
  assignees: { include: { user: { select: USER_SELECT } } },
  checklist: { select: { isDone: true } },
  timeEntries: { select: { hours: true } },
} satisfies Prisma.TaskInclude;

@Injectable()
export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProjectAccess(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectAccess | null> {
    return this.prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        managerId: true,
        members: { select: { userId: true, role: true } },
      },
    });
  }

  listAssignedToUser(organizationId: string, userId: string): Promise<AssignedTask[]> {
    return this.prisma.task.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: [TaskStatus.todo, TaskStatus.in_progress] },
        assignees: { some: { userId } },
        project: { deletedAt: null },
      },
      include: { project: { select: { id: true, name: true, code: true } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "asc" }],
      take: 20,
    });
  }

  listByProject(projectId: string): Promise<TaskWithAggregates[]> {
    return this.prisma.task.findMany({
      where: { projectId, deletedAt: null },
      include: LIST_INCLUDE,
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  }

  findById(projectId: string, taskId: string): Promise<TaskWithAggregates | null> {
    return this.prisma.task.findFirst({
      where: { id: taskId, projectId, deletedAt: null },
      include: LIST_INCLUDE,
    });
  }

  findDetail(projectId: string, taskId: string): Promise<TaskDetail | null> {
    return this.prisma.task.findFirst({
      where: { id: taskId, projectId, deletedAt: null },
      include: {
        assignees: { include: { user: { select: USER_SELECT } } },
        checklist: { orderBy: { position: "asc" } },
        predecessors: {
          include: {
            predecessor: { select: { id: true, title: true, status: true } },
          },
        },
        successors: {
          include: {
            successor: { select: { id: true, title: true, status: true } },
          },
        },
        timeEntries: {
          include: { user: { select: USER_SELECT } },
          orderBy: { spentOn: "desc" },
        },
      },
    });
  }

  async nextPosition(projectId: string, parentId: string | null): Promise<number> {
    const max = await this.prisma.task.aggregate({
      where: { projectId, parentId, deletedAt: null },
      _max: { position: true },
    });
    return (max._max.position ?? 0) + 1;
  }

  async reorder(projectId: string, orderedIds: string[]): Promise<void> {
    // Position = rang (1..n). Scopé au projet : ne touche jamais une autre tâche.
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.task.updateMany({
          where: { id, projectId, deletedAt: null },
          data: { position: index + 1 },
        }),
      ),
    );
  }

  create(input: CreateTaskInput): Promise<TaskWithAggregates> {
    return this.prisma.task.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        parentId: input.parentId ?? null,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? 3,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        estimateHours: input.estimateHours ?? null,
        position: input.position,
        createdById: input.createdById,
        assignees: {
          create: input.assigneeIds.map((userId) => ({ userId })),
        },
      },
      include: LIST_INCLUDE,
    });
  }

  update(taskId: string, input: UpdateTaskInput): Promise<TaskWithAggregates> {
    return this.prisma.task.update({
      where: { id: taskId },
      data: input,
      include: LIST_INCLUDE,
    });
  }

  setStatus(
    taskId: string,
    status: TaskStatus,
    completedAt: Date | null,
  ): Promise<TaskWithAggregates> {
    return this.prisma.task.update({
      where: { id: taskId },
      data: { status, completedAt },
      include: LIST_INCLUDE,
    });
  }

  async softDeleteMany(taskIds: string[]): Promise<void> {
    await this.prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: { deletedAt: new Date() },
    });
  }

  listHierarchy(
    projectId: string,
  ): Promise<Array<{ id: string; parentId: string | null }>> {
    return this.prisma.task.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, parentId: true },
    });
  }

  async addAssignee(taskId: string, userId: string): Promise<void> {
    await this.prisma.taskAssignee.create({ data: { taskId, userId } });
  }

  async removeAssignee(taskId: string, userId: string): Promise<void> {
    await this.prisma.taskAssignee.deleteMany({ where: { taskId, userId } });
  }

  addChecklistItem(
    taskId: string,
    label: string,
    position: number,
  ): Promise<ChecklistItem> {
    return this.prisma.checklistItem.create({ data: { taskId, label, position } });
  }

  findChecklistItem(taskId: string, itemId: string): Promise<ChecklistItem | null> {
    return this.prisma.checklistItem.findFirst({ where: { id: itemId, taskId } });
  }

  updateChecklistItem(
    itemId: string,
    input: { label?: string; isDone?: boolean },
  ): Promise<ChecklistItem> {
    return this.prisma.checklistItem.update({ where: { id: itemId }, data: input });
  }

  async deleteChecklistItem(itemId: string): Promise<void> {
    await this.prisma.checklistItem.delete({ where: { id: itemId } });
  }

  async listDependencyEdges(projectId: string): Promise<DependencyEdge[]> {
    return this.prisma.taskDependency.findMany({
      where: { predecessor: { projectId, deletedAt: null } },
      select: { predecessorId: true, successorId: true },
    });
  }

  async dependencyExists(predecessorId: string, successorId: string): Promise<boolean> {
    const found = await this.prisma.taskDependency.findUnique({
      where: { predecessorId_successorId: { predecessorId, successorId } },
      select: { id: true },
    });
    return found !== null;
  }

  async addDependency(predecessorId: string, successorId: string): Promise<void> {
    await this.prisma.taskDependency.create({ data: { predecessorId, successorId } });
  }

  async removeDependency(predecessorId: string, successorId: string): Promise<boolean> {
    const result = await this.prisma.taskDependency.deleteMany({
      where: { predecessorId, successorId },
    });
    return result.count > 0;
  }

  addTimeEntry(input: {
    organizationId: string;
    taskId: string;
    userId: string;
    spentOn: Date;
    hours: number;
    note?: string;
  }): Promise<TimeEntry> {
    return this.prisma.timeEntry.create({
      data: {
        organizationId: input.organizationId,
        taskId: input.taskId,
        userId: input.userId,
        spentOn: input.spentOn,
        hours: input.hours,
        note: input.note ?? null,
      },
    });
  }

  findTimeEntry(taskId: string, entryId: string): Promise<TimeEntry | null> {
    return this.prisma.timeEntry.findFirst({ where: { id: entryId, taskId } });
  }

  async deleteTimeEntry(entryId: string): Promise<void> {
    await this.prisma.timeEntry.delete({ where: { id: entryId } });
  }
}
