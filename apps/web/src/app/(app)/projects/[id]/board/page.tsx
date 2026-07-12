"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckSquare, Columns3, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { DragEvent, useState } from "react";
import { Alert, Button, Card, Input, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { ORG_WIDE_ROLES, ProjectView } from "@/features/projects/shared";

type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
type SwimlaneMode = "none" | "assignee" | "priority";

interface BoardCard {
  id: string;
  title: string;
  status: TaskStatus;
  priority: number;
  dueDate: string | null;
  assignees: Array<{ userId: string; name: string }>;
  checklistDone: number;
  checklistTotal: number;
}

interface BoardColumnView {
  id: string;
  name: string;
  wipLimit: number | null;
  mapsToStatus: TaskStatus | null;
  cards: BoardCard[];
}

interface BoardView {
  id: string;
  name: string;
  columns: BoardColumnView[];
}

const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "cancelled"];

export default function BoardPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const t = useTranslations("board");
  const tTasks = useTranslations("tasks");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [swimlanes, setSwimlanes] = useState<SwimlaneMode>("none");
  const [showColumns, setShowColumns] = useState(false);
  const [newColumn, setNewColumn] = useState({ name: "", wipLimit: "", mapsToStatus: "" });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: board } = useQuery({
    queryKey: ["board", projectId],
    queryFn: () => api<BoardView>(`/projects/${projectId}/board`),
  });
  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api<ProjectView>(`/projects/${projectId}`),
  });

  const canManage =
    (currentUser?.roles.some((role) => ORG_WIDE_ROLES.includes(role)) ?? false) ||
    project?.manager?.id === currentUser?.id ||
    (project?.members.some(
      (member) => member.userId === currentUser?.id && member.role === "manager",
    ) ??
      false);

  const applyView = (view: BoardView) => {
    queryClient.setQueryData(["board", projectId], view);
    void queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
  };

  const onError = (caught: unknown) => {
    const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
    setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
  };

  const moveMutation = useMutation({
    mutationFn: (input: { taskId: string; columnId: string; position: number }) =>
      api<BoardView>(`/projects/${projectId}/board/move`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: applyView,
    onError,
  });

  const columnMutation = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) =>
      api<BoardView>(`/projects/${projectId}/board${path}`, {
        method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    onSuccess: (view) => {
      setError(null);
      applyView(view);
    },
    onError,
  });

  if (!board) {
    return null;
  }

  const matches = (card: BoardCard) =>
    (!search || card.title.toLowerCase().includes(search.toLowerCase())) &&
    (!assigneeFilter ||
      card.assignees.some((assignee) => assignee.userId === assigneeFilter));

  const assigneeOptions = new Map<string, string>();
  for (const column of board.columns) {
    for (const card of column.cards) {
      for (const assignee of card.assignees) {
        assigneeOptions.set(assignee.userId, assignee.name);
      }
    }
  }

  /** Lignes de swimlanes : [clé, libellé, prédicat]. */
  const lanes: Array<[string, string, (card: BoardCard) => boolean]> =
    swimlanes === "none"
      ? [["all", "", () => true]]
      : swimlanes === "priority"
        ? [1, 2, 3, 4, 5].map((priority) => [
            `p${priority}`,
            t("priorityLane", { value: priority }),
            (card) => card.priority === priority,
          ])
        : [
            ...[...assigneeOptions.entries()].map(
              ([userId, name]): [string, string, (card: BoardCard) => boolean] => [
                userId,
                name,
                (card) => card.assignees[0]?.userId === userId,
              ],
            ),
            ["none", t("unassigned"), (card: BoardCard) => card.assignees.length === 0],
          ];

  const handleDrop = (event: DragEvent, columnId: string, position: number) => {
    event.preventDefault();
    event.stopPropagation();
    const taskId = event.dataTransfer.getData("text/task-id") || draggingId;
    setDraggingId(null);
    if (taskId) {
      moveMutation.mutate({ taskId, columnId, position });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-52"
        />
        <select
          value={assigneeFilter}
          onChange={(event) => setAssigneeFilter(event.target.value)}
          className="rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          <option value="">{t("allAssignees")}</option>
          {[...assigneeOptions.entries()].map(([userId, name]) => (
            <option key={userId} value={userId}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={swimlanes}
          onChange={(event) => setSwimlanes(event.target.value as SwimlaneMode)}
          className="rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          {(["none", "assignee", "priority"] as const).map((mode) => (
            <option key={mode} value={mode}>
              {t(`swimlanes.${mode}`)}
            </option>
          ))}
        </select>
        {canManage && (
          <Button variant="ghost" onClick={() => setShowColumns((value) => !value)}>
            <Columns3 size={16} /> {t("columns.manage")}
          </Button>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {showColumns && canManage && (
        <Card>
          <div className="space-y-2">
            {board.columns.map((column) => (
              <div key={column.id} className="flex flex-wrap items-center gap-2">
                <Input
                  defaultValue={column.name}
                  maxLength={60}
                  onBlur={(event) => {
                    if (event.target.value && event.target.value !== column.name) {
                      columnMutation.mutate({
                        path: `/columns/${column.id}`,
                        method: "PATCH",
                        body: { name: event.target.value },
                      });
                    }
                  }}
                  className="max-w-48 py-1 text-sm"
                />
                <Input
                  type="number"
                  min={1}
                  max={99}
                  placeholder={t("columns.wip")}
                  defaultValue={column.wipLimit ?? ""}
                  onBlur={(event) => {
                    const value = event.target.value ? Number(event.target.value) : null;
                    if (value !== column.wipLimit) {
                      columnMutation.mutate({
                        path: `/columns/${column.id}`,
                        method: "PATCH",
                        body: { wipLimit: value },
                      });
                    }
                  }}
                  className="w-24 py-1 text-sm"
                />
                <select
                  value={column.mapsToStatus ?? ""}
                  onChange={(event) =>
                    columnMutation.mutate({
                      path: `/columns/${column.id}`,
                      method: "PATCH",
                      body: { mapsToStatus: event.target.value || null },
                    })
                  }
                  className="rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 py-1 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="">{t("columns.noStatus")}</option>
                  {TASK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {tTasks(`status.${status}`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    columnMutation.mutate({ path: `/columns/${column.id}`, method: "DELETE" })
                  }
                  aria-label={t("columns.delete")}
                  className="rounded-full p-1.5 text-muted transition-colors hover:bg-border-subtle hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <form
              className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!newColumn.name) return;
                columnMutation.mutate({
                  path: "/columns",
                  method: "POST",
                  body: {
                    name: newColumn.name,
                    ...(newColumn.wipLimit ? { wipLimit: Number(newColumn.wipLimit) } : {}),
                    ...(newColumn.mapsToStatus
                      ? { mapsToStatus: newColumn.mapsToStatus }
                      : {}),
                  },
                });
                setNewColumn({ name: "", wipLimit: "", mapsToStatus: "" });
              }}
            >
              <Input
                placeholder={t("columns.name")}
                required
                maxLength={60}
                value={newColumn.name}
                onChange={(event) =>
                  setNewColumn((current) => ({ ...current, name: event.target.value }))
                }
                className="max-w-48 py-1 text-sm"
              />
              <Input
                type="number"
                min={1}
                max={99}
                placeholder={t("columns.wip")}
                value={newColumn.wipLimit}
                onChange={(event) =>
                  setNewColumn((current) => ({ ...current, wipLimit: event.target.value }))
                }
                className="w-24 py-1 text-sm"
              />
              <select
                value={newColumn.mapsToStatus}
                onChange={(event) =>
                  setNewColumn((current) => ({ ...current, mapsToStatus: event.target.value }))
                }
                className="rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 py-1 text-sm focus:border-accent focus:outline-none"
              >
                <option value="">{t("columns.noStatus")}</option>
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {tTasks(`status.${status}`)}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="ghost" className="px-2 py-1">
                <Plus size={14} /> {t("columns.add")}
              </Button>
            </form>
          </div>
        </Card>
      )}

      <div className="space-y-6">
        {lanes.map(([laneKey, laneLabel, predicate]) => (
          <div key={laneKey}>
            {laneLabel && (
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {laneLabel}
              </p>
            )}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {board.columns.map((column) => {
                const laneCards = column.cards.filter(
                  (card) => matches(card) && predicate(card),
                );
                const wipExceeded =
                  column.wipLimit !== null && column.cards.length > column.wipLimit;
                return (
                  <div
                    key={column.id}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, column.id, column.cards.length)}
                    className="glass flex w-72 shrink-0 flex-col rounded-(--radius-card) p-3"
                  >
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-sm font-semibold">{column.name}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          wipExceeded ? "bg-danger/15 text-danger" : "bg-border-subtle text-muted",
                        )}
                      >
                        {column.wipLimit !== null
                          ? `${column.cards.length}/${column.wipLimit}`
                          : column.cards.length}
                      </span>
                    </div>
                    <div className="min-h-16 space-y-2">
                      {laneCards.length === 0 && (
                        <p className="px-1 py-2 text-xs text-muted">{t("empty")}</p>
                      )}
                      {laneCards.map((card, index) => (
                        <div
                          key={card.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/task-id", card.id);
                            setDraggingId(card.id);
                          }}
                          onDragEnd={() => setDraggingId(null)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => handleDrop(event, column.id, index)}
                          className={cn(
                            "cursor-grab rounded-(--radius-control) border border-border-subtle bg-surface-solid p-3 shadow-sm transition-opacity active:cursor-grabbing",
                            draggingId === card.id && "opacity-40",
                          )}
                        >
                          <p
                            className={cn(
                              "text-sm font-medium",
                              card.status === "done" && "text-muted line-through",
                            )}
                          >
                            {card.title}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "text-xs font-semibold",
                                card.priority <= 2 ? "text-danger" : "text-muted",
                              )}
                            >
                              P{card.priority}
                            </span>
                            {card.dueDate && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted">
                                <CalendarDays size={11} />
                                {new Date(card.dueDate).toLocaleDateString(locale)}
                              </span>
                            )}
                            {card.checklistTotal > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted">
                                <CheckSquare size={11} />
                                {card.checklistDone}/{card.checklistTotal}
                              </span>
                            )}
                            <span className="ml-auto flex -space-x-1.5">
                              {card.assignees.slice(0, 3).map((assignee) => (
                                <span
                                  key={assignee.userId}
                                  title={assignee.name}
                                  className="flex size-5 items-center justify-center rounded-full border border-surface-solid bg-accent/20 text-[9px] font-semibold text-accent"
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
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
