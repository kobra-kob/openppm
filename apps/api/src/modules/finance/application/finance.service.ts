import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { BudgetCategory, ProjectRole, ProjectStatus, QuoteStatus, RoleKey } from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { FINANCE_REPOSITORY } from "../domain/finance.repository";
import type {
  FinanceRepository,
  ProjectFinanceBundle,
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

/** Devis reliés à la finance : engagement client consolidé. */
export interface QuotesSummary {
  count: number;
  approvedCount: number;
  pendingCount: number;
  approvedTotalHT: number;
  approvedTotalTTC: number;
}

/**
 * Chiffres financiers partagés — calculés une seule fois (computeSummary) et
 * réutilisés à l'identique côté projet ET côté portefeuille : mêmes stats partout.
 */
export interface FinanceSummary {
  approvedBudget: number | null;
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
  quotes: QuotesSummary;
}

export interface FinanceView extends FinanceSummary {
  laborRate: number | null;
  canManage: boolean;
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

/** Résumé financier compact d'un portefeuille (liste des portefeuilles). */
export interface PortfolioFinanceSummaryRow {
  portfolioId: string;
  budgetEnvelope: number | null;
  approvedBudget: number | null;
  actualTotal: number;
  remaining: number | null;
  envelopeConsumedPct: number | null;
  quotesApprovedHT: number;
}

/** Consolidation financière d'un portefeuille (mêmes chiffres, agrégés). */
export interface PortfolioFinanceView extends FinanceSummary {
  portfolioId: string;
  name: string;
  budgetEnvelope: number | null;
  /** Coûts réels / enveloppe (%). */
  envelopeConsumedPct: number | null;
  projectCount: number;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    status: ProjectStatus;
    approvedBudget: number | null;
    actualTotal: number;
    remaining: number | null;
    quotesApprovedHT: number;
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
    const context = await this.requireProject(payload, projectId);
    const bundle = await this.repository.loadProjectBundle(payload.org, projectId);
    if (!bundle) {
      throw new NotFoundException({ code: "PROJECT_NOT_FOUND", message: "Projet introuvable" });
    }
    return this.buildView(payload, context, bundle);
  }

  /** Résumés financiers de tous les portefeuilles (pour la liste). */
  async getPortfolioSummaries(payload: JwtPayload): Promise<PortfolioFinanceSummaryRow[]> {
    const bundles = await this.repository.loadOrgPortfolioBundles(payload.org);
    return bundles.map((bundle) => {
      const summary = aggregateSummaries(bundle.projects.map((p) => computeSummary(p)));
      const envelope =
        bundle.portfolio.budgetEnvelope !== null ? Number(bundle.portfolio.budgetEnvelope) : null;
      return {
        portfolioId: bundle.portfolio.id,
        budgetEnvelope: envelope,
        approvedBudget: summary.approvedBudget,
        actualTotal: summary.actual.total,
        remaining: summary.remaining,
        envelopeConsumedPct:
          envelope && envelope > 0 ? round((summary.actual.total / envelope) * 100) : null,
        quotesApprovedHT: summary.quotes.approvedTotalHT,
      };
    });
  }

  /** Consolidation financière d'un portefeuille — mêmes chiffres, agrégés. */
  async getPortfolioConsolidation(
    payload: JwtPayload,
    portfolioId: string,
  ): Promise<PortfolioFinanceView> {
    const bundle = await this.repository.loadPortfolioBundle(payload.org, portfolioId);
    if (!bundle) {
      throw new NotFoundException({
        code: "PORTFOLIO_NOT_FOUND",
        message: "Portefeuille introuvable",
      });
    }
    const perProject = bundle.projects.map((project) => ({
      bundle: project,
      summary: computeSummary(project),
    }));
    const summary = aggregateSummaries(perProject.map((entry) => entry.summary));
    const envelope =
      bundle.portfolio.budgetEnvelope !== null ? Number(bundle.portfolio.budgetEnvelope) : null;
    return {
      ...summary,
      portfolioId: bundle.portfolio.id,
      name: bundle.portfolio.name,
      budgetEnvelope: envelope,
      envelopeConsumedPct:
        envelope && envelope > 0 ? round((summary.actual.total / envelope) * 100) : null,
      projectCount: bundle.projects.length,
      projects: perProject.map(({ bundle: project, summary: projectSummary }) => ({
        id: project.project.id,
        code: project.project.code,
        name: project.project.name,
        status: project.project.status,
        approvedBudget: projectSummary.approvedBudget,
        actualTotal: projectSummary.actual.total,
        remaining: projectSummary.remaining,
        quotesApprovedHT: projectSummary.quotes.approvedTotalHT,
      })),
    };
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
    context: ProjectFinanceContext,
    bundle: ProjectFinanceBundle,
  ): FinanceView {
    const summary = computeSummary(bundle);
    const committedByLine = new Map<string, number>();
    for (const cost of bundle.costEntries) {
      if (cost.budgetLineId) {
        committedByLine.set(
          cost.budgetLineId,
          round((committedByLine.get(cost.budgetLineId) ?? 0) + Number(cost.amount)),
        );
      }
    }
    return {
      ...summary,
      laborRate: bundle.project.laborRate !== null ? Number(bundle.project.laborRate) : null,
      canManage: this.canManage(payload, context),
      budgetLines: bundle.budgetLines.map((line) => ({
        id: line.id,
        category: line.category,
        label: line.label,
        plannedAmount: Number(line.plannedAmount),
        committedCost: committedByLine.get(line.id) ?? 0,
      })),
      costEntries: bundle.costEntries.map((cost) => ({
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

/** Statuts de devis « en cours de validation ». */
const PENDING_QUOTE_STATUSES: QuoteStatus[] = [QuoteStatus.submitted, QuoteStatus.reviewed];

/**
 * Calcule la synthèse financière d'un projet à partir de ses données brutes.
 * UNIQUE point de calcul : garantit des chiffres identiques côté projet et
 * côté consolidation de portefeuille (devis inclus).
 */
export function computeSummary(bundle: ProjectFinanceBundle): FinanceSummary {
  const approvedBudget = bundle.project.budget !== null ? Number(bundle.project.budget) : null;
  const laborRate = bundle.project.laborRate !== null ? Number(bundle.project.laborRate) : null;

  const plannedCapex = sumByCategory(bundle.budgetLines, "capex", (l) => Number(l.plannedAmount));
  const plannedOpex = sumByCategory(bundle.budgetLines, "opex", (l) => Number(l.plannedAmount));
  const plannedTotal = round(plannedCapex + plannedOpex);

  const manualCapex = sumByCategory(bundle.costEntries, "capex", (c) => Number(c.amount));
  const manualOpex = sumByCategory(bundle.costEntries, "opex", (c) => Number(c.amount));
  const manualTotal = round(manualCapex + manualOpex);

  const laborCost = laborRate !== null ? round(bundle.laborHours * laborRate) : 0;
  const actualTotal = round(manualTotal + laborCost);

  const approvedQuotes = bundle.quotes.filter((q) => q.status === QuoteStatus.approved);
  const quotes: QuotesSummary = {
    count: bundle.quotes.length,
    approvedCount: approvedQuotes.length,
    pendingCount: bundle.quotes.filter((q) => PENDING_QUOTE_STATUSES.includes(q.status)).length,
    approvedTotalHT: round(approvedQuotes.reduce((acc, q) => acc + q.totalHT, 0)),
    approvedTotalTTC: round(approvedQuotes.reduce((acc, q) => acc + q.totalTTC, 0)),
  };

  return {
    approvedBudget,
    planned: { capex: plannedCapex, opex: plannedOpex, total: plannedTotal },
    actual: {
      manualCapex,
      manualOpex,
      manualTotal,
      laborHours: round(bundle.laborHours),
      laborCost,
      total: actualTotal,
    },
    remaining: approvedBudget !== null ? round(approvedBudget - actualTotal) : null,
    unallocated: approvedBudget !== null ? round(approvedBudget - plannedTotal) : null,
    quotes,
  };
}

/** Additionne des synthèses projet en une synthèse consolidée. */
export function aggregateSummaries(summaries: FinanceSummary[]): FinanceSummary {
  const hasBudget = summaries.some((s) => s.approvedBudget !== null);
  const approvedBudget = hasBudget
    ? round(summaries.reduce((acc, s) => acc + (s.approvedBudget ?? 0), 0))
    : null;
  const plannedCapex = round(summaries.reduce((acc, s) => acc + s.planned.capex, 0));
  const plannedOpex = round(summaries.reduce((acc, s) => acc + s.planned.opex, 0));
  const plannedTotal = round(plannedCapex + plannedOpex);
  const manualCapex = round(summaries.reduce((acc, s) => acc + s.actual.manualCapex, 0));
  const manualOpex = round(summaries.reduce((acc, s) => acc + s.actual.manualOpex, 0));
  const manualTotal = round(manualCapex + manualOpex);
  const laborHours = round(summaries.reduce((acc, s) => acc + s.actual.laborHours, 0));
  const laborCost = round(summaries.reduce((acc, s) => acc + s.actual.laborCost, 0));
  const actualTotal = round(manualTotal + laborCost);
  return {
    approvedBudget,
    planned: { capex: plannedCapex, opex: plannedOpex, total: plannedTotal },
    actual: { manualCapex, manualOpex, manualTotal, laborHours, laborCost, total: actualTotal },
    remaining: approvedBudget !== null ? round(approvedBudget - actualTotal) : null,
    unallocated: approvedBudget !== null ? round(approvedBudget - plannedTotal) : null,
    quotes: {
      count: summaries.reduce((acc, s) => acc + s.quotes.count, 0),
      approvedCount: summaries.reduce((acc, s) => acc + s.quotes.approvedCount, 0),
      pendingCount: summaries.reduce((acc, s) => acc + s.quotes.pendingCount, 0),
      approvedTotalHT: round(summaries.reduce((acc, s) => acc + s.quotes.approvedTotalHT, 0)),
      approvedTotalTTC: round(summaries.reduce((acc, s) => acc + s.quotes.approvedTotalTTC, 0)),
    },
  };
}

function sumByCategory<T extends { category: BudgetCategory }>(
  items: T[],
  category: BudgetCategory,
  value: (item: T) => number,
): number {
  return round(
    items.filter((item) => item.category === category).reduce((acc, item) => acc + value(item), 0),
  );
}

/** Arrondi monétaire à 2 décimales (évite les artefacts de flottants). */
function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
