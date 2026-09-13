import type { DemandUrgency } from "@openppm/db";

export const DEMAND_REPOSITORY = Symbol("DEMAND_REPOSITORY");

export interface DemandRecord {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  objectives: string | null;
  justification: string | null;
  requesterId: string;
  requesterName: string;
  department: string | null;
  priority: number;
  urgency: DemandUrgency;
  estimatedBudget: string | null;
  estimatedDurationDays: number | null;
  targetPortfolio: { id: string; name: string } | null;
  tags: string[];
  /** Projet issu de la conversion (traçabilité), sinon null. */
  project: { id: string; code: string } | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateDemandInput {
  organizationId: string;
  reference: string;
  title: string;
  description: string | null;
  objectives: string | null;
  justification: string | null;
  requesterId: string;
  department: string | null;
  priority: number;
  urgency: DemandUrgency;
  estimatedBudget: number | null;
  estimatedDurationDays: number | null;
  targetPortfolioId: string | null;
  tags: string[];
}

export interface UpdateDemandInput {
  title?: string;
  description?: string | null;
  objectives?: string | null;
  justification?: string | null;
  department?: string | null;
  priority?: number;
  urgency?: DemandUrgency;
  estimatedBudget?: number | null;
  estimatedDurationDays?: number | null;
  targetPortfolioId?: string | null;
  /** Remplace intégralement les étiquettes lorsqu'il est fourni. */
  tags?: string[];
}

export interface DemandListFilters {
  organizationId: string;
  /** Restreint aux demandes émises par cet utilisateur. */
  requesterId?: string;
  targetPortfolioId?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface DemandSummary {
  id: string;
  reference: string;
  title: string;
  requesterId: string;
  estimatedBudget: number | null;
}

export interface DemandRepository {
  list(filters: DemandListFilters): Promise<{ items: DemandRecord[]; total: number }>;
  findById(organizationId: string, id: string): Promise<DemandRecord | null>;
  /** Résumés des demandes actives correspondant aux identifiants (files de validation). */
  findSummariesByIds(organizationId: string, ids: string[]): Promise<DemandSummary[]>;
  create(input: CreateDemandInput): Promise<DemandRecord>;
  update(id: string, input: UpdateDemandInput): Promise<DemandRecord>;
  softDelete(id: string): Promise<void>;

  isReferenceTaken(organizationId: string, reference: string): Promise<boolean>;
  /** Plus grand numéro de séquence déjà attribué (références DEMDxxxxx). */
  maxReferenceSequence(organizationId: string): Promise<number>;
  portfolioExists(organizationId: string, portfolioId: string): Promise<boolean>;
}
