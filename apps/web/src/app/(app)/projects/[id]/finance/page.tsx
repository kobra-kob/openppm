"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, FileText, Landmark, PiggyBank, Plus, Trash2, TrendingDown, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { formatEuro } from "@/features/portfolios/shared";

type Category = "capex" | "opex";

interface FinanceView {
  approvedBudget: number | null;
  laborRate: number | null;
  canManage: boolean;
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
  budgetLines: Array<{
    id: string;
    category: Category;
    label: string;
    plannedAmount: number;
    committedCost: number;
  }>;
  costEntries: Array<{
    id: string;
    category: Category;
    label: string;
    amount: number;
    incurredOn: string;
    budgetLineId: string | null;
    createdByName: string;
  }>;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function FinancePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations("finance");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState("");
  const [lineForm, setLineForm] = useState({ category: "capex" as Category, label: "", plannedAmount: "" });
  const [costForm, setCostForm] = useState({
    category: "capex" as Category,
    label: "",
    amount: "",
    incurredOn: today(),
    budgetLineId: "",
  });

  const { data } = useQuery({
    queryKey: ["finance", id],
    queryFn: () => api<FinanceView>(`/projects/${id}/finance`),
  });

  const onError = (err: unknown) => {
    if (err instanceof ApiError) {
      setError(tErrors.has(err.code) ? tErrors(err.code) : err.message);
    } else {
      setError(tErrors("UNKNOWN"));
    }
  };
  const onSuccess = (fresh: FinanceView) => {
    setError(null);
    queryClient.setQueryData(["finance", id], fresh);
    void queryClient.invalidateQueries({ queryKey: ["project", id] });
  };

  const rateMutation = useMutation({
    mutationFn: (value: number | null) =>
      api<FinanceView>(`/projects/${id}/finance/labor-rate`, {
        method: "PUT",
        body: JSON.stringify({ laborRate: value }),
      }),
    onSuccess,
    onError,
  });

  const addLineMutation = useMutation({
    mutationFn: () =>
      api<FinanceView>(`/projects/${id}/finance/lines`, {
        method: "POST",
        body: JSON.stringify({
          category: lineForm.category,
          label: lineForm.label,
          plannedAmount: Number(lineForm.plannedAmount || 0),
        }),
      }),
    onSuccess: (fresh) => {
      onSuccess(fresh);
      setLineForm({ category: "capex", label: "", plannedAmount: "" });
    },
    onError,
  });

  const deleteLineMutation = useMutation({
    mutationFn: (lineId: string) =>
      api<FinanceView>(`/projects/${id}/finance/lines/${lineId}`, { method: "DELETE" }),
    onSuccess,
    onError,
  });

  const addCostMutation = useMutation({
    mutationFn: () =>
      api<FinanceView>(`/projects/${id}/finance/costs`, {
        method: "POST",
        body: JSON.stringify({
          category: costForm.category,
          label: costForm.label,
          amount: Number(costForm.amount || 0),
          incurredOn: costForm.incurredOn,
          budgetLineId: costForm.budgetLineId || undefined,
        }),
      }),
    onSuccess: (fresh) => {
      onSuccess(fresh);
      setCostForm({ category: "capex", label: "", amount: "", incurredOn: today(), budgetLineId: "" });
    },
    onError,
  });

  const deleteCostMutation = useMutation({
    mutationFn: (costId: string) =>
      api<FinanceView>(`/projects/${id}/finance/costs/${costId}`, { method: "DELETE" }),
    onSuccess,
    onError,
  });

  if (!data) {
    return null;
  }

  const manage = data.canManage;
  const money = (value: number) => formatEuro(value, locale);
  const consumption =
    data.approvedBudget && data.approvedBudget > 0
      ? Math.min(100, Math.round((data.actual.total / data.approvedBudget) * 100))
      : 0;
  const over = data.remaining !== null && data.remaining < 0;

