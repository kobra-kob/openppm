import type {
  ChecklistItem,
  Task,
  TaskDependency,
  TaskStatus,
  TimeEntry,
} from "@openppm/db";
import type { DependencyEdge } from "./task-graph.policy";

export interface TaskUser {
  id: string;
  firstName: string;
  lastName: string;
}

/** Tâche chargée pour la liste : agrégats calculables en mémoire. */
export type TaskWithAggregates = Task & {
  assignees: Array<{ userId: string; user: TaskUser }>;
  checklist: Array<{ isDone: boolean }>;
  timeEntries: Array<{ hours: unknown }>;
};

export type TaskDetail = Task & {
  assignees: Array<{ userId: string; user: TaskUser }>;
  checklist: ChecklistItem[];
  predecessors: Array<
    TaskDependency & { predecessor: { id: string; title: string; status: TaskStatus } }
  >;
  successors: Array<
    TaskDependency & { successor: { id: string; title: string; status: TaskStatus } }
  >;
  timeEntries: Array<TimeEntry & { user: TaskUser }>;
};

export interface ProjectAccess {
  id: string;
  organizationId: string;
  managerId: string | null;
  members: Array<{ userId: string; role: string }>;
}

export interface CreateTaskInput {
  organizationId: string;
  projectId: string;
  parentId?: string;
  title: string;
  description?: string;
  priority?: number;
  startDate?: Date;
  dueDate?: Date;
  estimateHours?: number;
  position: number;
  createdById: string;
  assigneeIds: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: number;
  startDate?: Date | null;
  dueDate?: Date | null;
  estimateHours?: number | null;
}

export type AssignedTask = Task & {
  project: { id: string; name: string; code: string };
};

export interface TaskRepository {
  findProjectAccess(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectAccess | null>;

  /** Tâches ouvertes assignées à un utilisateur, tous projets confondus. */
  listAssignedToUser(organizationId: string, userId: string): Promise<AssignedTask[]>;

  listByProject(projectId: string): Promise<TaskWithAggregates[]>;
  findById(projectId: string, taskId: string): Promise<TaskWithAggregates | null>;
  findDetail(projectId: string, taskId: string): Promise<TaskDetail | null>;
  nextPosition(projectId: string, parentId: string | null): Promise<number>;
  /** Réordonne un groupe de tâches sœurs : position = rang dans orderedIds. */
  reorder(projectId: string, orderedIds: string[]): Promise<void>;
  create(input: CreateTaskInput): Promise<TaskWithAggregates>;
  update(taskId: string, input: UpdateTaskInput): Promise<TaskWithAggregates>;
  setStatus(
    taskId: string,
    status: TaskStatus,
    completedAt: Date | null,
  ): Promise<TaskWithAggregates>;
  /** Soft delete de la tâche et de toutes ses sous-tâches. */
  softDeleteMany(taskIds: string[]): Promise<void>;
  /** Toutes les tâches (id, parentId) non supprimées du projet. */
  listHierarchy(projectId: string): Promise<Array<{ id: string; parentId: string | null }>>;

  addAssignee(taskId: string, userId: string): Promise<void>;
  removeAssignee(taskId: string, userId: string): Promise<void>;

  addChecklistItem(taskId: string, label: string, position: number): Promise<ChecklistItem>;
  findChecklistItem(taskId: string, itemId: string): Promise<ChecklistItem | null>;
  updateChecklistItem(
    itemId: string,
    input: { label?: string; isDone?: boolean },
  ): Promise<ChecklistItem>;
  deleteChecklistItem(itemId: string): Promise<void>;

  listDependencyEdges(projectId: string): Promise<DependencyEdge[]>;
  dependencyExists(predecessorId: string, successorId: string): Promise<boolean>;
  addDependency(predecessorId: string, successorId: string): Promise<void>;
  removeDependency(predecessorId: string, successorId: string): Promise<boolean>;

  addTimeEntry(input: {
    organizationId: string;
    taskId: string;
    userId: string;
    spentOn: Date;
    hours: number;
    note?: string;
  }): Promise<TimeEntry>;
  findTimeEntry(taskId: string, entryId: string): Promise<TimeEntry | null>;
  deleteTimeEntry(entryId: string): Promise<void>;
}

export const TASK_REPOSITORY = Symbol("TASK_REPOSITORY");
