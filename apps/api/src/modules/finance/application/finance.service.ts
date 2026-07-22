import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { BudgetCategory, ProjectRole, RoleKey } from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { FINANCE_REPOSITORY } from "../domain/finance.repository";
import type {
  BudgetLineRecord,
  CostEntryRecord,
  FinanceRepository,
  ProjectFinanceContext,
} from "../domain/finance.repository";
import type {
  CreateBudgetLineDto,
  CreateCostEntryDto,
  SetLaborRateDto,
  UpdateBudgetLineDto,
} from "./dto/finance.dtos";

/** Rôles transverses habilités à gérer les finances d'un projet. */
const FINANCE_MANAGER_ROLES: string[] = [
  RoleKey.admin,
  RoleKey.manager,
  RoleKey.pmo,
  RoleKey.finance,
];

export interface FinanceView {
  approvedBudget: number | null;
  laborRate: number | null;
  canManage: boolean;
  planned: { capex: number; opex: number; total: number };
  actual: {
    manualCapex: number;
    manualOpex: number;
    manualTotal: number;
    laborHours: number;
    laborCost: number;
    total: number;
  };
  /** Budget approuvé − coûts réels (null si pas de budget approuvé). */
  remaining: number | null;
  /** Budget approuvé − prévisionnel réparti (part non affectée en lignes). */
  unallocated: number | null;
  budgetLines: Array<{
    id: string;
    category: BudgetCategory;
    label: string;
    plannedAmount: number;
    committedCost: number;
  }>;
  costEntries: Array<{
    id: string;
    category: BudgetCategory;
    label: string;
    amount: number;
    incurredOn: string;
    budgetLineId: string | null;
    createdByName: string;
  }>;
}

@Injectable()
export class FinanceService {
  constructor(
    @Inject(FINANCE_REPOSITORY)
    private readonly repository: FinanceRepository,
    private readonly audit: AuditService,
  ) {}

  async getFinance(payload: JwtPayload, projectId: string): Promise<FinanceView> {
    const project = await this.requireProject(payload, projectId);
    const [lines, costs, laborHours] = await Promise.all([
      this.repository.listBudgetLines(projectId),
      this.repository.listCostEntries(projectId),
      this.repository.sumProjectHours(projectId),
    ]);
    return this.buildView(payload, project, lines, costs, laborHours);
  }

