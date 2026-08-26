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
const PX: Record<Zoom, number> = { day: 30, week: 13, month: 4.4 };
const ROW_H = 40;
const HEADER_H = 56;
const HEADER_TOP = 26; // bandeau des mois
const LABEL_W = 268;
const BAR_H = 22;
const BAR_Y = (ROW_H - BAR_H) / 2;

const dayIndex = (iso: string, rangeStart: number) =>
  Math.round((new Date(iso).getTime() - rangeStart) / DAY_MS);

/** Couleur de barre par statut (variables de thème, clair/sombre). */
const STATUS_COLOR: Record<TaskStatus, string> = {
  done: "var(--success)",
  in_progress: "var(--accent)",
  todo: "var(--accent)",
  cancelled: "var(--muted)",
};

export default function GanttPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const t = useTranslations("gantt");
  const tTasks = useTranslations("tasks");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  const [zoom, setZoom] = useState<Zoom>("week");
  const [now] = useState(() => Date.now());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
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

  // Plage temporelle calée sur des mois entiers, pour un tracé net des deux
  // côtés : début = 1er du mois de la première tâche ; fin = dernier jour du
  // 2e mois suivant la dernière tâche (les mois à venir restent visibles même
  // sans tâche, la ligne ne coupe pas net).
  const rangeStart = useMemo(() => {
    const anchor =
      dated.length === 0
        ? new Date(now)
        : new Date(Math.min(...dated.map((task) => new Date(task.startDate!).getTime())));
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1).getTime();
  }, [dated, now]);
  const totalDays = useMemo(() => {
    const anchor =
      dated.length === 0
        ? new Date(now)
        : new Date(Math.max(...dated.map((task) => new Date(task.dueDate!).getTime())));
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 3, 0).getTime();
    return Math.max(30, Math.round((end - rangeStart) / DAY_MS) + 1);
  }, [dated, rangeStart, now]);

  const px = PX[zoom];
  const chartW = totalDays * px;
  const chartH = ordered.length * ROW_H;

  // Bandeaux mensuels : fond alterné + libellé, pour situer la timeline
  const monthBands = useMemo(() => {
    const bands: Array<{ x: number; w: number; label: string; even: boolean }> = [];
    const first = new Date(rangeStart);
    let cursor = new Date(first.getFullYear(), first.getMonth(), 1);
    const end = rangeStart + totalDays * DAY_MS;
    let i = 0;
    while (cursor.getTime() < end) {
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const x = Math.max(0, ((cursor.getTime() - rangeStart) / DAY_MS) * px);
      const xEnd = Math.min(chartW, ((next.getTime() - rangeStart) / DAY_MS) * px);
      bands.push({
        x,
        w: Math.max(0, xEnd - x),
        label: cursor.toLocaleDateString(locale, { month: "long", year: "numeric" }),
        even: i % 2 === 0,
      });
      cursor = next;
      i += 1;
    }
    return bands;
  }, [rangeStart, totalDays, px, chartW, locale]);

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
    return (
      <div className="glass flex flex-col items-center justify-center gap-2 rounded-(--radius-card) p-12 text-center">
        <p className="max-w-sm text-sm text-muted">{t("empty")}</p>
      </div>
    );
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
          zoom === "month"
            ? ""
            : date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" }),
        major: isFirst,
      });
    }
  }

  const undatedCount = ordered.length - dated.length;
  const legend: Array<{ key: string; color: string }> = [
    { key: "legendTodo", color: "var(--accent)" },
    { key: "legendActive", color: "var(--accent)" },
    { key: "legendDone", color: "var(--success)" },
  ];

  return (
    <div className="space-y-3">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="glass flex rounded-(--radius-control) p-0.5">
          {(["day", "week", "month"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setZoom(value)}
              className={cn(
                "rounded-(--radius-control) px-3 py-1 text-xs font-medium transition-colors",
                zoom === value
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              {t(`zoom${value.charAt(0).toUpperCase()}${value.slice(1)}` as "zoomDay")}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {legend.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-4 rounded-full"
                style={{
                  backgroundColor: item.color,
                  opacity: item.key === "legendTodo" ? 0.4 : 1,
                }}
              />
              {t(item.key)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-full ring-2 ring-danger ring-inset" />
            {t("criticalLegend")}
          </span>
        </div>

        {undatedCount > 0 && (
          <span className="ml-auto text-xs text-muted">{t("undated", { count: undatedCount })}</span>
        )}
      </div>

      <div className="glass overflow-hidden rounded-(--radius-card)">
        <div className="flex">
          {/* Colonne des tâches */}
          <div className="shrink-0 border-r border-border-subtle" style={{ width: LABEL_W }}>
            <div
              className="flex items-end border-b border-border-subtle px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted"
              style={{ height: HEADER_H }}
            >
              {tTasks("title")}
            </div>
            {ordered.map((task) => {
              const isDated = task.startDate && task.dueDate;
              return (
                <div
                  key={task.id}
                  onMouseEnter={() => setHoveredId(task.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={cn(
                    "flex flex-col justify-center gap-0.5 border-b border-border-subtle/50 pr-3 transition-colors",
                    hoveredId === task.id && "bg-accent/5",
                  )}
                  style={{ height: ROW_H, paddingLeft: 12 + task.depth * 16 }}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: STATUS_COLOR[task.status],
                        opacity: task.status === "todo" ? 0.45 : 1,
                      }}
                    />
                    <span
                      className={cn(
                        "truncate text-sm",
                        (task.status === "done" || task.status === "cancelled") &&
                          "text-muted line-through",
                      )}
                      title={task.title}
                    >
                      {task.title}
                    </span>
                    {critical.has(task.id) && (
                      <span className="shrink-0 rounded-full bg-danger/15 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-danger">
                        !
                      </span>
                    )}
                  </div>
                  {isDated && (
                    <span className="truncate pl-3.5 text-[10px] tabular-nums text-muted">
                      {new Date(task.startDate!).toLocaleDateString(locale, {
                        day: "2-digit",
                        month: "short",
                      })}
                      {" → "}
                      {new Date(task.dueDate!).toLocaleDateString(locale, {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  )}
                </div>
              );
            })}
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
                <filter id="bar-shadow" x="-2%" y="-20%" width="104%" height="140%">
                  <feDropShadow
                    dx="0"
                    dy="1"
                    stdDeviation="1.2"
                    floodColor="#000"
                    floodOpacity="0.18"
                  />
                </filter>
              </defs>

              {/* Bandeaux mensuels (fond + libellé) */}
              {monthBands.map((band, index) => (
                <g key={index}>
                  {band.even && (
                    <rect
                      x={band.x}
                      y={HEADER_H}
                      width={band.w}
                      height={chartH}
                      fill="var(--foreground)"
                      opacity={0.025}
                    />
                  )}
                  <rect
                    x={band.x}
                    y={0}
                    width={band.w}
                    height={HEADER_TOP}
                    fill="var(--foreground)"
                    opacity={band.even ? 0.03 : 0.05}
                  />
                  {band.w > 42 && (
                    <text
                      x={band.x + 8}
                      y={17}
                      fontSize={11}
                      fontWeight={600}
                      fill="var(--muted)"
                      className="capitalize"
                    >
                      {band.label}
                    </text>
                  )}
                  <line
                    x1={band.x}
                    y1={0}
                    x2={band.x}
                    y2={HEADER_H + chartH}
                    stroke="var(--border-subtle)"
                    strokeWidth={1}
                  />
                </g>
              ))}

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
                      fill="var(--foreground)"
                      opacity={0.04}
                    />
                  ) : null;
                })}

              {/* Séparateur bas d'en-tête */}
              <line
                x1={0}
                y1={HEADER_H}
                x2={chartW}
                y2={HEADER_H}
                stroke="var(--border-subtle)"
                strokeWidth={1}
              />

              {/* Graduations semaines/jours */}
              {ticks.map((tick, index) => (
                <g key={index}>
                  <line
                    x1={tick.x}
                    y1={HEADER_H}
                    x2={tick.x}
                    y2={HEADER_H + chartH}
                    stroke="var(--border-subtle)"
                    strokeWidth={0.75}
                    opacity={0.6}
                  />
                  {tick.label && (
                    <text x={tick.x + 4} y={HEADER_H - 7} fontSize={9.5} fill="var(--muted)">
                      {tick.label}
                    </text>
                  )}
                </g>
              ))}

              {/* Survol de rangée */}
              {hoveredId &&
                rowIndexById.has(hoveredId) &&
                (() => {
                  const index = rowIndexById.get(hoveredId)!;
                  return (
                    <rect
                      x={0}
                      y={HEADER_H + index * ROW_H}
                      width={chartW}
                      height={ROW_H}
                      fill="var(--accent)"
                      opacity={0.05}
                    />
                  );
                })()}

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
                const elbow = Math.max(x1 + 12, x2 - 12);
                const onPath = critical.has(pred.id) && critical.has(succ.id);
                return (
                  <path
                    key={`${edge.predecessorId}-${edge.successorId}`}
                    d={`M ${x1} ${y1} H ${elbow} V ${y2} H ${x2 - 2}`}
                    fill="none"
                    stroke={onPath ? "var(--danger)" : "var(--muted)"}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    markerEnd="url(#dep-arrow)"
                    opacity={onPath ? 0.7 : 0.5}
                  />
                );
              })}

              {/* Barres */}
              {ordered.map((task, index) => {
                if (!task.startDate || !task.dueDate) return null;
                const geo = barGeometry(task);
                const y = HEADER_H + index * ROW_H + BAR_Y;
                const isCritical = critical.has(task.id);
                const color = STATUS_COLOR[task.status];
                const isTodo = task.status === "todo";
                const isCancelled = task.status === "cancelled";
                const labelChars = Math.floor((geo.w - 16) / 6.5);
                return (
                  <g key={task.id}>
                    {/* Barre pleine (statut) */}
                    <rect
                      x={geo.x}
                      y={y}
                      width={geo.w}
                      height={BAR_H}
                      rx={7}
                      fill={color}
                      fillOpacity={isCancelled ? 0.3 : isTodo ? 0.4 : 0.95}
                      stroke={isTodo ? color : "none"}
                      strokeOpacity={isTodo ? 0.9 : 0}
                      strokeWidth={isTodo ? 1.5 : 0}
                      strokeDasharray={isCancelled ? "3 3" : undefined}
                      filter={isCancelled ? undefined : "url(#bar-shadow)"}
                      className={cn(canWork && "cursor-grab")}
                      onMouseEnter={() => setHoveredId(task.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onMouseDown={(event) => {
                        if (!canWork) return;
                        event.preventDefault();
                        setDrag({ taskId: task.id, mode: "move", startX: event.clientX, deltaDays: 0 });
                      }}
                    >
                      <title>{task.title}</title>
                    </rect>
                    {/* Liseré brillant en haut de barre */}
                    {!isCancelled && !isTodo && (
                      <rect
                        x={geo.x + 2}
                        y={y + 2}
                        width={Math.max(0, geo.w - 4)}
                        height={2}
                        rx={1}
                        fill="#fff"
                        opacity={0.25}
                        pointerEvents="none"
                      />
                    )}
                    {/* Contour chemin critique */}
                    {isCritical && (
                      <rect
                        x={geo.x}
                        y={y}
                        width={geo.w}
                        height={BAR_H}
                        rx={7}
                        fill="none"
                        stroke="var(--danger)"
                        strokeWidth={2}
                        pointerEvents="none"
                      />
                    )}
                    {/* Libellé dans la barre */}
                    {labelChars > 3 && (
                      <text
                        x={geo.x + 9}
                        y={y + BAR_H / 2 + 3.5}
                        fontSize={11}
                        fontWeight={500}
                        fill={isTodo ? "var(--foreground)" : "var(--accent-foreground)"}
                        pointerEvents="none"
                      >
                        {task.title.length > labelChars
                          ? `${task.title.slice(0, labelChars)}…`
                          : task.title}
                      </text>
                    )}
                    {/* Poignée de redimensionnement */}
                    {canWork && (
                      <rect
                        x={geo.x + geo.w - 6}
                        y={y}
                        width={9}
                        height={BAR_H}
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

              {/* Aujourd'hui */}
              {todayX >= 0 && todayX <= chartW && (
                <g pointerEvents="none">
                  <line
                    x1={todayX}
                    y1={HEADER_H - 2}
                    x2={todayX}
                    y2={HEADER_H + chartH}
                    stroke="var(--danger)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                  <circle cx={todayX} cy={HEADER_H - 2} r={3} fill="var(--danger)" />
                </g>
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
