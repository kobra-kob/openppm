"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import {
  formatEuro,
  PORTFOLIO_MANAGER_ROLES,
  PortfolioFinanceSummaryRow,
  PortfolioView,
} from "@/features/portfolios/shared";

export default function PortfoliosPage() {
  const t = useTranslations("portfolios");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const canManage = user?.roles.some((role) => PORTFOLIO_MANAGER_ROLES.includes(role)) ?? false;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", budgetEnvelope: "" });
  const [error, setError] = useState<string | null>(null);

  const { data: portfolios } = useQuery({
    queryKey: ["portfolios"],
    queryFn: () => api<PortfolioView[]>("/portfolios"),
  });
  const { data: financeRows } = useQuery({
    queryKey: ["portfolios-finance"],
    queryFn: () => api<PortfolioFinanceSummaryRow[]>("/finance/portfolios"),
  });
  const financeByPortfolio = new Map((financeRows ?? []).map((row) => [row.portfolioId, row]));

  const createMutation = useMutation({
    mutationFn: () =>
      api<PortfolioView>("/portfolios", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          ...(form.description ? { description: form.description } : {}),
          ...(form.budgetEnvelope ? { budgetEnvelope: Number(form.budgetEnvelope) } : {}),
        }),
      }),
    onSuccess: (portfolio) => {
      void queryClient.invalidateQueries({ queryKey: ["portfolios"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolios-finance"] });
      router.push(`/portfolios/${portfolio.id}`);
    },
    onError: (caught) => {
      const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
      setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    createMutation.mutate();
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowForm((value) => !value)}>
            <Plus size={16} /> {t("new")}
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <form onSubmit={submit} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pfName">{t("form.name")}</Label>
                <Input
                  id="pfName"
                  required
                  minLength={2}
                  maxLength={140}
                  value={form.name}
                  onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="pfEnvelope">{t("form.envelope")}</Label>
                <Input
                  id="pfEnvelope"
                  type="number"
                  min={0}
                  step="1000"
                  value={form.budgetEnvelope}
                  onChange={(event) =>
                    setForm((c) => ({ ...c, budgetEnvelope: event.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="pfDescription">{t("form.description")}</Label>
              <textarea
                id="pfDescription"
                rows={2}
                maxLength={10000}
                value={form.description}
                onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
                className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {t("form.create")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                {t("form.cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {(portfolios ?? []).length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 p-10 text-muted">
            <Briefcase size={32} />
            <p className="text-sm">{t("empty")}</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(portfolios ?? []).map((portfolio) => {
            const fin = financeByPortfolio.get(portfolio.id);
            const envelope = fin?.budgetEnvelope ?? null;
            const actual = fin?.actualTotal ?? 0;
            const pct = fin?.envelopeConsumedPct ?? null;
            const over = envelope !== null && actual > envelope;
            return (
              <Link key={portfolio.id} href={`/portfolios/${portfolio.id}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <div className="mb-2 flex items-center gap-2">
                    <Wallet size={16} className="text-accent" />
                    <h2 className="min-w-0 flex-1 truncate font-medium">{portfolio.name}</h2>
                  </div>
                  <p className="text-xs text-muted">
                    {t("projectsCount", { count: portfolio.projectCount })}
                    {portfolio.owner && ` · ${portfolio.owner.name}`}
                  </p>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">{t("detail.actual")}</span>
                      <span className="font-medium tabular-nums">
                        {formatEuro(actual, locale)}
                        {envelope !== null && ` / ${formatEuro(envelope, locale)}`}
                      </span>
                    </div>
                    {pct !== null && (
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border-subtle">
                        <div
                          className={over ? "h-full bg-danger" : "h-full bg-accent"}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  {fin && (fin.quotesApprovedHT > 0 || (fin.approvedBudget ?? 0) > 0) && (
                    <p className="mt-2 flex justify-between text-[11px] text-muted">
                      <span>
                        {t("detail.approvedBudget")}:{" "}
                        {fin.approvedBudget !== null ? formatEuro(fin.approvedBudget, locale) : "—"}
                      </span>
                      <span>
                        {t("detail.quotesApproved")}: {formatEuro(fin.quotesApprovedHT, locale)}
                      </span>
                    </p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
