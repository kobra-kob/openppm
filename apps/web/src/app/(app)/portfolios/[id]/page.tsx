"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  FolderKanban,
  Landmark,
  Inbox,
  PiggyBank,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { StatusBadge } from "@/features/projects/shared";
import {
  formatEuro,
  PORTFOLIO_MANAGER_ROLES,
  PortfolioFinanceView,
  PortfolioProject,
  PortfolioView,
} from "@/features/portfolios/shared";

export default function PortfolioDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations("portfolios");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const canManage = user?.roles.some((role) => PORTFOLIO_MANAGER_ROLES.includes(role)) ?? false;

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", budgetEnvelope: "" });
  const [attachId, setAttachId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: portfolio } = useQuery({
    queryKey: ["portfolio", id],
    queryFn: () => api<PortfolioView>(`/portfolios/${id}`),
  });
  const { data: unassigned } = useQuery({
    queryKey: ["portfolios-unassigned"],
    queryFn: () => api<PortfolioProject[]>("/portfolios/unassigned-projects"),
    enabled: canManage,
  });
  const { data: finance } = useQuery({
    queryKey: ["portfolio-finance", id],
    queryFn: () => api<PortfolioFinanceView>(`/portfolios/${id}/finance`),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["portfolio", id] });
    void queryClient.invalidateQueries({ queryKey: ["portfolio-finance", id] });
    void queryClient.invalidateQueries({ queryKey: ["portfolios"] });
    void queryClient.invalidateQueries({ queryKey: ["portfolios-unassigned"] });
  };

  const onError = (caught: unknown) => {
    const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
    setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
  };

  const updateMutation = useMutation({
    mutationFn: () =>
      api<PortfolioView>(`/portfolios/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description || null,
          budgetEnvelope: editForm.budgetEnvelope ? Number(editForm.budgetEnvelope) : null,
        }),
      }),
    onSuccess: () => {
      setEditing(false);
      refresh();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api<void>(`/portfolios/${id}`, { method: "DELETE" }),
    onSuccess: () => router.push("/portfolios"),
    onError,
  });

  const attachMutation = useMutation({
    mutationFn: (projectId: string) =>
      api<PortfolioView>(`/portfolios/${id}/projects`, {
        method: "POST",
        body: JSON.stringify({ projectId }),
      }),
    onSuccess: () => {
      setAttachId("");
      refresh();
    },
    onError,
  });

  const detachMutation = useMutation({
    mutationFn: (projectId: string) =>
      api<PortfolioView>(`/portfolios/${id}/projects/${projectId}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError,
  });

  if (!portfolio) {
    return null;
  }

  const envelopeOver =
    !!finance && finance.budgetEnvelope !== null && finance.actual.total > finance.budgetEnvelope;

  const startEditing = () => {
    setEditForm({
      name: portfolio.name,
      description: portfolio.description ?? "",
      budgetEnvelope: portfolio.budgetEnvelope ? String(Number(portfolio.budgetEnvelope)) : "",
    });
    setEditing(true);
    setError(null);
  };

  const submitEdit = (event: FormEvent) => {
    event.preventDefault();
    updateMutation.mutate();
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-6">
      <Link
        href="/portfolios"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> {t("backToList")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Wallet size={20} className="text-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">{portfolio.name}</h1>
          <span className="rounded-full bg-border-subtle px-2.5 py-0.5 text-xs text-muted">
            {t(`status.${portfolio.status}`)}
          </span>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={startEditing}>
              {t("form.edit")}
            </Button>
            <Button variant="danger" onClick={() => deleteMutation.mutate()}>
              <Trash2 size={16} /> {t("form.delete")}
            </Button>
          </div>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {editing && (
        <Card>
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="eName">{t("form.name")}</Label>
                <Input
                  id="eName"
                  required
                  minLength={2}
                  maxLength={140}
                  value={editForm.name}
                  onChange={(event) => setEditForm((c) => ({ ...c, name: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="eEnvelope">{t("form.envelope")}</Label>
                <Input
                  id="eEnvelope"
                  type="number"
                  min={0}
                  step="1000"
                  value={editForm.budgetEnvelope}
                  onChange={(event) =>
                    setEditForm((c) => ({ ...c, budgetEnvelope: event.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="eDescription">{t("form.description")}</Label>
              <textarea
                id="eDescription"
                rows={2}
                maxLength={10000}
                value={editForm.description}
                onChange={(event) =>
                  setEditForm((c) => ({ ...c, description: event.target.value }))
                }
                className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={updateMutation.isPending}>
                {t("form.save")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                {t("form.cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Consolidation financière — mêmes chiffres que les fiches projet, agrégés */}
      {finance && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              {t("detail.consolidation")}
            </h2>
            {finance.envelopeConsumedPct !== null && (
              <span className={cn("text-xs font-medium tabular-nums", envelopeOver && "text-danger")}>
                {finance.envelopeConsumedPct}% {t("detail.ofEnvelope")}
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <Kpi
              icon={Wallet}
              label={t("envelope")}
              value={finance.budgetEnvelope !== null ? formatEuro(finance.budgetEnvelope, locale) : t("noEnvelope")}
            />
            <Kpi
              icon={Landmark}
              label={t("detail.approvedBudget")}
              value={finance.approvedBudget !== null ? formatEuro(finance.approvedBudget, locale) : "—"}
            />
            <Kpi icon={Landmark} label={t("detail.planned")} value={formatEuro(finance.planned.total, locale)} />
            <Kpi icon={TrendingDown} label={t("detail.actual")} value={formatEuro(finance.actual.total, locale)} />
            <Kpi
              icon={PiggyBank}
              label={t("remaining")}
              value={finance.remaining !== null ? formatEuro(finance.remaining, locale) : "—"}
              danger={finance.remaining !== null && finance.remaining < 0}
            />
            <Kpi
              icon={FileText}
              label={t("detail.quotesApproved")}
              value={formatEuro(finance.quotes.approvedTotalHT, locale)}
            />
            <Kpi
              icon={TrendingUp}
              label={t("detail.pipeline")}
              value={formatEuro(finance.pipeline, locale)}
            />
          </div>

          {finance.envelopeConsumedPct !== null && (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-border-subtle">
              <div
                className={cn("bar-fill h-full", envelopeOver ? "bg-danger" : "bg-accent")}
                style={{ width: `${Math.min(100, finance.envelopeConsumedPct)}%` }}
              />
            </div>
          )}

          {/* Ventilation par projet — se recoupe avec la fiche Finances de chaque projet */}
          {finance.projects.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-muted">
                    <th className="py-2 font-medium">{t("detail.project")}</th>
                    <th className="py-2 text-right font-medium">{t("detail.approvedBudget")}</th>
                    <th className="py-2 text-right font-medium">{t("detail.actual")}</th>
                    <th className="py-2 text-right font-medium">{t("remaining")}</th>
                    <th className="py-2 text-right font-medium">{t("detail.quotesApproved")}</th>
                  </tr>
                </thead>
                <tbody>
                  {finance.projects.map((project) => (
                    <tr key={project.id} className="border-b border-border-subtle/60">
                      <td className="py-2">
                        <Link href={`/projects/${project.id}/finance`} className="hover:underline">
                          <span className="font-mono text-xs text-muted">{project.code}</span>{" "}
                          {project.name}
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {project.approvedBudget !== null ? formatEuro(project.approvedBudget, locale) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatEuro(project.actualTotal, locale)}</td>
                      <td
                        className={cn(
                          "py-2 text-right tabular-nums",
                          project.remaining !== null && project.remaining < 0 && "text-danger",
                        )}
                      >
                        {project.remaining !== null ? formatEuro(project.remaining, locale) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted">
                        {formatEuro(project.quotesApprovedHT, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Projets rattachés */}
      <Card>
        <div className="mb-3 flex items-center gap-2 text-muted">
          <FolderKanban size={16} />
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            {t("detail.projectsTitle")}
          </h2>
        </div>
        {portfolio.projects.length === 0 ? (
          <p className="text-sm text-muted">{t("detail.noProjects")}</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {portfolio.projects.map((project) => (
              <li key={project.id} className="flex items-center gap-3 py-2.5">
                <Link
                  href={`/projects/${project.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 hover:underline"
                >
                  <span className="w-20 shrink-0 font-mono text-xs text-muted">{project.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{project.name}</span>
                </Link>
                <StatusBadge status={project.status as never} />
                <span className="w-28 text-right text-sm font-medium">
                  {project.budget ? formatEuro(Number(project.budget), locale) : "—"}
                </span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => detachMutation.mutate(project.id)}
                    aria-label={t("detail.detach")}
                    className="rounded-full p-1.5 text-muted transition-colors hover:bg-border-subtle hover:text-danger"
                  >
                    <X size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <div className="mt-4 flex items-center gap-2 border-t border-border-subtle pt-3">
            <select
              value={attachId}
              onChange={(event) => setAttachId(event.target.value)}
              className="min-w-0 flex-1 rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">
                {(unassigned ?? []).length === 0
                  ? t("detail.noUnassigned")
                  : t("detail.attachHint")}
              </option>
              {(unassigned ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} — {project.name}
                </option>
              ))}
            </select>
            <Button
              onClick={() => attachId && attachMutation.mutate(attachId)}
              disabled={!attachId || attachMutation.isPending}
            >
              {t("detail.attach")}
            </Button>
          </div>
        )}
      </Card>

      {/* Demandes rattachées (pipeline avant projet) */}
      {portfolio.demands.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted">
              <Inbox size={16} />
              <h2 className="text-sm font-semibold uppercase tracking-wider">
                {t("detail.demandsTitle")}
              </h2>
            </div>
            <span className="text-xs text-muted">
              {t("detail.pipeline")} : {formatEuro(portfolio.pipelineBudget, locale)}
            </span>
          </div>
          <ul className="divide-y divide-border-subtle">
            {portfolio.demands.map((demand) => (
              <li key={demand.id} className="flex items-center gap-3 py-2.5">
                <Link
                  href={`/demands/${demand.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 hover:underline"
                >
                  <span className="w-24 shrink-0 font-mono text-xs text-muted">
                    {demand.reference}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{demand.title}</span>
                </Link>
                {demand.projectId ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {t("detail.demandConverted")}
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    {t("detail.demandPipeline")}
                  </span>
                )}
                <span className="w-28 text-right text-sm font-medium tabular-nums">
                  {demand.estimatedBudget ? formatEuro(Number(demand.estimatedBudget), locale) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  danger,
  icon: Icon,
}: {
  label: string;
  value: string;
  danger?: boolean;
  icon?: typeof Wallet;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {Icon && <Icon size={12} />} {label}
      </p>
      <p className={cn("mt-0.5 text-lg font-semibold tracking-tight tabular-nums", danger && "text-danger")}>
        {value}
      </p>
    </div>
  );
}
