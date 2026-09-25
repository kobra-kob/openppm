"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock3,
  CornerDownRight,
  Download,
  GripVertical,
  ListChecks,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import type { ProjectMemberView } from "./shared";

// Vide par défaut → appels relatifs (même origine, proxifiés vers l'API par Next).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";

interface TaskView {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  status: TaskStatus;
  priority: number;
  startDate: string | null;
  dueDate: string | null;
  estimateHours: string | null;
  assignees: Array<{ userId: string; name: string }>;
  checklistDone: number;
  checklistTotal: number;
  timeSpentHours: number;
  subtaskCount: number;
}

interface TaskDetailView extends TaskView {
  checklist: Array<{ id: string; label: string; isDone: boolean }>;
  predecessors: Array<{ taskId: string; title: string; status: TaskStatus }>;
  timeEntries: Array<{
    id: string;
    userName: string;
    spentOn: string;
    hours: number;
    note: string | null;
  }>;
}

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done", "cancelled"];

/** Pastille de statut (repère couleur discret en tête de ligne). */
const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-border-strong",
  in_progress: "bg-accent",
  done: "bg-success",
  cancelled: "bg-border-subtle",
};

export function TasksSection({
  projectId,
  members,
  canWork,
}: {
  projectId: string;
  members: ProjectMemberView[];
  canWork: boolean;
}) {
  const t = useTranslations("tasks");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const { data: tasks } = useQuery({
    queryKey: ["tasks", projectId],
    queryFn: () => api<TaskView[]>(`/projects/${projectId}/tasks`),
  });

  const { data: detail } = useQuery({
    queryKey: ["task", projectId, expandedId],
    queryFn: () => api<TaskDetailView>(`/projects/${projectId}/tasks/${expandedId}`),
    enabled: expandedId !== null,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    if (expandedId) {
      void queryClient.invalidateQueries({ queryKey: ["task", projectId, expandedId] });
    }
  };

  const onError = (caught: unknown) => {
    const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
    setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
  };

  const call = (path: string, method: string, body?: unknown) =>
    api(`/projects/${projectId}/tasks${path}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  const mutate = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) =>
      call(path, method, body),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError,
  });

  const addTask = (event: FormEvent) => {
    event.preventDefault();
    if (!newTitle.trim()) return;
    mutate.mutate({ path: "", method: "POST", body: { title: newTitle.trim() } });
    setNewTitle("");
  };

  const roots = (tasks ?? []).filter((task) => task.parentId === null);
  const childrenOf = (id: string) => (tasks ?? []).filter((task) => task.parentId === id);

  // Réordonnancement par glisser-déposer : on ne réordonne qu'entre tâches d'un
  // même niveau (même parent). Le nouvel ordre (position) est repris par le Gantt.
  const onDropOn = (target: TaskView) => {
    const source = dragId;
    setDragId(null);
    if (!source || source === target.id) return;
    const dragged = (tasks ?? []).find((task) => task.id === source);
    if (!dragged || dragged.parentId !== target.parentId) return;
    const ids = (tasks ?? [])
      .filter((task) => task.parentId === target.parentId)
      .map((task) => task.id);
    const from = ids.indexOf(source);
    const to = ids.indexOf(target.id);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, source);
    mutate.mutate({ path: "/reorder", method: "PATCH", body: { orderedIds: ids } });
  };

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2 text-muted">
        <ListChecks size={16} />
        <h2 className="text-sm font-semibold uppercase tracking-wider">{t("title")}</h2>
        <button
          type="button"
          onClick={async () => {
            const { accessToken } = useAuthStore.getState();
            const response = await fetch(
              `${API_URL}/api/v1/projects/${projectId}/tasks/export`,
              {
                credentials: "include",
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
              },
            );
            if (!response.ok) return;
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "taches.csv";
            anchor.click();
            URL.revokeObjectURL(url);
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-(--radius-control) px-2 py-1 text-xs text-muted transition-colors hover:bg-border-subtle hover:text-foreground"
        >
          <Download size={13} /> {t("exportCsv")}
        </button>
      </div>
      {error && (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {canWork && (
        <form onSubmit={addTask} className="mb-3 flex gap-2">
          <Input
            placeholder={t("addPlaceholder")}
            maxLength={200}
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
          />
          <Button type="submit" disabled={mutate.isPending}>
            <Plus size={16} /> {t("add")}
          </Button>
        </form>
      )}
      {roots.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="space-y-0.5">
          {roots.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              depth={0}
              childrenOf={childrenOf}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              detail={detail ?? null}
              members={members}
              canWork={canWork}
              locale={locale}
              dragId={dragId}
              setDragId={setDragId}
              onDropOn={onDropOn}
              onAction={(path, method, body) => mutate.mutate({ path, method, body })}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function TaskRow({
  task,
  depth,
  childrenOf,
  expandedId,
  setExpandedId,
  detail,
  members,
  canWork,
  locale,
  dragId,
  setDragId,
  onDropOn,
  onAction,
}: {
  task: TaskView;
  depth: number;
  childrenOf: (id: string) => TaskView[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  detail: TaskDetailView | null;
  members: ProjectMemberView[];
  canWork: boolean;
  locale: string;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onDropOn: (target: TaskView) => void;
  onAction: (path: string, method: string, body?: unknown) => void;
}) {
  const t = useTranslations("tasks");
  const expanded = expandedId === task.id;
  const children = childrenOf(task.id);
  const isDone = task.status === "done";
  const overdue =
    task.dueDate && !isDone && new Date(task.dueDate) < new Date() ? true : false;
  const [isOver, setIsOver] = useState(false);

  return (
    <li>
      <div
        draggable={canWork}
        onDragStart={(event) => {
          setDragId(task.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDragId(null);
          setIsOver(false);
        }}
        onDragOver={(event) => {
          if (!canWork || !dragId || dragId === task.id) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsOver(false);
          onDropOn(task);
        }}
        className={cn(
          "group flex items-center gap-2 rounded-(--radius-control) px-2 py-2 transition-colors hover:bg-border-subtle/40",
          depth > 0 && "ml-6",
          dragId === task.id && "opacity-40",
          isOver && "ring-2 ring-inset ring-accent/60",
        )}
      >
        {canWork && (
          <GripVertical
            size={14}
            aria-hidden
            className="shrink-0 cursor-grab text-muted opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
        <input
          type="checkbox"
          checked={isDone}
          disabled={!canWork}
          onChange={() =>
            onAction(`/${task.id}/status`, "PATCH", { status: isDone ? "todo" : "done" })
          }
          className="size-4 shrink-0 accent-(--accent)"
          aria-label={task.title}
        />
        <span
          aria-hidden
          className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[task.status])}
        />
        <button
          type="button"
          onClick={() => setExpandedId(expanded ? null : task.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown size={14} className="shrink-0 text-muted" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-muted" />
          )}
          <span
            className={cn(
              "truncate text-sm",
              isDone && "text-muted line-through",
              task.status === "cancelled" && "text-muted line-through opacity-60",
            )}
          >
            {task.title}
          </span>
        </button>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
            task.priority <= 2 ? "bg-danger/12 text-danger" : "bg-border-subtle/70 text-muted",
          )}
        >
          P{task.priority}
        </span>
        {task.dueDate && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs",
              overdue ? "bg-danger/12 font-medium text-danger" : "bg-border-subtle/60 text-muted",
            )}
          >
            <CalendarDays size={12} />
            {new Date(task.dueDate).toLocaleDateString(locale)}
          </span>
        )}
        {task.checklistTotal > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-border-subtle/60 px-2 py-0.5 text-xs text-muted">
            <CheckSquare size={12} />
            {task.checklistDone}/{task.checklistTotal}
          </span>
        )}
        {task.timeSpentHours > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-border-subtle/60 px-2 py-0.5 text-xs text-muted">
            <Clock3 size={12} />
            {t("totalSpent", { hours: task.timeSpentHours })}
          </span>
        )}
        <span className="flex shrink-0 -space-x-1.5">
          {task.assignees.slice(0, 3).map((assignee) => (
            <span
              key={assignee.userId}
              title={assignee.name}
              className="flex size-6 items-center justify-center rounded-full border border-surface-solid bg-accent/20 text-[10px] font-semibold text-accent"
            >
              {assignee.name
                .split(" ")
                .map((part) => part.charAt(0))
                .join("")
                .slice(0, 2)}
            </span>
          ))}
        </span>
      </div>

      {expanded && detail && detail.id === task.id && (
        <TaskPanel
          projectTaskDetail={detail}
          members={members}
          canWork={canWork}
          depth={depth}
          locale={locale}
          onAction={onAction}
        />
      )}

      {children.length > 0 && (
        <ul className="space-y-0.5">
          {children.map((child) => (
            <TaskRow
              key={child.id}
              task={child}
              depth={depth + 1}
              childrenOf={childrenOf}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              detail={detail}
              members={members}
              canWork={canWork}
              locale={locale}
              dragId={dragId}
              setDragId={setDragId}
              onDropOn={onDropOn}
              onAction={onAction}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function TaskPanel({
  projectTaskDetail: detail,
  members,
  canWork,
  depth,
  locale,
  onAction,
}: {
  projectTaskDetail: TaskDetailView;
  members: ProjectMemberView[];
  canWork: boolean;
  depth: number;
  locale: string;
  onAction: (path: string, method: string, body?: unknown) => void;
}) {
  const t = useTranslations("tasks");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [checklistLabel, setChecklistLabel] = useState("");
  const [timeForm, setTimeForm] = useState({
    spentOn: new Date().toISOString().slice(0, 10),
    hours: "1",
    note: "",
  });
  // Renommage inline du titre (synchronisé quand on change de tâche).
  const [titleDraft, setTitleDraft] = useState(detail.title);
  const [titleFor, setTitleFor] = useState(detail.id);
  if (detail.id !== titleFor) {
    setTitleFor(detail.id);
    setTitleDraft(detail.title);
  }
  const saveTitle = () => {
    const value = titleDraft.trim();
    if (!value) {
      setTitleDraft(detail.title); // un titre vide est refusé
      return;
    }
    if (value !== detail.title) {
      onAction(`/${detail.id}`, "PATCH", { title: value });
    }
  };

  const availableAssignees = members.filter(
    (member) => !detail.assignees.some((assignee) => assignee.userId === member.userId),
  );

  return (
    <div
      className={cn(
        "mb-2 space-y-4 rounded-(--radius-control) border border-border-subtle bg-surface-solid/60 p-4",
        depth > 0 && "ml-6",
      )}
    >
      {/* Titre éditable (renommage) */}
      <input
        type="text"
        value={titleDraft}
        disabled={!canWork}
        maxLength={200}
        aria-label={t("rename")}
        title={canWork ? t("rename") : undefined}
        onChange={(event) => setTitleDraft(event.target.value)}
        onBlur={saveTitle}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setTitleDraft(detail.title);
            event.currentTarget.blur();
          }
        }}
        className="w-full rounded-(--radius-control) border border-transparent bg-transparent px-2 py-1 text-base font-semibold transition-colors hover:border-border-subtle focus:border-accent focus:bg-surface-solid focus:outline-none disabled:cursor-default disabled:opacity-80"
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={detail.status}
          disabled={!canWork}
          onChange={(event) =>
            onAction(`/${detail.id}/status`, "PATCH", { status: event.target.value })
          }
          className="rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 py-1 text-xs focus:border-accent focus:outline-none"
        >
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </select>

        {/* Planification : dates de début et de fin (alimentent le Gantt) */}
        <div className="flex items-center gap-1.5 rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 py-1">
          <CalendarDays size={13} className="text-muted" />
          <label className="flex items-center gap-1 text-xs text-muted">
            <span className="sr-only sm:not-sr-only">{t("startDate")}</span>
            <input
              type="date"
              disabled={!canWork}
              value={detail.startDate?.slice(0, 10) ?? ""}
              max={detail.dueDate?.slice(0, 10) || undefined}
              onChange={(event) =>
                onAction(`/${detail.id}`, "PATCH", { startDate: event.target.value || null })
              }
              className="bg-transparent text-xs text-foreground focus:outline-none disabled:opacity-60"
            />
          </label>
          <span className="text-muted">→</span>
          <label className="flex items-center gap-1 text-xs text-muted">
            <span className="sr-only sm:not-sr-only">{t("dueDate")}</span>
            <input
              type="date"
              disabled={!canWork}
              value={detail.dueDate?.slice(0, 10) ?? ""}
              min={detail.startDate?.slice(0, 10) || undefined}
              onChange={(event) =>
                onAction(`/${detail.id}`, "PATCH", { dueDate: event.target.value || null })
              }
              className="bg-transparent text-xs text-foreground focus:outline-none disabled:opacity-60"
            />
          </label>
        </div>

        {canWork && (
          <button
            type="button"
            onClick={() => onAction(`/${detail.id}`, "DELETE")}
            className="ml-auto inline-flex items-center gap-1 rounded-(--radius-control) px-2 py-1 text-xs text-muted transition-colors hover:bg-border-subtle hover:text-danger"
          >
            <Trash2 size={12} /> {t("delete")}
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Checklist */}
        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
            {t("checklist")}
          </h4>
          <ul className="space-y-1">
            {detail.checklist.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.isDone}
                  disabled={!canWork}
                  onChange={() =>
                    onAction(`/${detail.id}/checklist/${item.id}`, "PATCH", {
                      isDone: !item.isDone,
                    })
                  }
                  className="size-3.5 accent-(--accent)"
                />
                <span className={cn("flex-1", item.isDone && "text-muted line-through")}>
                  {item.label}
                </span>
                {canWork && (
                  <button
                    type="button"
                    onClick={() => onAction(`/${detail.id}/checklist/${item.id}`, "DELETE")}
                    className="text-muted hover:text-danger"
                    aria-label={t("delete")}
                  >
                    <X size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canWork && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!checklistLabel.trim()) return;
                onAction(`/${detail.id}/checklist`, "POST", {
                  label: checklistLabel.trim(),
                });
                setChecklistLabel("");
              }}
            >
              <Input
                placeholder={t("checklistPlaceholder")}
                maxLength={300}
                value={checklistLabel}
                onChange={(event) => setChecklistLabel(event.target.value)}
                className="py-1 text-xs"
              />
              <Button type="submit" variant="ghost" className="px-2 py-1">
                <Plus size={14} />
              </Button>
            </form>
          )}
        </div>

        {/* Assignés + dépendances */}
        <div className="space-y-4">
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
              {t("assignees")}
            </h4>
            <ul className="space-y-1">
              {detail.assignees.map((assignee) => (
                <li key={assignee.userId} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{assignee.name}</span>
                  {canWork && (
                    <button
                      type="button"
                      onClick={() =>
                        onAction(`/${detail.id}/assignees/${assignee.userId}`, "DELETE")
                      }
                      className="text-muted hover:text-danger"
                      aria-label={t("delete")}
                    >
                      <X size={12} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canWork && availableAssignees.length > 0 && (
              <select
                value=""
                onChange={(event) => {
                  if (event.target.value) {
                    onAction(`/${detail.id}/assignees`, "POST", {
                      userId: event.target.value,
                    });
                  }
                }}
                className="mt-1.5 w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 py-1 text-xs focus:border-accent focus:outline-none"
              >
                <option value="">{t("assign")}…</option>
                {availableAssignees.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
              {t("dependencies")}
            </h4>
            <ul className="space-y-1">
              {detail.predecessors.map((predecessor) => (
                <li key={predecessor.taskId} className="flex items-center gap-2 text-sm">
                  <CornerDownRight size={12} className="text-muted" />
                  <span
                    className={cn(
                      "flex-1 truncate",
                      predecessor.status === "done" && "text-muted line-through",
                    )}
                  >
                    {predecessor.title}
                  </span>
                  {canWork && (
                    <button
                      type="button"
                      onClick={() =>
                        onAction(
                          `/${detail.id}/dependencies/${predecessor.taskId}`,
                          "DELETE",
                        )
                      }
                      className="text-muted hover:text-danger"
                      aria-label={t("delete")}
                    >
                      <X size={12} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canWork && <DependencyPicker detail={detail} onAction={onAction} />}
          </div>
        </div>
      </div>

      {/* Temps passé */}
      <div>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
          {t("time")} — {t("totalSpent", { hours: detail.timeSpentHours })}
        </h4>
        <ul className="space-y-1">
          {detail.timeEntries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 text-sm">
              <span className="text-xs text-muted">
                {new Date(entry.spentOn).toLocaleDateString(locale)}
              </span>
              <span className="font-medium">{entry.hours} h</span>
              <span className="text-muted">{entry.userName}</span>
              <span className="flex-1 truncate text-xs text-muted">{entry.note}</span>
              {canWork && (
                <button
                  type="button"
                  onClick={() => onAction(`/${detail.id}/time/${entry.id}`, "DELETE")}
                  className="text-muted hover:text-danger"
                  aria-label={t("deleteEntry")}
                >
                  <X size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canWork && (
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onAction(`/${detail.id}/time`, "POST", {
                spentOn: timeForm.spentOn,
                hours: Number(timeForm.hours),
                ...(timeForm.note ? { note: timeForm.note } : {}),
              });
              setTimeForm((current) => ({ ...current, note: "" }));
            }}
          >
            <Input
              type="date"
              required
              value={timeForm.spentOn}
              onChange={(event) =>
                setTimeForm((current) => ({ ...current, spentOn: event.target.value }))
              }
              className="w-36 py-1 text-xs"
            />
            <Input
              type="number"
              min={0.25}
              max={24}
              step={0.25}
              required
              aria-label={t("hours")}
              value={timeForm.hours}
              onChange={(event) =>
                setTimeForm((current) => ({ ...current, hours: event.target.value }))
              }
              className="w-20 py-1 text-xs"
            />
            <Input
              placeholder={t("notePlaceholder")}
              maxLength={500}
              value={timeForm.note}
              onChange={(event) =>
                setTimeForm((current) => ({ ...current, note: event.target.value }))
              }
              className="min-w-32 flex-1 py-1 text-xs"
            />
            <Button type="submit" variant="ghost" className="px-2 py-1 text-xs">
              {t("log")}
            </Button>
          </form>
        )}
      </div>

      {/* Sous-tâche */}
      {canWork && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!subtaskTitle.trim()) return;
            onAction("", "POST", { title: subtaskTitle.trim(), parentId: detail.id });
            setSubtaskTitle("");
          }}
        >
          <CornerDownRight size={14} className="mt-2 shrink-0 text-muted" />
          <Input
            placeholder={t("subtaskPlaceholder")}
            maxLength={200}
            value={subtaskTitle}
            onChange={(event) => setSubtaskTitle(event.target.value)}
            className="py-1 text-xs"
          />
          <Button type="submit" variant="ghost" className="px-2 py-1">
            <Plus size={14} />
          </Button>
        </form>
      )}

      <CommentsSection
        projectId={detail.projectId}
        taskId={detail.id}
        members={members}
        canWork={canWork}
        locale={locale}
      />
    </div>
  );
}

interface CommentView {
  id: string;
  body: string;
  mentions: string[];
  author: { id: string; name: string };
  createdAt: string;
  editable: boolean;
}

/** Fil de commentaires d'une tâche avec mentions @membre. */
function CommentsSection({
  projectId,
  taskId,
  members,
  canWork,
  locale,
}: {
  projectId: string;
  taskId: string;
  members: ProjectMemberView[];
  canWork: boolean;
  locale: string;
}) {
  const t = useTranslations("comments");
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<ProjectMemberView[]>([]);

  const { data: comments } = useQuery({
    queryKey: ["comments", projectId, taskId],
    queryFn: () => api<CommentView[]>(`/projects/${projectId}/tasks/${taskId}/comments`),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["comments", projectId, taskId] });

  const createComment = useMutation({
    mutationFn: () =>
      api<CommentView>(`/projects/${projectId}/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: body.trim(), mentions: mentions.map((m) => m.userId) }),
      }),
    onSuccess: () => {
      setBody("");
      setMentions([]);
      invalidate();
    },
  });

  const deleteComment = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/projects/${projectId}/tasks/${taskId}/comments/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const toggleMention = (member: ProjectMemberView) => {
    setMentions((current) =>
      current.some((m) => m.userId === member.userId)
        ? current.filter((m) => m.userId !== member.userId)
        : [...current, member],
    );
  };

  return (
    <div className="border-t border-border-subtle pt-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        {t("title")}
      </h4>
      <ul className="mb-3 space-y-2">
        {(comments ?? []).length === 0 && (
          <li className="text-xs text-muted">{t("empty")}</li>
        )}
        {(comments ?? []).map((comment) => (
          <li key={comment.id} className="flex items-start gap-2 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">
              {comment.author.name
                .split(" ")
                .map((part) => part.charAt(0))
                .join("")
                .slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs">
                <span className="font-medium">{comment.author.name}</span>{" "}
                <span className="text-muted">
                  {new Date(comment.createdAt).toLocaleString(locale)}
                </span>
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>
            </div>
            {comment.editable && (
              <button
                type="button"
                onClick={() => deleteComment.mutate(comment.id)}
                aria-label={t("delete")}
                className="text-muted hover:text-danger"
              >
                <X size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {canWork && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (body.trim()) createComment.mutate();
          }}
          className="space-y-2"
        >
          <textarea
            placeholder={t("placeholder")}
            maxLength={5000}
            rows={2}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
          {members.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-muted">{t("mentionHint")} :</span>
              {members.map((member) => {
                const active = mentions.some((m) => m.userId === member.userId);
                return (
                  <button
                    key={member.userId}
                    type="button"
                    onClick={() => toggleMention(member)}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "bg-border-subtle text-muted hover:text-foreground",
                    )}
                  >
                    @{member.name}
                  </button>
                );
              })}
            </div>
          )}
          <Button type="submit" variant="ghost" className="px-3 py-1 text-xs" disabled={!body.trim()}>
            {t("send")}
          </Button>
        </form>
      )}
    </div>
  );
}

/** Sélecteur de prérequis : les autres tâches du projet, hors prérequis actuels. */
function DependencyPicker({
  detail,
  onAction,
}: {
  detail: TaskDetailView;
  onAction: (path: string, method: string, body?: unknown) => void;
}) {
  const t = useTranslations("tasks");
  const { data: tasks } = useQuery({
    queryKey: ["tasks", detail.projectId],
    queryFn: () => api<TaskView[]>(`/projects/${detail.projectId}/tasks`),
  });
  const candidates = (tasks ?? []).filter(
    (task) =>
      task.id !== detail.id &&
      !detail.predecessors.some((predecessor) => predecessor.taskId === task.id),
  );
  if (candidates.length === 0) {
    return null;
  }
  return (
    <select
      value=""
      onChange={(event) => {
        if (event.target.value) {
          onAction(`/${detail.id}/dependencies`, "POST", {
            predecessorId: event.target.value,
          });
        }
      }}
      className="mt-1.5 w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 py-1 text-xs focus:border-accent focus:outline-none"
    >
      <option value="">{t("addDependency")}</option>
      {candidates.map((task) => (
        <option key={task.id} value={task.id}>
          {task.title}
        </option>
      ))}
    </select>
  );
}
