"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookmarkPlus,
  History,
  Info,
  SquareKanban,
  Trash2,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import {
  CategoryBadge,
  FavoriteStar,
  HealthDot,
  ORG_WIDE_ROLES,
  ProjectRole,
  ProjectView,
  StatusBadge,
} from "@/features/projects/shared";
import { TasksSection } from "@/features/projects/tasks-section";

interface ActivityEntry {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
}

interface OrgMember {
  id: string;
  firstName: string;
  lastName: string;
}

const PROJECT_ROLES: ProjectRole[] = ["manager", "member", "observer"];

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations("projects");
  const tMembers = useTranslations("members");
  const tBoard = useTranslations("board");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    priority: "3",
    startDate: "",
    endDate: "",
    budget: "",
    categoryId: "",
  });
  const [newMember, setNewMember] = useState({ userId: "", role: "member" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api<ProjectView>(`/projects/${id}`),
  });
  const { data: activity } = useQuery({
    queryKey: ["project-activity", id],
    queryFn: () => api<ActivityEntry[]>(`/projects/${id}/activity`),
  });
  const { data: orgMembers } = useQuery({
    queryKey: ["members"],
    queryFn: () => api<OrgMember[]>("/members"),
  });
  const { data: categories } = useQuery({
    queryKey: ["project-categories"],
    queryFn: () => api<Array<{ id: string; name: string }>>("/project-categories"),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["project", id] });
    void queryClient.invalidateQueries({ queryKey: ["project-activity", id] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  const onError = (caught: unknown) => {
    const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
    setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
  };

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      api<ProjectView>(`/projects/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: refresh,
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api<ProjectView>(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description || null,
          priority: Number(editForm.priority),
          ...(editForm.startDate ? { startDate: editForm.startDate } : {}),
          ...(editForm.endDate ? { endDate: editForm.endDate } : {}),
          ...(editForm.budget ? { budget: Number(editForm.budget) } : {}),
          categoryId: editForm.categoryId || null,
        }),
      }),
    onSuccess: () => {
      setEditing(false);
      refresh();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api<void>(`/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => router.push("/projects"),
    onError,
  });

  const addMemberMutation = useMutation({
    mutationFn: () =>
      api<ProjectView>(`/projects/${id}/members`, {
        method: "POST",
        body: JSON.stringify(newMember),
      }),
    onSuccess: () => {
      setNewMember({ userId: "", role: "member" });
      refresh();
    },
    onError,
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      api<ProjectView>(`/projects/${id}/members/${userId}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError,
  });

  const saveTemplateMutation = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/project-templates", {
        method: "POST",
        body: JSON.stringify({ name: project!.name, fromProjectId: id }),
      }),
    onSuccess: () => {
      setNotice(t("detail.templateSaved"));
      void queryClient.invalidateQueries({ queryKey: ["project-templates"] });
    },
    onError,
  });

  const memberRoleMutation = useMutation({
    mutationFn: (input: { userId: string; role: string }) =>
      api<ProjectView>(`/projects/${id}/members/${input.userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: input.role }),
      }),
    onSuccess: refresh,
    onError,
  });

  if (!project) {
    return null;
  }

  const startEditing = () => {
    setEditForm({
      name: project.name,
      description: project.description ?? "",
      priority: String(project.priority),
      startDate: project.startDate?.slice(0, 10) ?? "",
      endDate: project.endDate?.slice(0, 10) ?? "",
      budget: project.budget ?? "",
      categoryId: project.category?.id ?? "",
    });
    setEditing(true);
    setError(null);
  };

  const submitEdit = (event: FormEvent) => {
    event.preventDefault();
    updateMutation.mutate();
  };

  const availableMembers = (orgMembers ?? []).filter(
    (candidate) => !project.members.some((member) => member.userId === candidate.id),
  );
  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(locale) : t("detail.none");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> {t("backToList")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <span className="font-mono text-sm text-muted">{project.code}</span>
          <StatusBadge status={project.status} />
          <HealthDot health={project.health} />
          <CategoryBadge category={project.category} />
          <FavoriteStar projectId={project.id} isFavorite={project.isFavorite} />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${project.id}/board`}
            className="inline-flex items-center gap-2 rounded-(--radius-control) px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-border-subtle"
          >
            <SquareKanban size={16} /> {tBoard("open")}
          </Link>
          {project.allowedTransitions.length > 0 && (
            <select
              value=""
              onChange={(event) => {
                if (event.target.value) statusMutation.mutate(event.target.value);
              }}
              className="rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">{t("detail.changeStatus")}</option>
              {project.allowedTransitions.map((status) => (
                <option key={status} value={status}>
                  {t(`status.${status}`)}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setNotice(null);
              saveTemplateMutation.mutate();
            }}
            disabled={saveTemplateMutation.isPending}
          >
            <BookmarkPlus size={16} /> {t("detail.saveAsTemplate")}
          </Button>
          <Button variant="ghost" onClick={startEditing}>
            {t("form.edit")}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <Trash2 size={16} /> {t("detail.delete")}
          </Button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

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
                <Label htmlFor="ePriority">{t("form.priority")}</Label>
                <select
                  id="ePriority"
                  value={editForm.priority}
                  onChange={(event) => setEditForm((c) => ({ ...c, priority: event.target.value }))}
                  className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  {[1, 2, 3, 4, 5].map((p) => (
                    <option key={p} value={p}>
                      {t("priorityShort", { value: p })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="eStart">{t("form.startDate")}</Label>
                <Input
                  id="eStart"
                  type="date"
                  value={editForm.startDate}
                  onChange={(event) => setEditForm((c) => ({ ...c, startDate: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="eEnd">{t("form.endDate")}</Label>
                <Input
                  id="eEnd"
                  type="date"
                  value={editForm.endDate}
                  onChange={(event) => setEditForm((c) => ({ ...c, endDate: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="eCategory">{t("form.category")}</Label>
                <select
                  id="eCategory"
                  value={editForm.categoryId}
                  onChange={(event) => setEditForm((c) => ({ ...c, categoryId: event.target.value }))}
                  className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="">{t("form.noCategory")}</option>
                  {(categories ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="eBudget">{t("form.budget")}</Label>
                <Input
                  id="eBudget"
                  type="number"
                  min={0}
                  step="0.01"
                  value={editForm.budget}
                  onChange={(event) => setEditForm((c) => ({ ...c, budget: event.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="eDescription">{t("form.description")}</Label>
              <textarea
                id="eDescription"
                rows={3}
                maxLength={10000}
                value={editForm.description}
                onChange={(event) => setEditForm((c) => ({ ...c, description: event.target.value }))}
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2 text-muted">
            <Info size={16} />
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              {t("detail.infoTitle")}
            </h2>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t("form.priority")}</dt>
              <dd className="font-medium">{t("priorityShort", { value: project.priority })}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t("form.startDate")}</dt>
              <dd className="font-medium">{formatDate(project.startDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t("form.endDate")}</dt>
              <dd className="font-medium">{formatDate(project.endDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t("form.budget")}</dt>
              <dd className="font-medium">
                {project.budget
                  ? Number(project.budget).toLocaleString(locale, {
                      style: "currency",
                      currency: "EUR",
                      maximumFractionDigits: 0,
                    })
                  : t("detail.none")}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t("detail.manager")}</dt>
              <dd className="font-medium">{project.manager?.name ?? t("detail.none")}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2 text-muted">
            <UsersRound size={16} />
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              {t("detail.membersTitle")}
            </h2>
          </div>
          <ul className="space-y-2">
            {project.members.map((member) => (
              <li key={member.userId} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {member.name}
                  {member.userId === currentUser?.id && (
                    <span className="ml-1 text-xs text-muted">({tMembers("you")})</span>
                  )}
                </span>
                <select
                  value={member.role}
                  onChange={(event) =>
                    memberRoleMutation.mutate({ userId: member.userId, role: event.target.value })
                  }
                  className="rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 py-1 text-xs focus:border-accent focus:outline-none"
                >
                  {PROJECT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {t(`role.${role}`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeMemberMutation.mutate(member.userId)}
                  aria-label={t("detail.removeMember")}
                  className="rounded-full p-1 text-muted transition-colors hover:bg-border-subtle hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          {availableMembers.length > 0 && (
            <div className="mt-4 flex items-center gap-2 border-t border-border-subtle pt-3">
              <select
                value={newMember.userId}
                onChange={(event) => setNewMember((c) => ({ ...c, userId: event.target.value }))}
                className="min-w-0 flex-1 rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
              >
                <option value="">…</option>
                {availableMembers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.firstName} {candidate.lastName}
                  </option>
                ))}
              </select>
              <select
                value={newMember.role}
                onChange={(event) => setNewMember((c) => ({ ...c, role: event.target.value }))}
                className="rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
              >
                {PROJECT_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(`role.${role}`)}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => newMember.userId && addMemberMutation.mutate()}
                disabled={!newMember.userId || addMemberMutation.isPending}
              >
                {t("detail.addMember")}
              </Button>
            </div>
          )}
        </Card>
      </div>

      <TasksSection
        projectId={project.id}
        members={project.members}
        canWork={
          (currentUser?.roles.some((role) => ORG_WIDE_ROLES.includes(role)) ?? false) ||
          project.members.some(
            (member) => member.userId === currentUser?.id && member.role !== "observer",
          )
        }
      />

      <Card>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
          {t("detail.descriptionTitle")}
        </h2>
        <p className="whitespace-pre-wrap text-sm">
          {project.description ?? t("detail.noDescription")}
        </p>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2 text-muted">
          <History size={16} />
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            {t("detail.activityTitle")}
          </h2>
        </div>
        <ul className="space-y-2">
          {(activity ?? []).map((entry) => {
            const labelKey = entry.action.replace(/\./g, "_");
            return (
              <li key={entry.id} className="flex items-baseline gap-2 text-sm">
                <span className="shrink-0 text-xs text-muted">
                  {new Date(entry.createdAt).toLocaleString(locale)}
                </span>
                <span className="font-medium">{entry.actorName ?? "—"}</span>
                <span className="text-muted">
                  {t.has(`activityLabels.${labelKey}`)
                    ? t(`activityLabels.${labelKey}`)
                    : entry.action}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
