"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  FolderKanban,
  HeartPulse,
  Inbox,
  Layers,
  ListTodo,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ComponentType } from "react";
import { Card, cn } from "@/components/ui";
import { api } from "@/lib/api-client";

type ProjectStatus = "draft" | "active" | "on_hold" | "completed" | "archived";
type ProjectHealth = "green" | "amber" | "red";

interface TenantDashboard {
  activeProjects: number;
  totalProjects: number;
  completedProjects: number;
  completionRate: number;
  portfolios: number;
  totalDemands: number;
  pendingDemands: number;
  engagedBudget: number;
  consumedBudget: number;
  memberCount: number;
  openTasks: number;
  overdueTasks: number;
  overdueProjects: number;
  projectsAtRisk: number;
  objectivesRatio: number;
  projectsByStatus: Record<ProjectStatus, number>;
  projectsByHealth: Record<ProjectHealth, number>;
  deliveriesByQuarter: Array<{ key: string; year: number; quarter: number; count: number }>;
}

const STATUS_ORDER: ProjectStatus[] = ["active", "on_hold", "completed", "draft", "archived"];
const STATUS_DOT: Record<ProjectStatus, string> = {
  active: "bg-success",
  on_hold: "bg-[#ff9f0a]",
  completed: "bg-accent",
  draft: "bg-muted",
  archived: "bg-border-strong",
};
const HEALTH_ORDER: ProjectHealth[] = ["green", "amber", "red"];
const HEALTH_COLOR: Record<ProjectHealth, string> = {
  green: "bg-success",
  amber: "bg-[#ff9f0a]",
  red: "bg-danger",
};

