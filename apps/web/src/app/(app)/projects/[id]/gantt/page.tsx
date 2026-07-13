"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { ORG_WIDE_ROLES, ProjectView } from "@/features/projects/shared";

type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
type Zoom = "day" | "week" | "month";

interface GanttTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: number;
  parentId: string | null;
  startDate: string | null;
  dueDate: string | null;
}

interface GanttData {
  tasks: GanttTask[];
  dependencies: Array<{ predecessorId: string; successorId: string }>;
  criticalPath: string[];
}

const DAY_MS = 86_400_000;
const PX: Record<Zoom, number> = { day: 28, week: 12, month: 4 };
const ROW_H = 34;
const HEADER_H = 40;
const LABEL_W = 240;

const dayIndex = (iso: string, rangeStart: number) =>
  Math.round((new Date(iso).getTime() - rangeStart) / DAY_MS);

export default function GanttPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const t = useTranslations("gantt");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  const [zoom, setZoom] = useState<Zoom>("week");
  const [now] = useState(() => Date.now());
  const [drag, setDrag] = useState<{
    taskId: string;
    mode: "move" | "resize";
    startX: number;
    deltaDays: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["gantt", projectId],
    queryFn: () => api<GanttData>(`/projects/${projectId}/tasks/gantt`),
  });
  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api<ProjectView>(`/projects/${projectId}`),
  });

  const canWork =
    (currentUser?.roles.some((role) => ORG_WIDE_ROLES.includes(role)) ?? false) ||
    (project?.members.some(
      (member) => member.userId === currentUser?.id && member.role !== "observer",
    ) ??
      false);

  const moveMutation = useMutation({
    mutationFn: (input: { taskId: string; startDate: string; dueDate: string }) =>
      api(`/projects/${projectId}/tasks/${input.taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ startDate: input.startDate, dueDate: input.dueDate }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gantt", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });

  // Ordre d'affichage hiérarchique (racines puis enfants, récursif)
  const ordered = useMemo(() => {
    if (!data) return [] as Array<GanttTask & { depth: number }>;
    const children = new Map<string | null, GanttTask[]>();
    for (const task of data.tasks) {
      const key = task.parentId;
      const list = children.get(key) ?? [];
      list.push(task);
      children.set(key, list);
    }
    const result: Array<GanttTask & { depth: number }> = [];
    const visit = (parentId: string | null, depth: number) => {
      for (const task of children.get(parentId) ?? []) {
        result.push({ ...task, depth });
        visit(task.id, depth + 1);
      }
    };
    visit(null, 0);
    return result;
  }, [data]);

  const dated = ordered.filter((task) => task.startDate && task.dueDate);
  const critical = useMemo(() => new Set(data?.criticalPath ?? []), [data]);

  // Plage temporelle : min(début) − 3 j → max(fin) + 7 j
  const rangeStart = useMemo(() => {
    if (dated.length === 0) return now;
    const min = Math.min(...dated.map((task) => new Date(task.startDate!).getTime()));
    return min - 3 * DAY_MS;
  }, [dated, now]);
  const totalDays = useMemo(() => {
    if (dated.length === 0) return 30;
    const max = Math.max(...dated.map((task) => new Date(task.dueDate!).getTime()));
    return Math.round((max - rangeStart) / DAY_MS) + 8;
  }, [dated, rangeStart]);

  const px = PX[zoom];
  const chartW = totalDays * px;
  const chartH = ordered.length * ROW_H;

  // Drag global : suivre la souris hors du SVG
  useEffect(() => {
    if (!drag) return;
    const onMove = (event: MouseEvent) => {
      const deltaDays = Math.round((event.clientX - drag.startX) / px);
      setDrag((current) => (current ? { ...current, deltaDays } : null));
    };
    const onUp = () => {
      const task = data?.tasks.find((entry) => entry.id === drag.taskId);
      if (task?.startDate && task.dueDate && drag.deltaDays !== 0) {
        const shift = (iso: string, days: number) =>
          new Date(new Date(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
        moveMutation.mutate({
          taskId: drag.taskId,
          startDate:
            drag.mode === "move" ? shift(task.startDate, drag.deltaDays) : task.startDate.slice(0, 10),
          dueDate: shift(task.dueDate, drag.deltaDays),
        });
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, px, data, moveMutation]);

  if (!data) {
    return null;
  }
  if (dated.length === 0) {
    return <p className="text-sm text-muted">{t("empty")}</p>;
  }

  const barGeometry = (task: GanttTask) => {
    const startIdx = dayIndex(task.startDate!, rangeStart);
    const days =
      Math.round(
        (new Date(task.dueDate!).getTime() - new Date(task.startDate!).getTime()) / DAY_MS,
      ) + 1;
    const dragging = drag?.taskId === task.id ? drag : null;
    const offset = dragging?.mode === "move" ? dragging.deltaDays : 0;
    const grow = dragging?.mode === "resize" ? dragging.deltaDays : 0;
    return {
      x: (startIdx + offset) * px,
      w: Math.max(px, (days + grow) * px),
    };
  };

  const rowIndexById = new Map(ordered.map((task, index) => [task.id, index]));
  const todayX = Math.round((now - rangeStart) / DAY_MS) * px;

  // Graduations : lundis (jour/semaine) ou 1ers du mois (mois)
  const ticks: Array<{ x: number; label: string; major: boolean }> = [];
  for (let day = 0; day <= totalDays; day += 1) {
    const date = new Date(rangeStart + day * DAY_MS);
    const isMonday = date.getDay() === 1;
    const isFirst = date.getDate() === 1;
    if (zoom === "month" ? isFirst : isMonday) {
      ticks.push({
        x: day * px,
        label:
          zoom === "month" || isFirst
            ? date.toLocaleDateString(locale, { month: "short", year: "2-digit" })
            : date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" }),
        major: isFirst,
      });
    }
  }

  const statusFill = (task: GanttTask) =>
    task.status === "done"
      ? "var(--success)"
      : task.status === "cancelled"
        ? "var(--muted)"
        : "var(--accent)";

  const undatedCount = ordered.length - dated.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="glass flex rounded-(--radius-control) p-0.5">
          {(["day", "week", "month"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setZoom(value)}
              className={cn(
                "rounded-(--radius-control) px-3 py-1 text-xs font-medium transition-colors",
                zoom === value ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground",
              )}
            >
              {t(`zoom${value.charAt(0).toUpperCase()}${value.slice(1)}` as "zoomDay")}
            </button>
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span className="h-2 w-6 rounded-full border-2 border-danger" /> {t("criticalLegend")}
        </span>
        {undatedCount > 0 && (
          <span className="text-xs text-muted">{t("undated", { count: undatedCount })}</span>
        )}
      </div>

      <div className="glass overflow-hidden rounded-(--radius-card)">
        <div className="flex">
          {/* Colonne des tâches */}
          <div className="shrink-0 border-r border-border-subtle" style={{ width: LABEL_W }}>
            <div
              className="flex items-end border-b border-border-subtle px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted"
              style={{ height: HEADER_H }}
            >
              {t("today")} : {new Date(now).toLocaleDateString(locale)}
            </div>
            {ordered.map((task) => (
              <div
                key={task.id}
                className="flex items-center border-b border-border-subtle/50 px-3 text-sm"
                style={{ height: ROW_H, paddingLeft: 12 + task.depth * 16 }}
              >
                {critical.has(task.id) && (
                  <span className="mr-1.5 size-1.5 shrink-0 rounded-full bg-danger" />
                )}
                <span
                  className={cn(
                    "truncate",
                    task.status === "done" && "text-muted line-through",
                    task.status === "cancelled" && "text-muted line-through opacity-60",
                  )}
                >
                  {task.title}
                </span>
              </div>
            ))}
          </div>

          {/* Timeline SVG */}
          <div ref={containerRef} className="min-w-0 flex-1 overflow-x-auto">
            <svg
              width={chartW}
              height={HEADER_H + chartH}
              className={cn(drag !== null && "cursor-grabbing select-none")}
            >
              <defs>
                <marker
                  id="dep-arrow"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--muted)" />
                </marker>
              </defs>

              {/* Week-ends (zoom jour) */}
              {zoom === "day" &&
                Array.from({ length: totalDays }, (_, day) => {
                  const date = new Date(rangeStart + day * DAY_MS);
                  return date.getDay() === 0 || date.getDay() === 6 ? (
                    <rect
                      key={day}
                      x={day * px}
                      y={HEADER_H}
                      width={px}
                      height={chartH}
                      fill="var(--border-subtle)"
                      opacity={0.35}
                    />
                  ) : null;
                })}

              {/* Graduations */}
              {ticks.map((tick) => (
                <g key={tick.x}>
                  <line
                    x1={tick.x}
                    y1={HEADER_H}
                    x2={tick.x}
                    y2={HEADER_H + chartH}
                    stroke="var(--border-subtle)"
                    strokeWidth={tick.major ? 1.5 : 1}
                  />
                  <text
                    x={tick.x + 4}
                    y={HEADER_H - 8}
                    fontSize={10}
                    fill="var(--muted)"
                  >
                    {tick.label}
                  </text>
                </g>
              ))}

              {/* Lignes de rangées */}
              {ordered.map((_, index) => (
                <line
                  key={index}
                  x1={0}
                  y1={HEADER_H + (index + 1) * ROW_H}
                  x2={chartW}
                  y2={HEADER_H + (index + 1) * ROW_H}
                  stroke="var(--border-subtle)"
                  opacity={0.5}
                />
              ))}

              {/* Dépendances */}
              {data.dependencies.map((edge) => {
                const pred = ordered.find((task) => task.id === edge.predecessorId);
                const succ = ordered.find((task) => task.id === edge.successorId);
                if (!pred?.startDate || !pred.dueDate || !succ?.startDate || !succ.dueDate) {
                  return null;
                }
                const predGeo = barGeometry(pred);
                const succGeo = barGeometry(succ);
                const y1 = HEADER_H + rowIndexById.get(pred.id)! * ROW_H + ROW_H / 2;
                const y2 = HEADER_H + rowIndexById.get(succ.id)! * ROW_H + ROW_H / 2;
                const x1 = predGeo.x + predGeo.w;
                const x2 = succGeo.x;
                const elbow = Math.max(x1 + 10, x2 - 10);
                return (
                  <path
                    key={`${edge.predecessorId}-${edge.successorId}`}
                    d={`M ${x1} ${y1} H ${elbow} V ${y2} H ${x2 - 2}`}
                    fill="none"
                    stroke="var(--muted)"
                    strokeWidth={1.5}
                    markerEnd="url(#dep-arrow)"
                    opacity={0.8}
                  />
                );
              })}

              {/* Aujourd'hui */}
              {todayX >= 0 && todayX <= chartW && (
                <line
                  x1={todayX}
                  y1={HEADER_H - 4}
                  x2={todayX}
                  y2={HEADER_H + chartH}
                  stroke="var(--danger)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              )}

              {/* Barres */}
              {ordered.map((task, index) => {
                if (!task.startDate || !task.dueDate) return null;
                const geo = barGeometry(task);
                const y = HEADER_H + index * ROW_H + 7;
                const isCritical = critical.has(task.id);
                return (
                  <g key={task.id}>
                    <rect
                      x={geo.x}
                      y={y}
                      width={geo.w}
                      height={ROW_H - 14}
                      rx={6}
                      fill={statusFill(task)}
                      opacity={task.status === "cancelled" ? 0.35 : 0.85}
                      stroke={isCritical ? "var(--danger)" : "none"}
                      strokeWidth={isCritical ? 2 : 0}
                      className={cn(canWork && "cursor-grab")}
                      onMouseDown={(event) => {
                        if (!canWork) return;
                        event.preventDefault();
                        setDrag({
                          taskId: task.id,
                          mode: "move",
                          startX: event.clientX,
                          deltaDays: 0,
                        });
                      }}
                    >
                      <title>{task.title}</title>
                    </rect>
                    {geo.w > 60 && (
                      <text
                        x={geo.x + 8}
                        y={y + (ROW_H - 14) / 2 + 3.5}
                        fontSize={10.5}
                        fill="var(--accent-foreground)"
                        pointerEvents="none"
                      >
                        {task.title.slice(0, Math.floor(geo.w / 7))}
                      </text>
                    )}
                    {canWork && (
                      <rect
                        x={geo.x + geo.w - 6}
                        y={y}
                        width={8}
                        height={ROW_H - 14}
                        fill="transparent"
                        className="cursor-ew-resize"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDrag({
                            taskId: task.id,
                            mode: "resize",
                            startX: event.clientX,
                            deltaDays: 0,
                          });
                        }}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