  return (
    <div className="max-w-4xl space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      {data.approvedBudget === null && (
        <Alert tone="info">{t("noBudget")}</Alert>
      )}

      {/* KPIs de synthèse */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi icon={Wallet} label={t("kpi.approved")} value={data.approvedBudget !== null ? money(data.approvedBudget) : "—"} />
        <Kpi icon={Landmark} label={t("kpi.planned")} value={money(data.planned.total)} />
        <Kpi icon={TrendingDown} label={t("kpi.actual")} value={money(data.actual.total)} />
        <Kpi
          icon={PiggyBank}
          label={t("kpi.remaining")}
          value={data.remaining !== null ? money(data.remaining) : "—"}
          tone={over ? "danger" : "accent"}
        />
      </div>

      {/* Jauge de consommation */}
      {data.approvedBudget !== null && data.approvedBudget > 0 && (
        <Card>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-muted">{t("consumption")}</span>
            <span className={cn("font-medium tabular-nums", over && "text-danger")}>{consumption}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border-subtle">
            <div
              className={cn("bar-fill h-full rounded-full", over ? "bg-danger" : "bg-accent")}
              style={{ width: `${consumption}%` }}
            />
          </div>
          {over && <p className="mt-2 text-xs text-danger">{t("overBudget", { amount: money(Math.abs(data.remaining!)) })}</p>}
        </Card>
      )}

      {/* Coût de la main-d'œuvre */}
      <Card>
        <div className="mb-3 flex items-center gap-2 text-muted">
          <Clock3 size={16} />
          <h2 className="text-sm font-semibold uppercase tracking-wider">{t("labor.title")}</h2>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="text-sm">
            <p className="text-muted">{t("labor.hours")}</p>
            <p className="text-lg font-semibold tabular-nums">{data.actual.laborHours.toLocaleString(locale)} h</p>
          </div>
          <div className="text-sm">
            <p className="text-muted">{t("labor.cost")}</p>
            <p className="text-lg font-semibold tabular-nums text-accent">{money(data.actual.laborCost)}</p>
          </div>
          {manage && (
            <form
              className="ml-auto flex items-end gap-2"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                rateMutation.mutate(rate ? Number(rate) : null);
              }}
            >
              <div>
                <Label htmlFor="rate">{t("labor.rate")}</Label>
                <Input
                  id="rate"
                  type="number"
                  min={0}
                  step="0.01"
                  className="w-28"
                  placeholder={data.laborRate !== null ? String(data.laborRate) : "—"}
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                />
              </div>
              <Button type="submit" variant="ghost" disabled={rateMutation.isPending}>
                {t("labor.apply")}
              </Button>
            </form>
          )}
        </div>
      </Card>

      {/* Devis reliés à la finance */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted">
            <FileText size={16} />
            <h2 className="text-sm font-semibold uppercase tracking-wider">{t("quotes.title")}</h2>
          </div>
          <Link
            href={`/projects/${id}/quotes`}
            className="text-xs text-accent transition-colors hover:underline"
          >
            {t("quotes.link")}
          </Link>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <div className="text-sm">
            <p className="text-muted">{t("quotes.approvedHT")}</p>
            <p className="text-lg font-semibold tabular-nums text-accent">
              {money(data.quotes.approvedTotalHT)}
            </p>
          </div>
          <div className="text-sm">
            <p className="text-muted">{t("quotes.approvedTTC")}</p>
            <p className="text-lg font-semibold tabular-nums">{money(data.quotes.approvedTotalTTC)}</p>
          </div>
          <div className="text-sm">
            <p className="text-muted">{t("quotes.counts")}</p>
            <p className="text-lg font-semibold tabular-nums">
              {t("quotes.countsValue", {
                approved: data.quotes.approvedCount,
                pending: data.quotes.pendingCount,
              })}
            </p>
          </div>
        </div>
      </Card>

      {/* Répartition prévisionnelle (lignes de budget) */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{t("lines.title")}</h2>
          {data.unallocated !== null && (
            <span className="text-xs text-muted">
              {t("lines.unallocated")} <strong className="text-foreground">{money(data.unallocated)}</strong>
            </span>
          )}
        </div>
        {data.budgetLines.length === 0 ? (
          <p className="py-2 text-sm text-muted">{t("lines.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 font-medium">{t("category")}</th>
                  <th className="py-2 font-medium">{t("label")}</th>
                  <th className="py-2 text-right font-medium">{t("lines.planned")}</th>
                  <th className="py-2 text-right font-medium">{t("lines.committed")}</th>
                  {manage && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {data.budgetLines.map((line) => (
                  <tr key={line.id} className="border-b border-border-subtle/60">
                    <td className="py-2"><CategoryBadge category={line.category} t={t} /></td>
                    <td className="py-2">{line.label}</td>
                    <td className="py-2 text-right tabular-nums">{money(line.plannedAmount)}</td>
                    <td className="py-2 text-right tabular-nums text-muted">{money(line.committedCost)}</td>
                    {manage && (
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          aria-label={t("delete")}
                          className="text-muted transition-colors hover:text-danger"
                          onClick={() => deleteLineMutation.mutate(line.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {manage && (
          <form
            className="mt-3 flex flex-wrap items-end gap-2 border-t border-border-subtle pt-3"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              addLineMutation.mutate();
            }}
          >
            <CategorySelect
              value={lineForm.category}
              onChange={(category) => setLineForm((c) => ({ ...c, category }))}
              t={t}
            />
            <div className="flex-1">
              <Label htmlFor="lineLabel">{t("label")}</Label>
              <Input
                id="lineLabel"
                value={lineForm.label}
                onChange={(event) => setLineForm((c) => ({ ...c, label: event.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="linePlanned">{t("lines.planned")}</Label>
              <Input
                id="linePlanned"
                type="number"
                min={0}
                step="0.01"
                className="w-32"
                value={lineForm.plannedAmount}
                onChange={(event) => setLineForm((c) => ({ ...c, plannedAmount: event.target.value }))}
                required
              />
            </div>
            <Button type="submit" disabled={addLineMutation.isPending}>
              <Plus size={15} /> {t("lines.add")}
            </Button>
          </form>
        )}
      </Card>

      {/* Coûts réels */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{t("costs.title")}</h2>
        {data.costEntries.length === 0 ? (
          <p className="py-2 text-sm text-muted">{t("costs.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 font-medium">{t("costs.date")}</th>
                  <th className="py-2 font-medium">{t("category")}</th>
                  <th className="py-2 font-medium">{t("label")}</th>
                  <th className="py-2 text-right font-medium">{t("costs.amount")}</th>
                  {manage && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {data.costEntries.map((cost) => (
                  <tr key={cost.id} className="border-b border-border-subtle/60">
                    <td className="py-2 tabular-nums text-muted">
                      {new Date(cost.incurredOn).toLocaleDateString(locale)}
                    </td>
                    <td className="py-2"><CategoryBadge category={cost.category} t={t} /></td>
                    <td className="py-2">{cost.label}</td>
                    <td className="py-2 text-right tabular-nums">{money(cost.amount)}</td>
                    {manage && (
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          aria-label={t("delete")}
                          className="text-muted transition-colors hover:text-danger"
                          onClick={() => deleteCostMutation.mutate(cost.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {manage && (
          <form
            className="mt-3 flex flex-wrap items-end gap-2 border-t border-border-subtle pt-3"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              addCostMutation.mutate();
            }}
          >
            <div>
              <Label htmlFor="costDate">{t("costs.date")}</Label>
              <Input
                id="costDate"
                type="date"
                className="w-40"
                value={costForm.incurredOn}
                onChange={(event) => setCostForm((c) => ({ ...c, incurredOn: event.target.value }))}
                required
              />
            </div>
            <CategorySelect
              value={costForm.category}
              onChange={(category) => setCostForm((c) => ({ ...c, category }))}
              t={t}
            />
            <div className="flex-1">
              <Label htmlFor="costLabel">{t("label")}</Label>
              <Input
                id="costLabel"
                value={costForm.label}
                onChange={(event) => setCostForm((c) => ({ ...c, label: event.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="costLine">{t("costs.line")}</Label>
              <select
                id="costLine"
                value={costForm.budgetLineId}
                onChange={(event) => setCostForm((c) => ({ ...c, budgetLineId: event.target.value }))}
                className="h-9 rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 text-sm focus:border-accent focus:outline-none"
              >
                <option value="">{t("costs.noLine")}</option>
                {data.budgetLines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="costAmount">{t("costs.amount")}</Label>
              <Input
                id="costAmount"
                type="number"
                min={0}
                step="0.01"
                className="w-32"
                value={costForm.amount}
                onChange={(event) => setCostForm((c) => ({ ...c, amount: event.target.value }))}
                required
              />
            </div>
            <Button type="submit" disabled={addCostMutation.isPending}>
              <Plus size={15} /> {t("costs.add")}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone?: "accent" | "danger";
}) {
  return (
    <Card className="!p-3">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
        <Icon size={13} /> {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "danger" && "text-danger",
          tone === "accent" && "text-accent",
        )}
      >
        {value}
      </p>
    </Card>
  );
}

function CategoryBadge({ category, t }: { category: Category; t: (k: string) => string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        category === "capex"
          ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
          : "bg-teal-500/15 text-teal-600 dark:text-teal-400",
      )}
    >
      {t(`cat.${category}`)}
    </span>
  );
}

function CategorySelect({
  value,
  onChange,
  t,
}: {
  value: Category;
  onChange: (category: Category) => void;
  t: (k: string) => string;
}) {
  return (
    <div>
      <Label htmlFor="cat">{t("category")}</Label>
      <select
        id="cat"
        value={value}
        onChange={(event) => onChange(event.target.value as Category)}
        className="h-9 rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 text-sm focus:border-accent focus:outline-none"
      >
        <option value="capex">{t("cat.capex")}</option>
        <option value="opex">{t("cat.opex")}</option>
      </select>
    </div>
  );
}