  async setLaborRate(
    payload: JwtPayload,
    projectId: string,
    dto: SetLaborRateDto,
    context: RequestContext,
  ): Promise<FinanceView> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanManage(payload, project);
    const rate = dto.laborRate ?? null;
    await this.repository.setLaborRate(projectId, rate);
    await this.audit.log({
      action: "finance.labor_rate.set",
      entityType: "project",
      entityId: projectId,
      organizationId: payload.org,
      userId: payload.sub,
      after: { laborRate: rate },
      ...context,
    });
    return this.getFinance(payload, projectId);
  }

  async addBudgetLine(
    payload: JwtPayload,
    projectId: string,
    dto: CreateBudgetLineDto,
    context: RequestContext,
  ): Promise<FinanceView> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanManage(payload, project);
    const line = await this.repository.createBudgetLine({
      organizationId: payload.org,
      projectId,
      category: dto.category,
      label: dto.label,
      plannedAmount: dto.plannedAmount,
      createdById: payload.sub,
    });
    await this.audit.log({
      action: "finance.budget_line.created",
      entityType: "budget_line",
      entityId: line.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { category: dto.category, plannedAmount: dto.plannedAmount },
      ...context,
    });
    return this.getFinance(payload, projectId);
  }

  async updateBudgetLine(
    payload: JwtPayload,
    projectId: string,
    lineId: string,
    dto: UpdateBudgetLineDto,
    context: RequestContext,
  ): Promise<FinanceView> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanManage(payload, project);
    const line = await this.repository.findBudgetLine(projectId, lineId);
    if (!line) {
      throw new NotFoundException({ code: "BUDGET_LINE_NOT_FOUND", message: "Ligne introuvable" });
    }
    await this.repository.updateBudgetLine(lineId, {
      label: dto.label,
      plannedAmount: dto.plannedAmount,
      category: dto.category,
    });
    await this.audit.log({
      action: "finance.budget_line.updated",
      entityType: "budget_line",
      entityId: lineId,
      organizationId: payload.org,
      userId: payload.sub,
      after: { ...dto },
      ...context,
    });
    return this.getFinance(payload, projectId);
  }

  async deleteBudgetLine(
    payload: JwtPayload,
    projectId: string,
    lineId: string,
    context: RequestContext,
  ): Promise<FinanceView> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanManage(payload, project);
    const line = await this.repository.findBudgetLine(projectId, lineId);
    if (!line) {
      throw new NotFoundException({ code: "BUDGET_LINE_NOT_FOUND", message: "Ligne introuvable" });
    }
    await this.repository.deleteBudgetLine(lineId);
    await this.audit.log({
      action: "finance.budget_line.deleted",
      entityType: "budget_line",
      entityId: lineId,
      organizationId: payload.org,
      userId: payload.sub,
      before: { label: line.label },
      ...context,
    });
    return this.getFinance(payload, projectId);
  }

  async addCostEntry(
    payload: JwtPayload,
    projectId: string,
    dto: CreateCostEntryDto,
    context: RequestContext,
  ): Promise<FinanceView> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanManage(payload, project);
    // Une ligne rattachée doit appartenir au projet
    if (dto.budgetLineId) {
      const line = await this.repository.findBudgetLine(projectId, dto.budgetLineId);
      if (!line) {
        throw new BadRequestException({
          code: "BUDGET_LINE_NOT_FOUND",
          message: "La ligne de budget rattachée est introuvable",
        });
      }
    }
    const cost = await this.repository.createCostEntry({
      organizationId: payload.org,
      projectId,
      budgetLineId: dto.budgetLineId ?? null,
      category: dto.category,
      label: dto.label,
      amount: dto.amount,
      incurredOn: new Date(dto.incurredOn),
      createdById: payload.sub,
    });
    await this.audit.log({
      action: "finance.cost_entry.created",
      entityType: "cost_entry",
      entityId: cost.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { category: dto.category, amount: dto.amount },
      ...context,
    });
    return this.getFinance(payload, projectId);
  }

  async deleteCostEntry(
    payload: JwtPayload,
    projectId: string,
    costId: string,
    context: RequestContext,
  ): Promise<FinanceView> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanManage(payload, project);
    const cost = await this.repository.findCostEntry(projectId, costId);
    if (!cost) {
      throw new NotFoundException({ code: "COST_ENTRY_NOT_FOUND", message: "Coût introuvable" });
    }
    await this.repository.deleteCostEntry(costId);
    await this.audit.log({
      action: "finance.cost_entry.deleted",
      entityType: "cost_entry",
      entityId: costId,
      organizationId: payload.org,
      userId: payload.sub,
      before: { label: cost.label, amount: Number(cost.amount) },
      ...context,
    });
    return this.getFinance(payload, projectId);
  }

  // ── Aides privées ────────────────────────────────────────────────────

  private buildView(
    payload: JwtPayload,
    project: ProjectFinanceContext,
    lines: BudgetLineRecord[],
    costs: CostEntryRecord[],
    laborHours: number,
  ): FinanceView {
    const approvedBudget = project.budget !== null ? Number(project.budget) : null;
    const laborRate = project.laborRate !== null ? Number(project.laborRate) : null;

    const plannedCapex = this.sum(lines, "capex", (line) => Number(line.plannedAmount));
    const plannedOpex = this.sum(lines, "opex", (line) => Number(line.plannedAmount));
    const plannedTotal = round(plannedCapex + plannedOpex);

    const manualCapex = this.sum(costs, "capex", (cost) => Number(cost.amount));
    const manualOpex = this.sum(costs, "opex", (cost) => Number(cost.amount));
    const manualTotal = round(manualCapex + manualOpex);

    const laborCost = laborRate !== null ? round(laborHours * laborRate) : 0;
    const actualTotal = round(manualTotal + laborCost);

    const committedByLine = new Map<string, number>();
    for (const cost of costs) {
      if (cost.budgetLineId) {
        committedByLine.set(
          cost.budgetLineId,
          round((committedByLine.get(cost.budgetLineId) ?? 0) + Number(cost.amount)),
        );
      }
    }

    return {
      approvedBudget,
      laborRate,
      canManage: this.canManage(payload, project),
      planned: { capex: plannedCapex, opex: plannedOpex, total: plannedTotal },
      actual: {
        manualCapex,
        manualOpex,
        manualTotal,
        laborHours: round(laborHours),
        laborCost,
        total: actualTotal,
      },
      remaining: approvedBudget !== null ? round(approvedBudget - actualTotal) : null,
      unallocated: approvedBudget !== null ? round(approvedBudget - plannedTotal) : null,
      budgetLines: lines.map((line) => ({
        id: line.id,
        category: line.category,
        label: line.label,
        plannedAmount: Number(line.plannedAmount),
        committedCost: committedByLine.get(line.id) ?? 0,
      })),
      costEntries: costs.map((cost) => ({
        id: cost.id,
        category: cost.category,
        label: cost.label,
        amount: Number(cost.amount),
        incurredOn: cost.incurredOn.toISOString().slice(0, 10),
        budgetLineId: cost.budgetLineId,
        createdByName: cost.createdByName,
      })),
    };
  }

  private sum<T extends { category: BudgetCategory }>(
    items: T[],
    category: BudgetCategory,
    value: (item: T) => number,
  ): number {
    return round(
      items.filter((item) => item.category === category).reduce((acc, item) => acc + value(item), 0),
    );
  }

  private async requireProject(
    payload: JwtPayload,
    projectId: string,
  ): Promise<ProjectFinanceContext> {
    const project = await this.repository.loadProjectContext(payload.org, projectId);
    if (!project) {
      throw new NotFoundException({ code: "PROJECT_NOT_FOUND", message: "Projet introuvable" });
    }
    return project;
  }

  private assertCanManage(payload: JwtPayload, project: ProjectFinanceContext): void {
    if (!this.canManage(payload, project)) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Vous n'avez pas les droits pour gérer les finances de ce projet",
      });
    }
  }

  /** Gérer les finances : rôle transverse financier, ou chef de projet. */
  private canManage(payload: JwtPayload, project: ProjectFinanceContext): boolean {
    if (payload.roles.some((role) => FINANCE_MANAGER_ROLES.includes(role))) {
      return true;
    }
    if (project.managerId === payload.sub) {
      return true;
    }
    return project.members.some(
      (member) => member.userId === payload.sub && member.role === ProjectRole.manager,
    );
  }
}

/** Arrondi monétaire à 2 décimales (évite les artefacts de flottants). */
function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
