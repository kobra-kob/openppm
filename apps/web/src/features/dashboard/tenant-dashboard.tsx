"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FolderKanban, Inbox, ListTodo, Users, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, cn } from "@/components/ui";
import { api } from "@/lib/api-client";

type ProjectStatus = "draft" | "active" | "on_hold" | "completed" | "archived";

interface TenantDashboard {
  activeProjects: number;
  totalProjects: number;
  totalDemands: number;
  engagedBudget: number;
  memberCount: number;
  openTasks: number;
  overdueTasks: number;
  objectivesRatio: number;
  projectsByStatus: Record<ProjectStatus, number>;
  deliveriesByQuarter: Array<{ key: string; year: number; quarter: number; count: number }>;
}

const STATUS_ORDER: ProjectStatus[] = ["active", "on_hold", "completed", "draft", "archived"];
const STATUS_DOT: Record<ProjectStatus, string> = {
  active: "bg-success",
  on_hold: "bg-[#ff9f0a]",
  completed: "bg-accent",
  draft: "bg-muted",
  archived: "bg-border-subtle",
};

/** Tableau de bord global du tenant : KPI, livraisons trimestrielles, objectifs. */
export function TenantDashboard() {
  const t = useTranslations("dashboard");
  const tStatus = useTranslations("projects.status");
  const locale = useLocale();

  const { data } = useQuery({
    queryKey: ["tenant-dashboard"],
    queryFn: () => api<TenantDashboard>("/dashboard"),
  });

  const budget = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);

  const stats = data
    ? [
        { key: "activeProjects", icon: FolderKanban, value: String(data.activeProjects) },
        { key: "demands", icon: Inbox, value: String(data.totalDemands) },
        { key: "engagedBudget", icon: Wallet, value: budget(data.engagedBudget) },
        { key: "members", icon: Users, value: String(data.memberCount) },
      ]
    : [];

  const maxDelivery = Math.max(1, ...(data?.deliveriesByQuarter ?? []).map((q) => q.count));

  // Anneau d'objectifs : dasharray sur un cercle de rayon 52 (circonférence ~326.7).
  const ratio = data?.objectivesRatio ?? 0;
  const circumference = 2 * Math.PI * 52;
  const dash = (ratio / 100) * circumference;

  return (
    <div className="w-full space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      {/* KPI principaux */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ key, icon: Icon, value }) => (
          <Card key={key} className="p-5">
            <div className="mb-2 flex items-center gap-2 text-muted">
              <Icon size={15} />
              <span className="text-xs font-medium uppercase tracking-wider">{t(key)}</span>
            </div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
          </Card>
        ))}
      </div>

      {/* Livraisons par trimestre + Objectifs atteints */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
            {t("deliveries")}
          </h2>
          <div className="flex h-52 items-end gap-3 sm:gap-4">
            {(data?.deliveriesByQuarter ?? []).map((q) => (
              <div key={q.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium tabular-nums text-muted">{q.count}</span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-accent to-accent/60 transition-[height] duration-500"
                    style={{ height: `${Math.max(4, (q.count / maxDelivery) * 100)}%` }}
                  />
                </div>
                <span className="truncate text-[11px] text-muted">
                  T{q.quarter}&nbsp;{String(q.year).slice(2)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col items-center justify-center gap-3 p-5">
          <h2 className="self-start text-sm font-semibold uppercase tracking-wider text-muted">
            {t("objectives")}
          </h2>
          <div className="relative flex items-center justify-center py-2">
            <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
              <circle
                cx="70"
                cy="70"
                r="52"
                fill="none"
                stroke="var(--border-subtle)"
                strokeWidth="12"
              />
              <circle
                cx="70"
                cy="70"
                r="52"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference}`}
                className="transition-[stroke-dasharray] duration-700"
              />
            </svg>
            <span className="absolute text-2xl font-semibold tabular-nums">{ratio}%</span>
          </div>
        </Card>
      </div>

      {/* Secondaire : répartition des projets + charge des tâches */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            {t("byStatus")}
          </h2>
          <ul className="space-y-2.5">
            {STATUS_ORDER.map((status) => {
              const count = data?.projectsByStatus[status] ?? 0;
              const total = data?.totalProjects ?? 0;
              const pct = total === 0 ? 0 : Math.round((count / total) * 100);
              return (
                <li key={status} className="flex items-center gap-3">
                  <span className={cn("size-2.5 shrink-0 rounded-full", STATUS_DOT[status])} />
                  <span className="w-24 shrink-0 text-sm">{tStatus(status)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-border-subtle">
                    <div
                      className="h-full rounded-full bg-accent/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums">
                    {count}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <Card className="p-5">
            <div className="mb-2 flex items-center gap-2 text-muted">
              <ListTodo size={15} />
              <span className="text-xs font-medium uppercase tracking-wider">{t("openTasks")}</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{data?.openTasks ?? 0}</p>
          </Card>
          <Card className="p-5">
            <div className="mb-2 flex items-center gap-2 text-muted">
              <AlertTriangle size={15} className={cn((data?.overdueTasks ?? 0) > 0 && "text-danger")} />
              <span className="text-xs font-medium uppercase tracking-wider">
                {t("overdueTasks")}
              </span>
            </div>
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                (data?.overdueTasks ?? 0) > 0 && "text-danger",
              )}
            >
              {data?.overdueTasks ?? 0}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
