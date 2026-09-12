import { Injectable } from "@nestjs/common";
import { MembershipStatus, ProjectHealth, ProjectStatus, TaskStatus } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";

/** Projets « vivants » (pilotage en cours) : ni brouillon, ni terminé, ni archivé. */
const LIVE_STATUSES = [ProjectStatus.active, ProjectStatus.on_hold];

/**
 * Tableau de bord global du tenant (CQRS lecture : agrégats SQL directs).
 * Regroupe les indicateurs stratégiques de l'organisation courante.
 */
export interface TenantDashboardView {
  activeProjects: number;
  totalProjects: number;
  completedProjects: number;
  /** % de projets terminés sur le total (0 si aucun projet). */
  completionRate: number;
  portfolios: number;
  totalDemands: number;
  /** Demandes non encore converties en projet (backlog d'entrée). */
  pendingDemands: number;
  /** Somme des budgets approuvés des projets (en euros). */
  engagedBudget: number;
  /** Coûts réels enregistrés (en euros). */
  consumedBudget: number;
  memberCount: number;
  openTasks: number;
  overdueTasks: number;
  /** Projets vivants dont l'échéance est dépassée. */
  overdueProjects: number;
  /** Projets vivants en santé amber ou red. */
  projectsAtRisk: number;
  /** % de tâches terminées (objectifs atteints), 0 si aucune tâche. */
  objectivesRatio: number;
  projectsByStatus: Record<ProjectStatus, number>;
  /** Santé des projets vivants (green / amber / red). */
  projectsByHealth: Record<ProjectHealth, number>;
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
      projectsByHealthRows,
      totalProjects,
      portfolios,
      totalDemands,
      pendingDemands,
      budget,
      consumed,
      memberCount,
      openTasks,
      overdueTasks,
      overdueProjects,
      projectsAtRisk,
      doneTasks,
      nonCancelledTasks,
      quarterCounts,
    ] = await Promise.all([
      this.prisma.project.groupBy({
        by: ["status"],
        where: { organizationId, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.project.groupBy({
        by: ["health"],
        where: { organizationId, deletedAt: null, status: { in: LIVE_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.project.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.portfolio.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.demand.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.demand.count({
        where: { organizationId, deletedAt: null, project: null },
      }),
      this.prisma.project.aggregate({
        where: { organizationId, deletedAt: null },
        _sum: { budget: true },
      }),
      this.prisma.costEntry.aggregate({
        where: { organizationId, project: { deletedAt: null } },
        _sum: { amount: true },
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
      this.prisma.project.count({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: LIVE_STATUSES },
          endDate: { lt: startOfToday },
        },
      }),
      this.prisma.project.count({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: LIVE_STATUSES },
          health: { in: [ProjectHealth.amber, ProjectHealth.red] },
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

    const projectsByHealth: Record<ProjectHealth, number> = {
      [ProjectHealth.green]: 0,
      [ProjectHealth.amber]: 0,
      [ProjectHealth.red]: 0,
    };
    for (const row of projectsByHealthRows) {
      projectsByHealth[row.health] = row._count._all;
    }

    const objectivesRatio =
      nonCancelledTasks === 0 ? 0 : Math.round((doneTasks / nonCancelledTasks) * 100);
    const completedProjects = projectsByStatus[ProjectStatus.completed];
    const completionRate =
      totalProjects === 0 ? 0 : Math.round((completedProjects / totalProjects) * 100);

    return {
      activeProjects: projectsByStatus[ProjectStatus.active],
      totalProjects,
      completedProjects,
      completionRate,
      portfolios,
      totalDemands,
      pendingDemands,
      engagedBudget: Number(budget._sum.budget ?? 0),
      consumedBudget: Number(consumed._sum.amount ?? 0),
      memberCount,
      openTasks,
      overdueTasks,
      overdueProjects,
      projectsAtRisk,
      objectivesRatio,
      projectsByStatus,
      projectsByHealth,
      deliveriesByQuarter: quarters.map((q, index) => ({
        key: `${q.year}-T${q.quarter}`,
        year: q.year,
        quarter: q.quarter,
        count: quarterCounts[index] ?? 0,
      })),
    };
  }
}
