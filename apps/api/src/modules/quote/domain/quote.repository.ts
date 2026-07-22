import type { ProjectRole, QuoteStatus } from "@openppm/db";

export const QUOTE_REPOSITORY = Symbol("QUOTE_REPOSITORY");

export interface ProjectQuoteContext {
  id: string;
  managerId: string | null;
  members: Array<{ userId: string; role: ProjectRole }>;
}

export interface QuoteLineRecord {
  id: string;
  label: string;
  quantity: string;
  unitPrice: string;
  discountRate: string;
  position: number;
}

export interface QuoteRecord {
  id: string;
  projectId: string;
  reference: string;
  title: string;
  customerName: string | null;
  status: QuoteStatus;
  revision: number;
  vatRate: string;
  validUntil: Date | null;
  notes: string | null;
  createdById: string;
  createdByName: string;
  submittedAt: Date | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  decisionComment: string | null;
  createdAt: Date;
  lines: QuoteLineRecord[];
}

export interface CreateQuoteInput {
  organizationId: string;
  projectId: string;
  reference: string;
  title: string;
  customerName: string | null;
  vatRate: number;
  validUntil: Date | null;
  notes: string | null;
  revision: number;
  createdById: string;
}

export interface QuoteStatusPatch {
  status: QuoteStatus;
  submittedAt?: Date;
  reviewedById?: string | null;
  reviewedAt?: Date | null;
  approvedById?: string | null;
  approvedAt?: Date | null;
  decisionComment?: string | null;
}

export interface QuoteRepository {
  loadProjectContext(organizationId: string, projectId: string): Promise<ProjectQuoteContext | null>;
  countQuotes(organizationId: string): Promise<number>;

  list(projectId: string): Promise<QuoteRecord[]>;
  findById(organizationId: string, quoteId: string): Promise<QuoteRecord | null>;
  create(input: CreateQuoteInput): Promise<QuoteRecord>;
  updateHeader(
    quoteId: string,
    data: {
      title?: string;
      customerName?: string | null;
      vatRate?: number;
      validUntil?: Date | null;
      notes?: string | null;
    },
  ): Promise<QuoteRecord>;
  updateStatus(quoteId: string, patch: QuoteStatusPatch): Promise<QuoteRecord>;
  delete(quoteId: string): Promise<void>;

  addLine(
    quoteId: string,
    data: { label: string; quantity: number; unitPrice: number; discountRate: number; position: number },
  ): Promise<QuoteRecord>;
  updateLine(
    lineId: string,
    data: { label?: string; quantity?: number; unitPrice?: number; discountRate?: number },
  ): Promise<void>;
  findLine(quoteId: string, lineId: string): Promise<QuoteLineRecord | null>;
  deleteLine(lineId: string): Promise<void>;
  maxLinePosition(quoteId: string): Promise<number>;

  /** Copie l'en-tête et les lignes d'un devis dans un nouveau brouillon (révision). */
  duplicate(sourceQuoteId: string, input: CreateQuoteInput): Promise<QuoteRecord>;
}
