import { Injectable } from "@nestjs/common";
import { BudgetCategory } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { computeQuoteTotals } from "../../quote/domain/quote-totals";
import type {
  BudgetLineRecord,
  CostEntryRecord,
  CreateBudgetLineInput,
  CreateCostEntryInput,
  FinanceRepository,
  PortfolioFinanceBundle,
  ProjectFinanceBundle,
  ProjectFinanceContext,
  QuoteTotalsRecord,
} from "../domain/finance.repository";

@Injectable()
export class PrismaFinanceRepository implements FinanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadProjectContext(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectFinanceContext | null> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: {
        id: true,
        managerId: true,
        budget: true,
        laborRate: true,
        members: { select: { userId: true, role: true } },
      },
    });
    if (!project) {
      return null;
    }
    return {
      id: project.id,
      managerId: project.managerId,
      budget: project.budget?.toString() ?? null,
      laborRate: project.laborRate?.toString() ?? null,
      members: project.members,
    };
  }

  async setLaborRate(projectId: string, laborRate: number | null): Promise<void> {
    await this.prisma.project.update({ where: { id: projectId }, data: { laborRate } });
  }

  async listBudgetLines(projectId: string): Promise<BudgetLineRecord[]> {
    const lines = await this.prisma.budgetLine.findMany({
      where: { projectId },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    });
    return lines.map((line) => this.toLine(line));
  }

  async findBudgetLine(projectId: string, lineId: string): Promise<BudgetLineRecord | null> {
    const line = await this.prisma.budgetLine.findFirst({ where: { id: lineId, projectId } });
    return line ? this.toLine(line) : null;
  }

  async createBudgetLine(input: CreateBudgetLineInput): Promise<BudgetLineRecord> {
    const line = await this.prisma.budgetLine.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        category: input.category,
        label: input.label,
        plannedAmount: input.plannedAmount,
        createdById: input.createdById,
      },
    });
    return this.toLine(line);
  }

  async updateBudgetLine(
    lineId: string,
    data: { label?: string; plannedAmount?: number; category?: BudgetCategory },
  ): Promise<BudgetLineRecord> {
    const line = await this.prisma.budgetLine.update({ where: { id: lineId }, data });
    return this.toLine(line);
  }

  async deleteBudgetLine(lineId: string): Promise<void> {
    await this.prisma.budgetLine.delete({ where: { id: lineId } });
  }

  async listCostEntries(projectId: string): Promise<CostEntryRecord[]> {
    const costs = await this.prisma.costEntry.findMany({
      where: { projectId },
      orderBy: { incurredOn: "desc" },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    return costs.map((cost) => this.toCost(cost));
  }

  async findCostEntry(projectId: string, costId: string): Promise<CostEntryRecord | null> {
    const cost = await this.prisma.costEntry.findFirst({
      where: { id: costId, projectId },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    return cost ? this.toCost(cost) : null;
  }

  async createCostEntry(input: CreateCostEntryInput): Promise<CostEntryRecord> {
    const cost = await this.prisma.costEntry.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        budgetLineId: input.budgetLineId,
        category: input.category,
        label: input.label,
        amount: input.amount,
        incurredOn: input.incurredOn,
        createdById: input.createdById,
      },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    return this.toCost(cost);
  }

  async deleteCostEntry(costId: string): Promise<void> {
    await this.prisma.costEntry.delete({ where: { id: costId } });
  }

  async sumProjectHours(projectId: string): Promise<number> {
    const result = await this.prisma.timeEntry.aggregate({
      where: { task: { projectId } },
      _sum: { hours: true },
    });
    return Number(result._sum.hours ?? 0);
  }

  async loadProjectBundle(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectFinanceBundle | null> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: { id: true, code: true, name: true, status: true, budget: true, laborRate: true },
    });
    if (!project) {
      return null;
    }
    const [budgetLines, costEntries, laborHours, quotes] = await Promise.all([
      this.listBudgetLines(projectId),
      this.listCostEntries(projectId),
      this.sumProjectHours(projectId),
      this.loadQuoteTotals([projectId]),
    ]);
    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status,
        budget: project.budget?.toString() ?? null,
        laborRate: project.laborRate?.toString() ?? null,
      },
      budgetLines,
      costEntries,
      laborHours,
      quotes: quotes.get(projectId) ?? [],
    };
  }

  async loadPortfolioBundle(
    organizationId: string,
    portfolioId: string,
  ): Promise<PortfolioFinanceBundle | null> {
    const portfolio = await this.prisma.portfolio.findFirst({
      where: { id: portfolioId, organizationId, deletedAt: null },
      select: { id: true, name: true, budgetEnvelope: true },
    });
    if (!portfolio) {
      return null;
    }
    const projects = await this.prisma.project.findMany({
      where: { portfolioId, organizationId, deletedAt: null },
      select: { id: true, code: true, name: true, status: true, budget: true, laborRate: true },
      orderBy: { createdAt: "asc" },
    });
    const projectIds = projects.map((project) => project.id);
    const [budgetLines, costEntries, hours, quotes] = await Promise.all([
      this.prisma.budgetLine.findMany({ where: { projectId: { in: projectIds } } }),
      this.prisma.costEntry.findMany({
        where: { projectId: { in: projectIds } },
        include: { createdBy: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.timeEntry.groupBy({
        by: ["taskId"],
        where: { task: { projectId: { in: projectIds } } },
        _sum: { hours: true },
      }),
      this.loadQuoteTotals(projectIds),
    ]);
    // Regroupe les heures par projet (via la tâche)
    const taskProject = new Map(
      (
        await this.prisma.task.findMany({
          where: { projectId: { in: projectIds } },
          select: { id: true, projectId: true },
        })
      ).map((task) => [task.id, task.projectId]),
    );
    const hoursByProject = new Map<string, number>();
    for (const row of hours) {
      const projectId = taskProject.get(row.taskId);
      if (projectId) {
        hoursByProject.set(
          projectId,
          (hoursByProject.get(projectId) ?? 0) + Number(row._sum.hours ?? 0),
        );
      }
    }
    return {
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        budgetEnvelope: portfolio.budgetEnvelope?.toString() ?? null,
      },
      projects: projects.map((project) => ({
        project: {
          id: project.id,
          code: project.code,
          name: project.name,
          status: project.status,
          budget: project.budget?.toString() ?? null,
          laborRate: project.laborRate?.toString() ?? null,
        },
        budgetLines: budgetLines
          .filter((line) => line.projectId === project.id)
          .map((line) => this.toLine(line)),
        costEntries: costEntries
          .filter((cost) => cost.projectId === project.id)
          .map((cost) => this.toCost(cost)),
        laborHours: hoursByProject.get(project.id) ?? 0,
        quotes: quotes.get(project.id) ?? [],
      })),
    };
  }

  /** Totaux HT/TTC des devis, groupés par projet (source unique quote-totals). */
  private async loadQuoteTotals(
    projectIds: string[],
  ): Promise<Map<string, QuoteTotalsRecord[]>> {
    const result = new Map<string, QuoteTotalsRecord[]>();
    if (projectIds.length === 0) {
      return result;
    }
    const quotes = await this.prisma.quote.findMany({
      where: { projectId: { in: projectIds } },
      select: {
        projectId: true,
        status: true,
        vatRate: true,
        lines: { select: { quantity: true, unitPrice: true, discountRate: true } },
      },
    });
    for (const quote of quotes) {
      const totals = computeQuoteTotals(
        quote.lines.map((line) => ({
          quantity: line.quantity.toString(),
          unitPrice: line.unitPrice.toString(),
          discountRate: line.discountRate.toString(),
        })),
        quote.vatRate.toString(),
      );
      const list = result.get(quote.projectId) ?? [];
      list.push({ status: quote.status, totalHT: totals.totalHT, totalTTC: totals.totalTTC });
      result.set(quote.projectId, list);
    }
    return result;
  }

  private toLine(line: {
    id: string;
    category: BudgetCategory;
    label: string;
    plannedAmount: { toString(): string };
    createdAt: Date;
  }): BudgetLineRecord {
    return {
      id: line.id,
      category: line.category,
      label: line.label,
      plannedAmount: line.plannedAmount.toString(),
      createdAt: line.createdAt,
    };
  }

  private toCost(cost: {
    id: string;
    category: BudgetCategory;
    label: string;
    amount: { toString(): string };
    incurredOn: Date;
    budgetLineId: string | null;
    createdAt: Date;
    createdBy: { firstName: string; lastName: string };
  }): CostEntryRecord {
    return {
      id: cost.id,
      category: cost.category,
      label: cost.label,
      amount: cost.amount.toString(),
      incurredOn: cost.incurredOn,
      budgetLineId: cost.budgetLineId,
      createdByName: `${cost.createdBy.firstName} ${cost.createdBy.lastName}`,
      createdAt: cost.createdAt,
    };
  }
}
