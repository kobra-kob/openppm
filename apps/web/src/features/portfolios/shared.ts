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

/** Rôles autorisés à gérer les portefeuilles. */
export const PORTFOLIO_MANAGER_ROLES = ["admin", "manager", "pmo"];

export function formatEuro(value: number, locale: string): string {
  return value.toLocaleString(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}
