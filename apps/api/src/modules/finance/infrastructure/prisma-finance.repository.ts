import { Injectable } from "@nestjs/common";
import { BudgetCategory } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type {
  BudgetLineRecord,
  CostEntryRecord,
  CreateBudgetLineInput,
  CreateCostEntryInput,
  FinanceRepository,
  ProjectFinanceContext,
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
