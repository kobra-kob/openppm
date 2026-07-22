import type { BudgetCategory, ProjectRole } from "@openppm/db";

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
}