function Tile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "danger";
}) {
  return (
    <Card className="p-5">
      <div
        className={cn(
          "mb-2 flex items-center gap-2 text-muted",
          tone === "danger" && "text-danger",
        )}
      >
        <Icon size={15} />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p
        className={cn(
          "text-3xl font-semibold tabular-nums tracking-tight",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

/** Tableau de bord global du tenant : KPI stratégiques, livraisons, santé, budget. */
export function TenantDashboard() {
  const t = useTranslations("dashboard");
  const tStatus = useTranslations("projects.status");
  const tHealth = useTranslations("projects.health");
  const locale = useLocale();

  const { data } = useQuery({
    queryKey: ["tenant-dashboard"],
    queryFn: () => api<TenantDashboard>("/dashboard"),
  });

  const money = (value: number, compact = false) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : 0,
    }).format(value);

  const d = data;
  const maxDelivery = Math.max(1, ...(d?.deliveriesByQuarter ?? []).map((q) => q.count));
  const ratio = d?.objectivesRatio ?? 0;
  const circumference = 2 * Math.PI * 52;
  const dash = (ratio / 100) * circumference;
  const budgetRatio =
    d && d.engagedBudget > 0 ? Math.min(100, Math.round((d.consumedBudget / d.engagedBudget) * 100)) : 0;
  const liveProjects = d ? d.projectsByHealth.green + d.projectsByHealth.amber + d.projectsByHealth.red : 0;

  return (
    <div className="w-full space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      {/* KPI principaux */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Tile
          icon={FolderKanban}
          label={t("activeProjects")}
          value={String(d?.activeProjects ?? 0)}
          hint={t("totalProjectsHint", { total: d?.totalProjects ?? 0 })}
        />
        <Tile
          icon={Inbox}
          label={t("demands")}
          value={String(d?.totalDemands ?? 0)}
          hint={t("pendingDemandsHint", { count: d?.pendingDemands ?? 0 })}
        />
        <Tile icon={Layers} label={t("portfolios")} value={String(d?.portfolios ?? 0)} />
        <Tile
          icon={Wallet}
          label={t("engagedBudget")}
          value={money(d?.engagedBudget ?? 0, true)}
        />
        <Tile
          icon={Target}
          label={t("completionRate")}
          value={`${d?.completionRate ?? 0}%`}
          hint={t("completedHint", { count: d?.completedProjects ?? 0 })}
        />
        <Tile icon={Users} label={t("members")} value={String(d?.memberCount ?? 0)} />
      </div>

      {/* Bandeau d'alertes */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile
          icon={AlertTriangle}
          label={t("projectsAtRisk")}
          value={String(d?.projectsAtRisk ?? 0)}
          tone={(d?.projectsAtRisk ?? 0) > 0 ? "danger" : undefined}
        />
        <Tile
          icon={CalendarClock}
          label={t("overdueProjects")}
          value={String(d?.overdueProjects ?? 0)}
          tone={(d?.overdueProjects ?? 0) > 0 ? "danger" : undefined}
        />
        <Tile
          icon={ListTodo}
          label={t("overdueTasks")}
          value={String(d?.overdueTasks ?? 0)}
          tone={(d?.overdueTasks ?? 0) > 0 ? "danger" : undefined}
        />
      </div>

      {/* Livraisons par trimestre + Objectifs atteints */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
            {t("deliveries")}
          </h2>
          <div className="flex h-52 items-end gap-3 sm:gap-4">
            {(d?.deliveriesByQuarter ?? []).map((q) => (
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
              <circle cx="70" cy="70" r="52" fill="none" stroke="var(--border-subtle)" strokeWidth="12" />
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

      {/* Répartition par statut + Santé des projets */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            {t("byStatus")}
          </h2>
          <ul className="space-y-2.5">
            {STATUS_ORDER.map((status) => {
              const count = d?.projectsByStatus[status] ?? 0;
              const total = d?.totalProjects ?? 0;
              const pct = total === 0 ? 0 : Math.round((count / total) * 100);
              return (
                <li key={status} className="flex items-center gap-3">
                  <span className={cn("size-2.5 shrink-0 rounded-full", STATUS_DOT[status])} />
                  <span className="w-24 shrink-0 text-sm">{tStatus(status)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-border-subtle">
                    <div className="h-full rounded-full bg-accent/70" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums">{count}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-muted">
            <HeartPulse size={15} />
            <h2 className="text-sm font-semibold uppercase tracking-wider">{t("health")}</h2>
          </div>
          {/* Barre segmentée : proportion green / amber / red des projets vivants */}
          <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-border-subtle">
            {HEALTH_ORDER.map((h) => {
              const count = d?.projectsByHealth[h] ?? 0;
              const pct = liveProjects === 0 ? 0 : (count / liveProjects) * 100;
              return <div key={h} className={cn("h-full", HEALTH_COLOR[h])} style={{ width: `${pct}%` }} />;
            })}
          </div>
          <ul className="space-y-2.5">
            {HEALTH_ORDER.map((h) => (
              <li key={h} className="flex items-center gap-3">
                <span className={cn("size-2.5 shrink-0 rounded-full", HEALTH_COLOR[h])} />
                <span className="flex-1 text-sm">{tHealth(h)}</span>
                <span className="text-sm font-medium tabular-nums">{d?.projectsByHealth[h] ?? 0}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Budget engagé vs consommé */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-muted">
          <Wallet size={15} />
          <h2 className="text-sm font-semibold uppercase tracking-wider">{t("budget")}</h2>
        </div>
        <div className="mb-2 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-muted">{t("budgetConsumed")}</p>
            <p className="text-xl font-semibold tabular-nums">{money(d?.consumedBudget ?? 0)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">{t("budgetEngaged")}</p>
            <p className="text-xl font-semibold tabular-nums">{money(d?.engagedBudget ?? 0)}</p>
          </div>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-border-subtle">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700",
              budgetRatio >= 100 ? "bg-danger" : "bg-gradient-to-r from-accent to-accent/70",
            )}
            style={{ width: `${budgetRatio}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">{t("budgetConsumptionHint", { ratio: budgetRatio })}</p>
      </Card>
    </div>
  );
}
