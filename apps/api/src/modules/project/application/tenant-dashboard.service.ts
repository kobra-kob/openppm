import { Injectable } from "@nestjs/common";
import { MembershipStatus, ProjectStatus, TaskStatus } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";

/**
 * Tableau de bord global du tenant (CQRS lecture : agrégats SQL directs).
 * Regroupe les indicateurs stratégiques de l'organisation courante.
 */
export interface TenantDashboardView {
  activeProjects: number;
  totalProjects: number;
  totalDemands: number;
  /** Somme des budgets approuvés des projets (en euros). */
  engagedBudget: number;
  memberCount: number;
  openTasks: number;
  overdueTasks: number;
  /** % de tâches terminées (objectifs atteints), 0 si aucune tâche. */
  objectivesRatio: number;
  projectsByStatus: Record<ProjectStatus, number>;
  /** Livraisons (tâches terminées) par trimestre, 6 derniers trimestres. */
  deliveriesByQuarter: Array<{ key: string; year: number; quarter: number; count: number }>;
}

/** Bornes [début, fin[ des 6 derniers trimestres, du plus ancien au plus récent. */
function lastSixQuarters(now: Date): Array<{ year: number; quarter: number; start: Date; end: Date }> {
  const quarters: Array<{ year: number; quarter: number; start: Date; end: Date }> = [];
  const currentQuarter = Math.floor(now.getUTCMonth() / 3); // 0..3
  let year = now.getUTCFullYear();
  let quarter = currentQuarter;
  for (let i = 0; i < 6; i += 1) {
    const startMonth = quarter * 3;
    const start = new Date(Date.UTC(year, startMonth, 1));
    const end = new Date(Date.UTC(year, startMonth + 3, 1));
    quarters.unshift({ year, quarter: quarter + 1, start, end });
    quarter -= 1;
    if (quarter < 0) {
      quarter = 3;
      year -= 1;
    }
  }
  return quarters;
}

@Injectable()
export class TenantDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async forOrganization(organizationId: string): Promise<TenantDashboardView> {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const quarters = lastSixQuarters(new Date());

    const [
      projectsByStatusRows,
      totalProjects,
      totalDemands,
      budget,
      memberCount,
      openTasks,
      overdueTasks,
      doneTasks,
      nonCancelledTasks,
      quarterCounts,
    ] = await Promise.all([
      this.prisma.project.groupBy({
        by: ["status"],
        where: { organizationId, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.project.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.demand.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.project.aggregate({
        where: { organizationId, deletedAt: null },
        _sum: { budget: true },
      }),
      this.prisma.organizationMembership.count({
        where: { organizationId, status: MembershipStatus.ACTIVE },
      }),
      this.prisma.task.count({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: [TaskStatus.todo, TaskStatus.in_progress] },
        },
      }),
      this.prisma.task.count({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: [TaskStatus.todo, TaskStatus.in_progress] },
          dueDate: { lt: startOfToday },
        },
      }),
      this.prisma.task.count({
        where: { organizationId, deletedAt: null, status: TaskStatus.done },
      }),
      this.prisma.task.count({
        where: {
          organizationId,
          deletedAt: null,
          status: { not: TaskStatus.cancelled },
        },
      }),
      Promise.all(
        quarters.map((q) =>
          this.prisma.task.count({
            where: {
              organizationId,
              deletedAt: null,
              completedAt: { gte: q.start, lt: q.end },
            },
          }),
        ),
      ),
    ]);

    const projectsByStatus: Record<ProjectStatus, number> = {
      [ProjectStatus.draft]: 0,
      [ProjectStatus.active]: 0,
      [ProjectStatus.on_hold]: 0,
      [ProjectStatus.completed]: 0,
      [ProjectStatus.archived]: 0,
    };
    for (const row of projectsByStatusRows) {
      projectsByStatus[row.status] = row._count._all;
    }

    const objectivesRatio =
      nonCancelledTasks === 0 ? 0 : Math.round((doneTasks / nonCancelledTasks) * 100);

    return {
      activeProjects: projectsByStatus[ProjectStatus.active],
      totalProjects,
      totalDemands,
      engagedBudget: Number(budget._sum.budget ?? 0),
      memberCount,
      openTasks,
      overdueTasks,
      objectivesRatio,
      projectsByStatus,
      deliveriesByQuarter: quarters.map((q, index) => ({
        key: `${q.year}-T${q.quarter}`,
        year: q.year,
        quarter: q.quarter,
        count: quarterCounts[index] ?? 0,
      })),
    };
  }
}
