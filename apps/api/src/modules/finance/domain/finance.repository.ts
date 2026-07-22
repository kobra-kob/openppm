import type { BudgetCategory, ProjectRole, ProjectStatus, QuoteStatus } from "@openppm/db";

export const FINANCE_REPOSITORY = Symbol("FINANCE_REPOSITORY");

/** Contexte projet nécessaire aux règles de finances (scopé à l'organisation). */
export interface ProjectFinanceContext {
  id: string;
  managerId: string | null;
  budget: string | null;
  laborRate: string | null;
  members: Array<{ userId: string; role: ProjectRole }>;
}

export interface BudgetLineRecord {
  id: string;
  category: BudgetCategory;
  label: string;
  plannedAmount: string;
  createdAt: Date;
}

export interface CostEntryRecord {
  id: string;
  category: BudgetCategory;
  label: string;
  amount: string;
  incurredOn: Date;
  budgetLineId: string | null;
  createdByName: string;
  createdAt: Date;
}

export interface CreateBudgetLineInput {
  organizationId: string;
  projectId: string;
  category: BudgetCategory;
  label: string;
  plannedAmount: number;
  createdById: string;
}

export interface CreateCostEntryInput {
  organizationId: string;
  projectId: string;
  budgetLineId: string | null;
  category: BudgetCategory;
  label: string;
  amount: number;
  incurredOn: Date;
  createdById: string;
}

/** Totaux d'un devis (calculés via la source unique quote-totals). */
export interface QuoteTotalsRecord {
  status: QuoteStatus;
  totalHT: number;
  totalTTC: number;
}

/** Données brutes de finance d'un projet — socle des synthèses. */
export interface ProjectFinanceBundle {
  project: {
    id: string;
    code: string;
    name: string;
    status: ProjectStatus;
    budget: string | null;
    laborRate: string | null;
  };
  budgetLines: BudgetLineRecord[];
  costEntries: CostEntryRecord[];
  laborHours: number;
  quotes: QuoteTotalsRecord[];
}

export interface PortfolioFinanceBundle {
  portfolio: { id: string; name: string; budgetEnvelope: string | null };
  projects: ProjectFinanceBundle[];
}

export interface FinanceRepository {
  loadProjectContext(organizationId: string, projectId: string): Promise<ProjectFinanceContext | null>;
  setLaborRate(projectId: string, laborRate: number | null): Promise<void>;

  listBudgetLines(projectId: string): Promise<BudgetLineRecord[]>;
  findBudgetLine(projectId: string, lineId: string): Promise<BudgetLineRecord | null>;
  createBudgetLine(input: CreateBudgetLineInput): Promise<BudgetLineRecord>;
  updateBudgetLine(
    lineId: string,
    data: { label?: string; plannedAmount?: number; category?: BudgetCategory },
  ): Promise<BudgetLineRecord>;
  deleteBudgetLine(lineId: string): Promise<void>;

  listCostEntries(projectId: string): Promise<CostEntryRecord[]>;
  findCostEntry(projectId: string, costId: string): Promise<CostEntryRecord | null>;
  createCostEntry(input: CreateCostEntryInput): Promise<CostEntryRecord>;
  deleteCostEntry(costId: string): Promise<void>;

  /** Total des heures saisies sur les tâches du projet (main-d'œuvre). */
  sumProjectHours(projectId: string): Promise<number>;

  /** Charge en un bloc les données de finance d'un projet (dont devis). */
  loadProjectBundle(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectFinanceBundle | null>;

  /** Charge les données de finance de tous les projets d'un portefeuille. */
  loadPortfolioBundle(
    organizationId: string,
    portfolioId: string,
  ): Promise<PortfolioFinanceBundle | null>;

  /** Charge les données de finance de tous les portefeuilles de l'organisation. */
  loadOrgPortfolioBundles(organizationId: string): Promise<PortfolioFinanceBundle[]>;
}
