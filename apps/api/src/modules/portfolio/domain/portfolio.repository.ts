import type { Portfolio, PortfolioStatus, ProjectStatus } from "@openppm/db";

export interface PortfolioProjectSummary {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  health: string;
  budget: string | null;
}

/** Demande rattachée à un portefeuille (pipeline avant projet). */
export interface PortfolioDemandSummary {
  id: string;
  reference: string;
  title: string;
  estimatedBudget: string | null;
  /** Projet issu de la conversion, sinon null (demande encore au pipeline). */
  projectId: string | null;
}

export type PortfolioWithProjects = Portfolio & {
  owner: { id: string; firstName: string; lastName: string } | null;
  projects: PortfolioProjectSummary[];
  demands: PortfolioDemandSummary[];
};

export interface CreatePortfolioInput {
  organizationId: string;
  name: string;
  description?: string;
  ownerId?: string;
  budgetEnvelope?: number;
  createdById: string;
}

export interface UpdatePortfolioInput {
  name?: string;
  description?: string | null;
  ownerId?: string | null;
  budgetEnvelope?: number | null;
  status?: PortfolioStatus;
}

export interface PortfolioRepository {
  list(organizationId: string): Promise<PortfolioWithProjects[]>;
  findById(organizationId: string, id: string): Promise<PortfolioWithProjects | null>;
  create(input: CreatePortfolioInput): Promise<PortfolioWithProjects>;
  update(id: string, input: UpdatePortfolioInput): Promise<PortfolioWithProjects>;
  softDelete(id: string): Promise<void>;

  userInOrganization(organizationId: string, userId: string): Promise<boolean>;
  /** Vérifie qu'un projet existe dans l'org (non supprimé). */
  projectExists(organizationId: string, projectId: string): Promise<boolean>;
  attachProject(portfolioId: string, projectId: string): Promise<void>;
  detachProject(organizationId: string, projectId: string): Promise<void>;
  /** Projets de l'org sans portefeuille (pour le rattachement). */
  listUnassignedProjects(organizationId: string): Promise<PortfolioProjectSummary[]>;
}

export const PORTFOLIO_REPOSITORY = Symbol("PORTFOLIO_REPOSITORY");
