"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Copy,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { formatEuro } from "@/features/portfolios/shared";
import { QUOTE_STATUS_BADGE, QUOTE_STEPS, QuoteView } from "@/features/quotes/shared";

export default function QuoteDetailPage() {
  const params = useParams<{ id: string; quoteId: string }>();
  const projectId = params.id;
  const quoteId = params.quoteId;
  const t = useTranslations("quotes");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [line, setLine] = useState({ label: "", quantity: "1", unitPrice: "", discountRate: "0" });
  const [comment, setComment] = useState("");

  const { data: quote } = useQuery({
    queryKey: ["quote", quoteId],
    queryFn: () => api<QuoteView>(`/projects/${projectId}/quotes/${quoteId}`),
  });

  const onError = (err: unknown) => {
    if (err instanceof ApiError) {
      setError(tErrors.has(err.code) ? tErrors(err.code) : err.message);
    } else {
      setError(tErrors("UNKNOWN"));
    }
  };
  const onData = (fresh: QuoteView) => {
    setError(null);
    queryClient.setQueryData(["quote", quoteId], fresh);
    void queryClient.invalidateQueries({ queryKey: ["quotes", projectId] });
  };

  const base = `/projects/${projectId}/quotes/${quoteId}`;

  const addLine = useMutation({
    mutationFn: () =>
      api<QuoteView>(`${base}/lines`, {
        method: "POST",
        body: JSON.stringify({
          label: line.label,
          quantity: Number(line.quantity || 0),
          unitPrice: Number(line.unitPrice || 0),
          discountRate: Number(line.discountRate || 0),
        }),
      }),
    onSuccess: (fresh) => {
      onData(fresh);
      setLine({ label: "", quantity: "1", unitPrice: "", discountRate: "0" });
    },
    onError,
  });

  const deleteLine = useMutation({
    mutationFn: (lineId: string) =>
      api<QuoteView>(`${base}/lines/${lineId}`, { method: "DELETE" }),
    onSuccess: onData,
    onError,
  });

  const action = useMutation({
    mutationFn: (input: { path: string; body?: unknown }) =>
      api<QuoteView>(`${base}/${input.path}`, {
        method: "POST",
        body: input.body ? JSON.stringify(input.body) : undefined,
      }),
    onSuccess: (fresh) => {
      onData(fresh);
      setComment("");
    },
    onError,
  });

  const duplicate = useMutation({
    mutationFn: () => api<QuoteView>(`${base}/duplicate`, { method: "POST" }),
    onSuccess: (fresh) => {
      void queryClient.invalidateQueries({ queryKey: ["quotes", projectId] });
      router.push(`/projects/${projectId}/quotes/${fresh.id}`);
    },
    onError,
  });

  const removeQuote = useMutation({
    mutationFn: () => api<void>(base, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["quotes", projectId] });
      router.push(`/projects/${projectId}/quotes`);
    },
    onError,
  });

  if (!quote) {
    return null;
  }

  const money = (v: number) => formatEuro(v, locale);
  const stepIndex = QUOTE_STEPS.indexOf(quote.status === "rejected" ? "submitted" : quote.status);
  const isEditor = quote.can.edit;

  return (
    <div className="w-full max-w-4xl space-y-4">
      <Link
        href={`/projects/${projectId}/quotes`}
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} /> {t("back")}
      </Link>

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted">{quote.reference}</span>
              {quote.revision > 1 && (
                <span className="text-xs text-muted">{t("rev", { n: quote.revision })}</span>
              )}
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  QUOTE_STATUS_BADGE[quote.status],
                )}
              >
                {t(`status.${quote.status}`)}
              </span>
            </div>
            <h1 className="mt-1 text-xl font-semibold">{quote.title}</h1>
            {quote.customerName && <p className="text-sm text-muted">{quote.customerName}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted">{t("totalTTC")}</p>
            <p className="text-2xl font-semibold tabular-nums text-accent">{money(quote.totalTTC)}</p>
          </div>
        </div>

        {/* Indicateur d'étapes du workflow */}
        <div className="mt-4 flex items-center gap-1">
          {QUOTE_STEPS.map((step, index) => {
            const done = quote.status !== "rejected" && index <= stepIndex && stepIndex >= 0;
            const current = quote.status !== "rejected" && index === stepIndex;
            return (
              <div key={step} className="flex flex-1 items-center gap-1">
                <div
                  className={cn(
                    "flex h-6 flex-1 items-center justify-center rounded-full text-[11px] font-medium",
                    quote.status === "rejected" && index <= stepIndex
                      ? "bg-red-500/15 text-red-600 dark:text-red-400"
                      : done
                        ? "bg-accent/15 text-accent"
                        : "bg-border-subtle text-muted",
                    current && "ring-1 ring-accent",
                  )}
                >
                  {t(`step.${step}`)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Lignes du devis */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{t("lines.title")}</h2>
        {quote.lines.length === 0 ? (
          <p className="py-2 text-sm text-muted">{t("lines.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 font-medium">{t("lines.label")}</th>
                  <th className="py-2 text-right font-medium">{t("lines.qty")}</th>
                  <th className="py-2 text-right font-medium">{t("lines.unit")}</th>
                  <th className="py-2 text-right font-medium">{t("lines.discount")}</th>
                  <th className="py-2 text-right font-medium">{t("lines.total")}</th>
                  {isEditor && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {quote.lines.map((l) => (
                  <tr key={l.id} className="border-b border-border-subtle/60">
                    <td className="py-2">{l.label}</td>
                    <td className="py-2 text-right tabular-nums">{l.quantity}</td>
                    <td className="py-2 text-right tabular-nums">{money(l.unitPrice)}</td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {l.discountRate > 0 ? `${l.discountRate}%` : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">{money(l.lineTotalHT)}</td>
                    {isEditor && (
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          aria-label={t("lines.remove")}
                          className="text-muted transition-colors hover:text-danger"
                          onClick={() => deleteLine.mutate(l.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-sm">
                  <td colSpan={4} className="py-1.5 text-right text-muted">{t("totalHT")}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(quote.totalHT)}</td>
                  {isEditor && <td />}
                </tr>
                <tr className="text-sm">
                  <td colSpan={4} className="py-1.5 text-right text-muted">
                    {t("vat", { rate: quote.vatRate })}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{money(quote.vatAmount)}</td>
                  {isEditor && <td />}
                </tr>
                <tr className="font-semibold">
                  <td colSpan={4} className="py-1.5 text-right">{t("totalTTC")}</td>
                  <td className="py-1.5 text-right tabular-nums text-accent">{money(quote.totalTTC)}</td>
                  {isEditor && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {isEditor && (
          <form
            className="mt-3 flex flex-wrap items-end gap-2 border-t border-border-subtle pt-3"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              addLine.mutate();
            }}
          >
            <div className="min-w-40 flex-1">
              <Label htmlFor="label">{t("lines.label")}</Label>
              <Input
                id="label"
                value={line.label}
                onChange={(event) => setLine((c) => ({ ...c, label: event.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="qty">{t("lines.qty")}</Label>
              <Input
                id="qty"
                type="number"
                min={0}
                step="0.01"
                className="w-20"
                value={line.quantity}
                onChange={(event) => setLine((c) => ({ ...c, quantity: event.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="unit">{t("lines.unit")}</Label>
              <Input
                id="unit"
                type="number"
                min={0}
                step="0.01"
                className="w-28"
                value={line.unitPrice}
                onChange={(event) => setLine((c) => ({ ...c, unitPrice: event.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="disc">{t("lines.discount")}</Label>
              <Input
                id="disc"
                type="number"
                min={0}
                max={100}
                step="0.1"
                className="w-20"
                value={line.discountRate}
                onChange={(event) => setLine((c) => ({ ...c, discountRate: event.target.value }))}
              />
            </div>
            <Button type="submit" disabled={addLine.isPending}>
              <Plus size={15} /> {t("lines.add")}
            </Button>
          </form>
        )}
      </Card>

      {/* Actions de workflow */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{t("workflow.title")}</h2>

        <div className="space-y-1 text-sm">
          <Trace label={t("workflow.createdBy", { name: quote.createdByName })} on={quote.createdAt} locale={locale} />
          {quote.submittedAt && <Trace label={t("workflow.submitted")} on={quote.submittedAt} locale={locale} />}
          {quote.reviewedByName && (
            <Trace
              label={t("workflow.reviewedBy", { name: quote.reviewedByName })}
              on={quote.reviewedAt}
              locale={locale}
            />
          )}
          {quote.approvedByName && (
            <Trace
              label={t("workflow.approvedBy", { name: quote.approvedByName })}
              on={quote.approvedAt}
              locale={locale}
            />
          )}
        </div>

        {quote.decisionComment && (
          <p className="mt-2 rounded-(--radius-control) bg-border-subtle/50 px-3 py-2 text-sm italic text-muted">
            « {quote.decisionComment} »
          </p>
        )}

        {/* Zone de décision selon l'étape */}
        {(quote.can.review || quote.can.approve) && (
          <div className="mt-3 space-y-2 border-t border-border-subtle pt-3">
            <p className="text-sm font-medium">
              {quote.can.review ? t("workflow.reviewPrompt") : t("workflow.approvePrompt")}
            </p>
            <Input
              placeholder={t("workflow.commentPlaceholder")}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({
                    path: quote.can.review ? "review" : "approve",
                    body: { approve: true, comment: comment || undefined },
                  })
                }
              >
                <CheckCircle2 size={15} /> {t("workflow.approve")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({
                    path: quote.can.review ? "review" : "approve",
                    body: { approve: false, comment: comment || undefined },
                  })
                }
              >
                <Ban size={15} /> {t("workflow.reject")}
              </Button>
            </div>
          </div>
        )}

        {/* Actions éditeur */}
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border-subtle pt-3">
          {quote.can.submit && (
            <Button type="button" disabled={action.isPending} onClick={() => action.mutate({ path: "submit" })}>
              <Send size={15} /> {t("workflow.submit")}
            </Button>
          )}
          {isEditor && (
            <Button type="button" variant="ghost" onClick={() => removeQuote.mutate()}>
              <Trash2 size={15} /> {t("workflow.delete")}
            </Button>
          )}
          {(quote.status === "approved" || quote.status === "rejected") && (
            <Button type="button" variant="ghost" disabled={duplicate.isPending} onClick={() => duplicate.mutate()}>
              <Copy size={15} /> {t("workflow.revise")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Trace({ label, on, locale }: { label: string; on: string | null; locale: string }) {
  return (
    <p className="flex items-center justify-between text-muted">
      <span>{label}</span>
      {on && <span className="tabular-nums">{new Date(on).toLocaleString(locale)}</span>}
    </p>
  );
}
