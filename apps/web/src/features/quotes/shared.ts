export type QuoteStatus = "draft" | "submitted" | "reviewed" | "approved" | "rejected";

export interface QuoteLineView {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  discountRate: number;
  lineTotalHT: number;
}

export interface QuoteView {
  id: string;
  reference: string;
  title: string;
  customerName: string | null;
  status: QuoteStatus;
  revision: number;
  vatRate: number;
  validUntil: string | null;
  notes: string | null;
  createdByName: string;
  submittedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  decisionComment: string | null;
  createdAt: string;
  totalHT: number;
  vatAmount: number;
  totalTTC: number;
  lineCount: number;
  lines: QuoteLineView[];
  can: { edit: boolean; submit: boolean; review: boolean; approve: boolean };
}

export const QUOTE_STATUS_BADGE: Record<QuoteStatus, string> = {
  draft: "bg-border-subtle text-muted",
  submitted: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  reviewed: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  approved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-red-500/15 text-red-600 dark:text-red-400",
};

/** Ordre d'avancement pour l'indicateur d'étapes. */
export const QUOTE_STEPS: QuoteStatus[] = ["draft", "submitted", "reviewed", "approved"];
