import { Injectable, NotFoundException } from "@nestjs/common";
import { TaskStatus } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";

/**
 * Service de requêtes du dashboard projet (CQRS lecture : agrégats SQL
 * directs, sans passer par les repositories du domaine).
 */
export interface ProjectDashboardView {
  totalTasks: number;
  statusCounts: Record<TaskStatus, number>;
  /** % de tâches terminées (0 si aucune tâche) */
  doneRatio: number;
  overdueCount: number;
  estimateHours: number;
  spentHours: number;
  memberCount: number;
  endDate: Date | null;
  /** Jours restants avant l'échéance projet (négatif si dépassée, null sans date) */
  daysRemaining: number | null;
  upcoming: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    priority: number;
    dueDate: Date;
    assignees: string[];
  }>;
}

@Injectable()
export class ProjectDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async forProject(payload: JwtPayload, projectId: string): Promise<ProjectDashboardView> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: payload.org, deletedAt: null },
      select: { id: true, endDate: true },
    });
    if (!project) {
      throw new NotFoundException({
        code: "PROJECT_NOT_FOUND",
        message: "Projet introuvable",
      });
    }

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [byStatus, estimate, spent, overdueCount, memberCount, upcoming] =
      await Promise.all([
        this.prisma.task.groupBy({
          by: ["status"],
          where: { projectId, deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.task.aggregate({
          where: { projectId, deletedAt: null },
          _sum: { estimateHours: true },
        }),
        this.prisma.timeEntry.aggregate({
          where: { task: { projectId, deletedAt: null } },
          _sum: { hours: true },
        }),
        this.prisma.task.count({
          where: {
            projectId,
            deletedAt: null,
            status: { in: [TaskStatus.todo, TaskStatus.in_progress] },
            dueDate: { lt: startOfToday },
          },
        }),
        this.prisma.projectMember.count({ where: { projectId } }),
        this.prisma.task.findMany({
          where: {
            projectId,
            deletedAt: null,
            status: { in: [TaskStatus.todo, TaskStatus.in_progress] },
            dueDate: { not: null },
          },
          include: {
            assignees: {
              include: { user: { select: { firstName: true, lastName: true } } },
            },
          },
          orderBy: { dueDate: "asc" },
          take: 5,
        }),
      ]);

    const statusCounts: Record<TaskStatus, number> = {
      [TaskStatus.todo]: 0,
      [TaskStatus.in_progress]: 0,
      [TaskStatus.done]: 0,
      [TaskStatus.cancelled]: 0,
    };
    for (const row of byStatus) {
      statusCounts[row.status] = row._count._all;
    }
    const totalTasks = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
    const doneRatio =
      totalTasks === 0
        ? 0
        : Math.round((statusCounts[TaskStatus.done] / totalTasks) * 100);
    const daysRemaining = project.endDate
      ? Math.ceil((project.endDate.getTime() - startOfToday.getTime()) / 86_400_000)
      : null;

    return {
      totalTasks,
      statusCounts,
      doneRatio,
      overdueCount,
      estimateHours: Number(estimate._sum.estimateHours ?? 0),
      spentHours: Number(spent._sum.hours ?? 0),
      memberCount,
      endDate: project.endDate,
      daysRemaining,
      upcoming: upcoming.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate!,
        assignees: task.assignees.map(
          (assignee) => `${assignee.user.firstName} ${assignee.user.lastName}`,
        ),
      })),
    };
  }
}
