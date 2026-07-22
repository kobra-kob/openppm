export interface PortfolioProject {
  id: string;
  code: string;
  name: string;
  status: string;
  health: string;
  budget: string | null;
}

export interface PortfolioView {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  owner: { id: string; name: string } | null;
  budgetEnvelope: string | null;
  allocatedBudget: number;
  committedBudget: number;
  projectCount: number;
  projects: PortfolioProject[];
  createdAt: string;
}

/** Consolidation financière d'un portefeuille (mêmes chiffres que les projets). */
export interface PortfolioFinanceView {
  portfolioId: string;
  name: string;
  budgetEnvelope: number | null;
  envelopeConsumedPct: number | null;
  projectCount: number;
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
  remaining: number | null;
  unallocated: number | null;
  quotes: {
    count: number;
    approvedCount: number;
    pendingCount: number;
    approvedTotalHT: number;
    approvedTotalTTC: number;
  };
  projects: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    approvedBudget: number | null;
    actualTotal: number;
    remaining: number | null;
    quotesApprovedHT: number;
  }>;
}

/** Rôles autorisés à gérer les portefeuilles. */
export const PORTFOLIO_MANAGER_ROLES = ["admin", "manager", "pmo"];

export function formatEuro(value: number, locale: string): string {
  return value.toLocaleString(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}
