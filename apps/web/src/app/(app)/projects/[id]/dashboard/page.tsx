"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Clock3, Gauge } from "lucide-react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Card, cn } from "@/components/ui";
import { api } from "@/lib/api-client";

type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";

interface DashboardView {
  totalTasks: number;
  statusCounts: Record<TaskStatus, number>;
  doneRatio: number;
  overdueCount: number;
  estimateHours: number;
  spentHours: number;
  memberCount: number;
  endDate: string | null;
  daysRemaining: number | null;
  upcoming: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    priority: number;
    dueDate: string;
    assignees: string[];
  }>;
}

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done", "cancelled"];

/** Histogramme monochrome : l'identité des barres est portée par les libellés. */
function StatusBarChart({ counts }: { counts: Record<TaskStatus, number> }) {
  const tTasks = useTranslations("tasks");
  const [hovered, setHovered] = useState<TaskStatus | null>(null);
  const max = Math.max(1, ...STATUS_ORDER.map((status) => counts[status]));
  const chartH = 140;
  const barW = 48;
  const gap = 40;
  const width = STATUS_ORDER.length * (barW + gap) + gap / 2;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${chartH + 44}`} role="img">
      {/* Ligne de base discrète */}
      <line
        x1={0}
        y1={chartH + 0.5}
        x2={width}
        y2={chartH + 0.5}
        stroke="var(--border-subtle)"
      />
      {STATUS_ORDER.map((status, index) => {
        const value = counts[status];
        const barH = Math.round((value / max) * (chartH - 24));
        const x = gap / 2 + index * (barW + gap);
        const y = chartH - barH;
        return (
          <g
            key={status}
            onMouseEnter={() => setHovered(status)}
            onMouseLeave={() => setHovered(null)}
          >
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(barH, 2)}
              rx={4}
              fill="var(--accent)"
              opacity={hovered === null || hovered === status ? 0.85 : 0.35}
            >
              <title>{`${tTasks(`status.${status}`)} : ${value}`}</title>
            </rect>
            {/* Valeur en ink, jamais dans la couleur de série */}
            <text
              x={x + barW / 2}
              y={y - 6}
              textAnchor="middle"
              fontSize={13}
              fontWeight={600}
              fill="var(--foreground)"
            >
              {value}
            </text>
            <text
              x={x + barW / 2}
              y={chartH + 18}
              textAnchor="middle"
              fontSize={11}
              fill="var(--muted)"
            >
              {tTasks(`status.${status}`)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ProjectDashboardPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const t = useTranslations("projectDashboard");
  const tTasks = useTranslations("tasks");
  const locale = useLocale();
  const [now] = useState(() => Date.now());

  const { data } = useQuery({
    queryKey: ["project-dashboard", projectId],
    queryFn: () => api<DashboardView>(`/projects/${projectId}/dashboard`),
  });

  if (!data) {
    return null;
  }

  const kpis = [
    {
      key: "progress",
      icon: Gauge,
      value: `${data.doneRatio}%`,
      hint: t("progressHint", {
        done: data.statusCounts.done,
        total: data.totalTasks,
      }),
      tone: "default" as const,
    },
    {
      key: "overdue",
      icon: AlertTriangle,
      value: String(data.overdueCount),
      hint: t("overdueHint"),
      tone: data.overdueCount > 0 ? ("danger" as const) : ("default" as const),
    },
    {
      key: "hours",
      icon: Clock3,
      value: `${data.spentHours} h`,
      hint: t("hoursHint", { spent: data.spentHours, estimate: data.estimateHours }),
      tone: "default" as const,
    },
    {
      key: "deadline",
      icon: CalendarClock,
      value: data.endDate
        ? new Date(data.endDate).toLocaleDateString(locale)
        : t("noDeadline"),
      hint:
        data.daysRemaining === null
          ? ""
          : data.daysRemaining >= 0
            ? t("daysRemaining", { count: data.daysRemaining })
            : t("daysOver", { count: Math.abs(data.daysRemaining) }),
      tone:
        data.daysRemaining !== null && data.daysRemaining < 0
          ? ("danger" as const)
          : ("default" as const),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Tuiles KPI */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ key, icon: Icon, value, hint, tone }) => (
          <Card key={key} className="p-4">
            <div className="mb-1 flex items-center gap-2 text-muted">
              <Icon size={14} />
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                {t(key as "progress")}
              </span>
            </div>
            <p
              className={cn(
                "text-2xl font-semibold tracking-tight",
                tone === "danger" && "text-danger",
              )}
            >
              {value}
            </p>
            {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            {t("byStatus")}
          </h2>
          <StatusBarChart counts={data.statusCounts} />
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            {t("upcoming")}
          </h2>
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-muted">{t("upcomingEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {data.upcoming.map((task) => {
                const overdue = new Date(task.dueDate).getTime() < now;
                return (
                  <li key={task.id} className="flex items-center gap-3 py-2.5">
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        task.priority <= 2 ? "text-danger" : "text-muted",
                      )}
                    >
                      P{task.priority}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                    <span className="hidden truncate text-xs text-muted sm:block">
                      {task.assignees.join(", ")}
                    </span>
                    <span className="rounded-full bg-border-subtle px-2 py-0.5 text-xs text-muted">
                      {tTasks(`status.${task.status}`)}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        overdue ? "text-danger" : "text-muted",
                      )}
                    >
                      {new Date(task.dueDate).toLocaleDateString(locale)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
