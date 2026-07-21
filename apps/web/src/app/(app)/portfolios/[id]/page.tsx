"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FolderKanban, Trash2, Wallet, X } from "lucide-react";
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

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["portfolio", id] });
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

  const envelope = portfolio.budgetEnvelope ? Number(portfolio.budgetEnvelope) : null;
  const remaining = envelope !== null ? envelope - portfolio.committedBudget : null;
  const pct =
    envelope && envelope > 0
      ? Math.min(100, Math.round((portfolio.committedBudget / envelope) * 100))
      : null;
  const over = envelope !== null && portfolio.committedBudget > envelope;

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

      {/* Consommation de l'enveloppe */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            {t("detail.consumption")}
          </h2>
          {over && (
            <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
              {t("detail.overCommitted")}
            </span>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Kpi label={t("envelope")} value={envelope !== null ? formatEuro(envelope, locale) : t("noEnvelope")} />
          <Kpi label={t("allocated")} value={formatEuro(portfolio.allocatedBudget, locale)} />
          <Kpi label={t("committed")} value={formatEuro(portfolio.committedBudget, locale)} />
          <Kpi
            label={t("remaining")}
            value={remaining !== null ? formatEuro(remaining, locale) : "—"}
            danger={remaining !== null && remaining < 0}
          />
        </div>
        {pct !== null && (
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-border-subtle">
            <div className={over ? "h-full bg-danger" : "h-full bg-accent"} style={{ width: `${pct}%` }} />
          </div>
        )}
      </Card>

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
    </div>
  );
}

function Kpi({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className={cn("mt-0.5 text-lg font-semibold tracking-tight", danger && "text-danger")}>
        {value}
      </p>
    </div>
  );
}
