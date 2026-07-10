import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ChecklistItem, ProjectRole, RoleKey, TaskStatus } from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import {
  collectDescendantIds,
  wouldCreateDependencyCycle,
} from "../domain/task-graph.policy";
import { TASK_REPOSITORY } from "../domain/task.repository";
import type {
  ProjectAccess,
  TaskDetail,
  TaskRepository,
  TaskWithAggregates,
} from "../domain/task.repository";
import type {
  AddDependencyDto,
  ChangeTaskStatusDto,
  CreateChecklistItemDto,
  CreateTaskDto,
  LogTimeDto,
  TaskAssigneeDto,
  UpdateChecklistItemDto,
  UpdateTaskDto,
} from "./dto/task.dtos";

const ORG_WIDE_ROLES: string[] = [RoleKey.admin, RoleKey.manager, RoleKey.pmo];

export interface TaskView {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  startDate: Date | null;
  dueDate: Date | null;
  estimateHours: string | null;
  position: number;
  completedAt: Date | null;
  assignees: Array<{ userId: string; name: string }>;
  checklistDone: number;
  checklistTotal: number;
  timeSpentHours: number;
  subtaskCount: number;
}

export interface TaskDetailView extends TaskView {
  checklist: Array<{ id: string; label: string; isDone: boolean; position: number }>;
  predecessors: Array<{ taskId: string; title: string; status: TaskStatus }>;
  successors: Array<{ taskId: string; title: string; status: TaskStatus }>;
  timeEntries: Array<{
    id: string;
    userId: string;
    userName: string;
    spentOn: Date;
    hours: number;
    note: string | null;
  }>;
}

