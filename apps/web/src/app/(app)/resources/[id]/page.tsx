"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, Coins, Timer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { formatEuro } from "@/features/portfolios/shared";
import {
  canManageResources,
  formatRate,
  type RateUnit,
  type ResourceDetailView,
} from "@/features/resources/shared";

export default function ResourceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations("resources");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.user?.roles);
  const canManage = canManageResources(roles);

  const [error, setError] = useState<string | null>(null);
  const [rateForm, setRateForm] = useState({ amount: "", unit: "DAY" as RateUnit });

  const { data } = useQuery({
    queryKey: ["resource", id],
    queryFn: () => api<ResourceDetailView>(`/resources/${id}`),
  });

  const onError = (caught: unknown) => {
    const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
    setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
  };
  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["resource", id] });
    void queryClient.invalidateQueries({ queryKey: ["resources"] });
  };

  const setRate = useMutation({
    mutationFn: () =>
      api(`/resources/${id}/rate`, {
        method: "PUT",
        body: JSON.stringify({ amount: Number(rateForm.amount), unit: rateForm.unit, currency: "EUR" }),
      }),
    onSuccess: () => {
      invalidate();
      setRateForm({ amount: "", unit: "DAY" });
    },
    onError,
  });

  const archive = useMutation({
    mutationFn: () => api(`/resources/${id}/archive`, { method: "POST" }),
    onSuccess: invalidate,
    onError,
  });

  if (!data) {
    return null;
  }

  const money = (value: number) => formatEuro(value, locale);
  const unitLabels = { HOUR: t("unit.HOUR"), DAY: t("unit.DAY") };
  const resource = data.resource;
  const titleById = new Map(data.assignments.map((a) => [a.taskId, a.taskTitle]));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6 lg:p-8">
      <Link href="/resources" className="text-sm text-muted transition-colors hover:text-foreground">
        {t("backToList")}
      </Link>

      {error && <Alert tone="error">{error}</Alert>}

      {/* En-tête ressource */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{resource.name}</h1>
        <span className="rounded-full bg-border-subtle/70 px-2 py-0.5 text-xs text-muted">
          {t(`types.${resource.resourceType}`)}
        </span>
        {!resource.active && (
          <span className="rounded-full bg-border-subtle/70 px-2 py-0.5 text-xs text-muted">
            {t("archived")}
          </span>
        )}
        {canManage && resource.active && (
          <Button
            variant="ghost"
            className="ml-auto text-xs"
            onClick={() => {
              if (window.confirm(t("confirmArchive"))) archive.mutate();
            }}
          >
            <Archive size={14} /> {t("archive")}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted">
        {[resource.jobTitle, resource.company, resource.email, resource.phone]
          .filter(Boolean)
          .join(" · ") || "—"}
      </p>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi icon={Coins} label={t("totalCost")} value={money(data.totalCost)} accent />
        <Kpi icon={Timer} label={t("totalDays")} value={data.totalAllocatedDays.toLocaleString(locale)} />
        <Kpi
          icon={Coins}
          label={t("rate")}
          value={formatRate(resource.rate, locale, unitLabels)}
        />
      </div>

      {/* Tarif (gestion) */}
      {canManage && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{t("setRate")}</h2>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (rateForm.amount) setRate.mutate();
            }}
          >
            <div>
              <Label htmlFor="amount">{t("rateAmount")}</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                step="0.01"
                className="w-32"
                placeholder={resource.rate ? String(resource.rate.amount) : "—"}
                value={rateForm.amount}
                onChange={(event) => setRateForm((c) => ({ ...c, amount: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="unit">{t("rateUnit")}</Label>
              <select
                id="unit"
                value={rateForm.unit}
                onChange={(event) => setRateForm((c) => ({ ...c, unit: event.target.value as RateUnit }))}
                className="h-9 rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 text-sm focus:border-accent focus:outline-none"
              >
                <option value="DAY">{t("unitLong.DAY")}</option>
                <option value="HOUR">{t("unitLong.HOUR")}</option>
              </select>
            </div>
            <Button type="submit" disabled={setRate.isPending}>
              {t("save")}
            </Button>
          </form>
        </Card>
      )}

      {/* Surcharge */}
      {data.overallocations.length > 0 && (
        <Alert tone="warning">
          <span className="flex items-center gap-2 font-medium">
            <AlertTriangle size={15} /> {t("overallocation")}
          </span>
          <p className="mt-1 text-sm">{t("overallocationHint")}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {data.overallocations.map(([a, b], index) => (
              <li key={index}>
                {titleById.get(a) ?? a} ↔ {titleById.get(b) ?? b}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Charge par projet */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{t("workload")}</h2>
        {data.workloadByProject.length === 0 ? (
          <p className="py-2 text-sm text-muted">{t("noAssignments")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 font-medium">{t("project")}</th>
                  <th className="py-2 text-right font-medium">{t("allocation")}</th>
                  <th className="py-2 text-right font-medium">{t("cost")}</th>
                </tr>
              </thead>
              <tbody>
                {data.workloadByProject.map((row) => (
                  <tr key={row.projectId} className="border-b border-border-subtle/60">
                    <td className="py-2">
                      <Link
                        href={`/projects/${row.projectId}/resources`}
                        className="text-accent transition-colors hover:underline"
                      >
                        {row.projectName}
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {t("allocationDays", { days: row.allocationDays })}
                    </td>
                    <td className="py-2 text-right tabular-nums">{money(row.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Affectations détaillées */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{t("assignments")}</h2>
        {data.assignments.length === 0 ? (
          <p className="py-2 text-sm text-muted">{t("noAssignments")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 font-medium">{t("task")}</th>
                  <th className="py-2 font-medium">{t("project")}</th>
                  <th className="py-2 font-medium">{t("period")}</th>
                  <th className="py-2 text-right font-medium">{t("duration")}</th>
                  <th className="py-2 text-right font-medium">{t("cost")}</th>
                </tr>
              </thead>
              <tbody>
                {data.assignments.map((row) => (
                  <tr key={row.taskId} className="border-b border-border-subtle/60">
                    <td className="py-2">{row.taskTitle}</td>
                    <td className="py-2 text-muted">{row.projectName}</td>
                    <td className="py-2 text-muted">
                      {row.startDate && row.dueDate
                        ? `${new Date(row.startDate).toLocaleDateString(locale)} → ${new Date(row.dueDate).toLocaleDateString(locale)}`
                        : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {t("allocationDays", { days: row.durationDays })}
                    </td>
                    <td className="py-2 text-right tabular-nums">{money(row.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className="!p-3">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
        <Icon size={13} /> {label}
      </p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${accent ? "text-accent" : ""}`}>
        {value}
      </p>
    </Card>
  );
}