@Injectable()
export class TasksService {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly repository: TaskRepository,
    private readonly audit: AuditService,
  ) {}

  // ── Lecture ──────────────────────────────────────────────────────────

  async list(payload: JwtPayload, projectId: string): Promise<TaskView[]> {
    await this.requireProject(payload, projectId);
    const tasks = await this.repository.listByProject(projectId);
    const subtaskCounts = new Map<string, number>();
    for (const task of tasks) {
      if (task.parentId) {
        subtaskCounts.set(task.parentId, (subtaskCounts.get(task.parentId) ?? 0) + 1);
      }
    }
    return tasks.map((task) => this.toView(task, subtaskCounts.get(task.id) ?? 0));
  }

  async detail(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
  ): Promise<TaskDetailView> {
    await this.requireProject(payload, projectId);
    const task = await this.repository.findDetail(projectId, taskId);
    if (!task) {
      throw this.taskNotFound();
    }
    const hierarchy = await this.repository.listHierarchy(projectId);
    const subtaskCount = hierarchy.filter((entry) => entry.parentId === taskId).length;
    return {
      ...this.toView(task, subtaskCount),
      checklist: task.checklist.map((item) => ({
        id: item.id,
        label: item.label,
        isDone: item.isDone,
        position: item.position,
      })),
      predecessors: task.predecessors.map((edge) => ({
        taskId: edge.predecessor.id,
        title: edge.predecessor.title,
        status: edge.predecessor.status,
      })),
      successors: task.successors.map((edge) => ({
        taskId: edge.successor.id,
        title: edge.successor.title,
        status: edge.successor.status,
      })),
      timeEntries: task.timeEntries.map((entry) => ({
        id: entry.id,
        userId: entry.userId,
        userName: `${entry.user.firstName} ${entry.user.lastName}`,
        spentOn: entry.spentOn,
        hours: Number(entry.hours),
        note: entry.note,
      })),
    };
  }

  // ── Écriture ─────────────────────────────────────────────────────────

  async create(
    payload: JwtPayload,
    projectId: string,
    dto: CreateTaskDto,
    context: RequestContext,
  ): Promise<TaskView> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanWork(payload, project);
    const { startDate, dueDate } = this.parseDates(dto.startDate, dto.dueDate);

    if (dto.parentId) {
      const parent = await this.repository.findById(projectId, dto.parentId);
      if (!parent) {
        throw new BadRequestException({
          code: "PARENT_TASK_NOT_FOUND",
          message: "Tâche parente introuvable dans ce projet",
        });
      }
    }
    const assigneeIds = [...new Set(dto.assigneeIds ?? [])];
    this.assertAssigneesAreMembers(project, assigneeIds);

    const position = await this.repository.nextPosition(projectId, dto.parentId ?? null);
    const task = await this.repository.create({
      organizationId: payload.org,
      projectId,
      parentId: dto.parentId,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      startDate,
      dueDate,
      estimateHours: dto.estimateHours,
      position,
      createdById: payload.sub,
      assigneeIds,
    });
    await this.audit.log({
      action: "task.created",
      entityType: "task",
      entityId: task.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { title: task.title, projectId, parentId: task.parentId },
      ...context,
    });
    return this.toView(task, 0);
  }

  async update(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    dto: UpdateTaskDto,
    context: RequestContext,
  ): Promise<TaskView> {
    const { task } = await this.requireWritableTask(payload, projectId, taskId);
    const { startDate, dueDate } = this.parseDates(
      dto.startDate ?? task.startDate?.toISOString(),
      dto.dueDate ?? task.dueDate?.toISOString(),
    );
    const updated = await this.repository.update(taskId, {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.estimateHours !== undefined ? { estimateHours: dto.estimateHours } : {}),
      ...(dto.startDate !== undefined ? { startDate: startDate ?? null } : {}),
      ...(dto.dueDate !== undefined ? { dueDate: dueDate ?? null } : {}),
    });
    await this.audit.log({
      action: "task.updated",
      entityType: "task",
      entityId: taskId,
      organizationId: payload.org,
      userId: payload.sub,
      after: JSON.parse(JSON.stringify(dto)),
      ...context,
    });
    return this.toView(updated, await this.subtaskCount(projectId, taskId));
  }

  async changeStatus(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    dto: ChangeTaskStatusDto,
    context: RequestContext,
  ): Promise<TaskView> {
    const { task } = await this.requireWritableTask(payload, projectId, taskId);
    const completedAt = dto.status === TaskStatus.done ? new Date() : null;
    const updated = await this.repository.setStatus(taskId, dto.status, completedAt);
    await this.audit.log({
      action: "task.status_changed",
      entityType: "task",
      entityId: taskId,
      organizationId: payload.org,
      userId: payload.sub,
      before: { status: task.status },
      after: { status: dto.status },
      ...context,
    });
    return this.toView(updated, await this.subtaskCount(projectId, taskId));
  }

  /** Corbeille : la tâche et toutes ses sous-tâches. */
  async softDelete(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    context: RequestContext,
  ): Promise<void> {
    const { task } = await this.requireWritableTask(payload, projectId, taskId);
    const hierarchy = await this.repository.listHierarchy(projectId);
    const ids = [taskId, ...collectDescendantIds(hierarchy, taskId)];
    await this.repository.softDeleteMany(ids);
    await this.audit.log({
      action: "task.deleted",
      entityType: "task",
      entityId: taskId,
      organizationId: payload.org,
      userId: payload.sub,
      before: { title: task.title, subtasksDeleted: ids.length - 1 },
      ...context,
    });
  }

  // ── Assignés ─────────────────────────────────────────────────────────

  async addAssignee(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    dto: TaskAssigneeDto,
    context: RequestContext,
  ): Promise<TaskView> {
    const { project, task } = await this.requireWritableTask(payload, projectId, taskId);
    this.assertAssigneesAreMembers(project, [dto.userId]);
    if (task.assignees.some((assignee) => assignee.userId === dto.userId)) {
      throw new ConflictException({
        code: "ASSIGNEE_ALREADY_EXISTS",
        message: "Déjà assigné(e) à cette tâche",
      });
    }
    await this.repository.addAssignee(taskId, dto.userId);
    await this.audit.log({
      action: "task.assignee_added",
      entityType: "task",
      entityId: taskId,
      organizationId: payload.org,
      userId: payload.sub,
      after: { userId: dto.userId },
      ...context,
    });
    return this.refreshView(projectId, taskId);
  }

  async removeAssignee(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    userId: string,
    context: RequestContext,
  ): Promise<TaskView> {
    await this.requireWritableTask(payload, projectId, taskId);
    await this.repository.removeAssignee(taskId, userId);
    await this.audit.log({
      action: "task.assignee_removed",
      entityType: "task",
      entityId: taskId,
      organizationId: payload.org,
      userId: payload.sub,
      before: { userId },
      ...context,
    });
    return this.refreshView(projectId, taskId);
  }

  // ── Checklist ────────────────────────────────────────────────────────

  async addChecklistItem(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    dto: CreateChecklistItemDto,
  ): Promise<ChecklistItem> {
    const { task } = await this.requireWritableTask(payload, projectId, taskId);
    return this.repository.addChecklistItem(
      taskId,
      dto.label,
      task.checklist.length + 1,
    );
  }

  async updateChecklistItem(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    itemId: string,
    dto: UpdateChecklistItemDto,
  ): Promise<ChecklistItem> {
    await this.requireWritableTask(payload, projectId, taskId);
    const item = await this.repository.findChecklistItem(taskId, itemId);
    if (!item) {
      throw new NotFoundException({
        code: "CHECKLIST_ITEM_NOT_FOUND",
        message: "Élément de checklist introuvable",
      });
    }
    return this.repository.updateChecklistItem(itemId, {
      ...(dto.label !== undefined ? { label: dto.label } : {}),
      ...(dto.isDone !== undefined ? { isDone: dto.isDone } : {}),
    });
  }

  async deleteChecklistItem(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    itemId: string,
  ): Promise<void> {
    await this.requireWritableTask(payload, projectId, taskId);
    const item = await this.repository.findChecklistItem(taskId, itemId);
    if (!item) {
      throw new NotFoundException({
        code: "CHECKLIST_ITEM_NOT_FOUND",
        message: "Élément de checklist introuvable",
      });
    }
    await this.repository.deleteChecklistItem(itemId);
  }

  // ── Dépendances ──────────────────────────────────────────────────────

  async addDependency(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    dto: AddDependencyDto,
    context: RequestContext,
  ): Promise<TaskDetailView> {
    await this.requireWritableTask(payload, projectId, taskId);
    const predecessor = await this.repository.findById(projectId, dto.predecessorId);
    if (!predecessor) {
      throw new BadRequestException({
        code: "TASK_NOT_FOUND",
        message: "Tâche prérequise introuvable dans ce projet",
      });
    }
    if (await this.repository.dependencyExists(dto.predecessorId, taskId)) {
      throw new ConflictException({
        code: "DEPENDENCY_ALREADY_EXISTS",
        message: "Cette dépendance existe déjà",
      });
    }
    const edges = await this.repository.listDependencyEdges(projectId);
    if (
      wouldCreateDependencyCycle(edges, {
        predecessorId: dto.predecessorId,
        successorId: taskId,
      })
    ) {
      throw new BadRequestException({
        code: "DEPENDENCY_CYCLE",
        message: "Cette dépendance créerait un cycle",
      });
    }
    await this.repository.addDependency(dto.predecessorId, taskId);
    await this.audit.log({
      action: "task.dependency_added",
      entityType: "task",
      entityId: taskId,
      organizationId: payload.org,
      userId: payload.sub,
      after: { predecessorId: dto.predecessorId },
      ...context,
    });
    return this.detail(payload, projectId, taskId);
  }

  async removeDependency(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    predecessorId: string,
    context: RequestContext,
  ): Promise<TaskDetailView> {
    await this.requireWritableTask(payload, projectId, taskId);
    const removed = await this.repository.removeDependency(predecessorId, taskId);
    if (!removed) {
      throw new NotFoundException({
        code: "DEPENDENCY_NOT_FOUND",
        message: "Dépendance introuvable",
      });
    }
    await this.audit.log({
      action: "task.dependency_removed",
      entityType: "task",
      entityId: taskId,
      organizationId: payload.org,
      userId: payload.sub,
      before: { predecessorId },
      ...context,
    });
    return this.detail(payload, projectId, taskId);
  }

  // ── Temps passé ──────────────────────────────────────────────────────

  async logTime(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    dto: LogTimeDto,
    context: RequestContext,
  ): Promise<TaskDetailView> {
    await this.requireWritableTask(payload, projectId, taskId);
    await this.repository.addTimeEntry({
      organizationId: payload.org,
      taskId,
      userId: payload.sub,
      spentOn: new Date(dto.spentOn),
      hours: dto.hours,
      note: dto.note,
    });
    await this.audit.log({
      action: "task.time_logged",
      entityType: "task",
      entityId: taskId,
      organizationId: payload.org,
      userId: payload.sub,
      after: { hours: dto.hours, spentOn: dto.spentOn },
      ...context,
    });
    return this.detail(payload, projectId, taskId);
  }

  async deleteTimeEntry(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    entryId: string,
    context: RequestContext,
  ): Promise<TaskDetailView> {
    const { project } = await this.requireWritableTask(payload, projectId, taskId);
    const entry = await this.repository.findTimeEntry(taskId, entryId);
    if (!entry) {
      throw new NotFoundException({
        code: "TIME_ENTRY_NOT_FOUND",
        message: "Saisie de temps introuvable",
      });
    }
    // On supprime sa propre saisie ; les responsables projet peuvent corriger celles des autres
    if (entry.userId !== payload.sub) {
      this.assertCanManage(payload, project);
    }
    await this.repository.deleteTimeEntry(entryId);
    await this.audit.log({
      action: "task.time_deleted",
      entityType: "task",
      entityId: taskId,
      organizationId: payload.org,
      userId: payload.sub,
      before: { entryId, hours: Number(entry.hours), ownerId: entry.userId },
      ...context,
    });
    return this.detail(payload, projectId, taskId);
  }

  // ── Aides privées ────────────────────────────────────────────────────

  private toView(task: TaskWithAggregates | TaskDetail, subtaskCount: number): TaskView {
    const checklist = task.checklist as Array<{ isDone: boolean }>;
    return {
      id: task.id,
      projectId: task.projectId,
      parentId: task.parentId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      startDate: task.startDate,
      dueDate: task.dueDate,
      estimateHours: task.estimateHours?.toString() ?? null,
      position: task.position,
      completedAt: task.completedAt,
      assignees: task.assignees.map((assignee) => ({
        userId: assignee.userId,
        name: `${assignee.user.firstName} ${assignee.user.lastName}`,
      })),
      checklistDone: checklist.filter((item) => item.isDone).length,
      checklistTotal: checklist.length,
      timeSpentHours: task.timeEntries.reduce(
        (total, entry) => total + Number(entry.hours),
        0,
      ),
      subtaskCount,
    };
  }

  private async refreshView(projectId: string, taskId: string): Promise<TaskView> {
    const task = await this.repository.findById(projectId, taskId);
    return this.toView(task!, await this.subtaskCount(projectId, taskId));
  }

  private async subtaskCount(projectId: string, taskId: string): Promise<number> {
    const hierarchy = await this.repository.listHierarchy(projectId);
    return hierarchy.filter((entry) => entry.parentId === taskId).length;
  }

  private async requireProject(
    payload: JwtPayload,
    projectId: string,
  ): Promise<ProjectAccess> {
    const project = await this.repository.findProjectAccess(payload.org, projectId);
    if (!project) {
      throw new NotFoundException({
        code: "PROJECT_NOT_FOUND",
        message: "Projet introuvable",
      });
    }
    return project;
  }

  private async requireWritableTask(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
  ): Promise<{ project: ProjectAccess; task: TaskWithAggregates }> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanWork(payload, project);
    const task = await this.repository.findById(projectId, taskId);
    if (!task) {
      throw this.taskNotFound();
    }
    return { project, task };
  }

  /** Travailler sur les tâches : rôles transverses, ou membre non observateur. */
  private assertCanWork(payload: JwtPayload, project: ProjectAccess): void {
    if (payload.roles.some((role) => ORG_WIDE_ROLES.includes(role))) {
      return;
    }
    const membership = project.members.find((member) => member.userId === payload.sub);
    if (membership && membership.role !== ProjectRole.observer) {
      return;
    }
    throw new ForbiddenException({
      code: "FORBIDDEN",
      message: "Droits insuffisants sur les tâches de ce projet",
    });
  }

  /** Gérer (corriger le temps des autres) : rôles transverses ou manager du projet. */
  private assertCanManage(payload: JwtPayload, project: ProjectAccess): void {
    if (payload.roles.some((role) => ORG_WIDE_ROLES.includes(role))) {
      return;
    }
    if (project.managerId === payload.sub) {
      return;
    }
    const membership = project.members.find((member) => member.userId === payload.sub);
    if (membership?.role === ProjectRole.manager) {
      return;
    }
    throw new ForbiddenException({
      code: "FORBIDDEN",
      message: "Réservé aux responsables du projet",
    });
  }

  private assertAssigneesAreMembers(project: ProjectAccess, userIds: string[]): void {
    const memberIds = new Set(project.members.map((member) => member.userId));
    const missing = userIds.filter((userId) => !memberIds.has(userId));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: "ASSIGNEE_NOT_PROJECT_MEMBER",
        message: "Les assignés doivent être membres du projet",
      });
    }
  }

  private parseDates(
    start?: string,
    due?: string,
  ): { startDate?: Date; dueDate?: Date } {
    const startDate = start ? new Date(start) : undefined;
    const dueDate = due ? new Date(due) : undefined;
    if (startDate && dueDate && dueDate < startDate) {
      throw new BadRequestException({
        code: "INVALID_DATE_RANGE",
        message: "L'échéance doit être postérieure à la date de début",
      });
    }
    return { startDate, dueDate };
  }

  private taskNotFound(): NotFoundException {
    return new NotFoundException({
      code: "TASK_NOT_FOUND",
      message: "Tâche introuvable",
    });
  }
}
