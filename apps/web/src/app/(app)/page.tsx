"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, FolderKanban, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import {
  CategoryBadge,
  FavoriteStar,
  ORG_WIDE_ROLES,
  PROJECT_CREATOR_ROLES,
  ProjectHealth,
  ProjectListView,
  ProjectView,
  StatusBadge,
} from "@/features/projects/shared";

interface Category {
  id: string;
  name: string;
  color: string;
}

interface MyTask {
  id: string;
  title: string;
  status: string;
  priority: number;
  dueDate: string | null;
  project: { id: string; name: string; code: string };
}

interface Template {
  id: string;
  name: string;
}

interface OrgMember {
  id: string;
  firstName: string;
  lastName: string;
  roles: string[];
}

const HEALTH_PILL: Record<ProjectHealth, string> = {
  green: "bg-success/15 text-success",
  amber: "bg-[#ff9f0a]/15 text-[#ff9f0a]",
  red: "bg-danger/15 text-danger",
};

export default function WorkspacePage() {
  const t = useTranslations("workspace");
  const tProjects = useTranslations("projects");
  const tMyTasks = useTranslations("myTasks");
  const tErrors = useTranslations("errors");
  const [nowRef] = useState(() => Date.now());
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const canCreate = user?.roles.some((role) => PROJECT_CREATOR_ROLES.includes(role)) ?? false;
  const canSeeTrash = user?.roles.some((role) => ORG_WIDE_ROLES.includes(role)) ?? false;

  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "priority">("recent");
  const [showTrash, setShowTrash] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    priority: "3",
    startDate: "",
    endDate: "",
    description: "",
    templateId: "",
    categoryId: "",
    managerId: "",
  });
  const [error, setError] = useState<string | null>(null);

  const { data: list } = useQuery({
    queryKey: ["projects", { tab, search, sort }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("scope", tab);
      params.set("sort", sort);
      if (search) params.set("search", search);
      params.set("pageSize", "50");
      return api<ProjectListView>(`/projects?${params.toString()}`);
    },
    enabled: !showTrash,
  });

  // Effectifs des deux périmètres : rend l'effet des onglets visible même
  // quand ils coïncident (cas d'un utilisateur impliqué dans tous les projets).
  const { data: counts } = useQuery({
    queryKey: ["projects-counts", search],
    queryFn: async () => {
      const total = async (scope: "mine" | "all") => {
        const params = new URLSearchParams({ scope, pageSize: "1" });
        if (search) params.set("search", search);
        const page = await api<ProjectListView>(`/projects?${params.toString()}`);
        return page.total;
      };
      const [mine, all] = await Promise.all([total("mine"), total("all")]);
      return { mine, all };
    },
    enabled: !showTrash,
  });

  const { data: trash } = useQuery({
    queryKey: ["projects-trash"],
    queryFn: () => api<ProjectView[]>("/projects/trash"),
    enabled: showTrash && canSeeTrash,
  });

  const { data: categories } = useQuery({
    queryKey: ["project-categories"],
    queryFn: () => api<Category[]>("/project-categories"),
  });

  const { data: templates } = useQuery({
    queryKey: ["project-templates"],
    queryFn: () => api<Template[]>("/project-templates"),
    enabled: canCreate,
  });

  // Membres de l'organisation : candidats au rôle de chef de projet
  const { data: orgMembers } = useQuery({
    queryKey: ["members"],
    queryFn: () => api<OrgMember[]>("/members"),
    enabled: canCreate,
  });

  const { data: myTasks } = useQuery({
    queryKey: ["my-tasks"],
    queryFn: () => api<MyTask[]>("/me/tasks"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api<ProjectView>("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          priority: Number(form.priority),
          ...(form.startDate ? { startDate: form.startDate } : {}),
          ...(form.endDate ? { endDate: form.endDate } : {}),
          ...(form.description ? { description: form.description } : {}),
          ...(form.templateId ? { templateId: form.templateId } : {}),
          ...(form.categoryId ? { categoryId: form.categoryId } : {}),
          ...(form.managerId ? { managerId: form.managerId } : {}),
        }),
      }),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.push(`/projects/${project.id}`);
    },
    onError: (caught) => {
      const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
      setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) =>
      api<ProjectView>(`/projects/${id}/restore`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects-trash"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    createMutation.mutate();
  };

  const update = (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(locale) : "—";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-6">
      {/* En-tête façon SPM */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex items-center gap-2">
          {canSeeTrash && (
            <Button variant="ghost" onClick={() => setShowTrash((value) => !value)}>
              {showTrash ? (
                tProjects("backToList")
              ) : (
                <>
                  <Trash2 size={16} /> {tProjects("trash")}
                </>
              )}
            </Button>
          )}
          {canCreate && !showTrash && (
            <Button onClick={() => setShowForm((value) => !value)}>
              <Plus size={16} /> {tProjects("new")}
            </Button>
          )}
        </div>
      </div>

      {/* Onglets Mes projets / Tous les projets */}
      {!showTrash && (
        <div className="border-b border-border-subtle">
          {(["mine", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                tab === value
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {value === "mine" ? t("myProjects") : t("allProjects")}
              {counts && (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                    tab === value ? "bg-accent/15 text-accent" : "bg-border-subtle text-muted",
                  )}
                >
                  {value === "mine" ? counts.mine : counts.all}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Mes tâches ouvertes, tous projets confondus */}
      {!showTrash && (myTasks ?? []).length > 0 && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
            {tMyTasks("title")}
          </h2>
          <ul className="divide-y divide-border-subtle">
            {(myTasks ?? []).slice(0, 8).map((task) => {
              const overdue =
                task.dueDate !== null && new Date(task.dueDate).getTime() < nowRef;
              return (
                <li key={task.id}>
                  <Link
                    href={`/projects/${task.project.id}/tasks`}
                    className="flex items-center gap-3 py-2 transition-colors hover:bg-border-subtle/40"
                  >
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        task.priority <= 2 ? "text-danger" : "text-muted",
                      )}
                    >
                      P{task.priority}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                    <span className="truncate font-mono text-xs text-muted">
                      {task.project.code}
                    </span>
                    {task.dueDate && (
                      <span
                        className={cn(
                          "text-xs",
                          overdue ? "font-medium text-danger" : "text-muted",
                        )}
                      >
                        {tMyTasks("due", {
                          date: new Date(task.dueDate).toLocaleDateString(locale),
                        })}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {showForm && !showTrash && (
        <Card>
          <form onSubmit={submitCreate} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pName">{tProjects("form.name")}</Label>
                <Input id="pName" required minLength={2} maxLength={140} value={form.name} onChange={update("name")} />
              </div>
              {/* Le numéro de projet (PROJxxxxx) est attribué automatiquement */}
              {(templates ?? []).length > 0 && (
                <div>
                  <Label htmlFor="pTemplate">{tProjects("form.template")}</Label>
                  <select
                    id="pTemplate"
                    value={form.templateId}
                    onChange={(event) => setForm((c) => ({ ...c, templateId: event.target.value }))}
                    className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  >
                    <option value="">{tProjects("form.noTemplate")}</option>
                    {(templates ?? []).map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <Label htmlFor="pCategory">{tProjects("form.category")}</Label>
                <select
                  id="pCategory"
                  value={form.categoryId}
                  onChange={(event) => setForm((c) => ({ ...c, categoryId: event.target.value }))}
                  className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="">{tProjects("form.noCategory")}</option>
                  {(categories ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="pManager">{tProjects("detail.manager")}</Label>
                <select
                  id="pManager"
                  value={form.managerId}
                  onChange={(event) => setForm((c) => ({ ...c, managerId: event.target.value }))}
                  className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="">{tProjects("form.noManager")}</option>
                  {/* Seuls les membres possédant le rôle « Chef de projet » sont éligibles */}
                  {(orgMembers ?? [])
                    .filter((member) => member.roles.includes("project_manager"))
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.firstName} {member.lastName}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <Label htmlFor="pPriority">{tProjects("form.priority")}</Label>
                <select
                  id="pPriority"
                  value={form.priority}
                  onChange={(event) => setForm((c) => ({ ...c, priority: event.target.value }))}
                  className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  {[1, 2, 3, 4, 5].map((priority) => (
                    <option key={priority} value={priority}>
                      {tProjects("priorityShort", { value: priority })}
                    </option>
                  ))}
                </select>
              </div>
              {/* Pas de budget ici : il est fixé par le circuit de gouvernance */}
              <div>
                <Label htmlFor="pStart">{tProjects("form.startDate")}</Label>
                <Input id="pStart" type="date" value={form.startDate} onChange={update("startDate")} />
              </div>
              <div>
                <Label htmlFor="pEnd">{tProjects("form.endDate")}</Label>
                <Input id="pEnd" type="date" value={form.endDate} onChange={update("endDate")} />
              </div>
            </div>
            <div>
              <Label htmlFor="pDescription">{tProjects("form.description")}</Label>
              <textarea
                id="pDescription"
                rows={3}
                maxLength={10000}
                value={form.description}
                onChange={update("description")}
                className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {tProjects("form.create")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                {tProjects("form.cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!showTrash && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-xs"
          />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as "recent" | "priority")}
            className="ml-auto rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="recent">{t("sortRecent")}</option>
            <option value="priority">{t("sortPriority")}</option>
          </select>
        </div>
      )}

      {showTrash ? (
        <Card className="p-0">
          {(trash ?? []).length === 0 ? (
            <p className="p-6 text-sm text-muted">{tProjects("trashEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {(trash ?? []).map((project) => (
                <li key={project.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="font-mono text-xs text-muted">{project.code}</span>
                  <span className="flex-1 truncate text-sm font-medium">{project.name}</span>
                  <span className="text-xs text-muted">
                    {project.deletedAt &&
                      tProjects("deletedOn", {
                        date: new Date(project.deletedAt).toLocaleDateString(locale),
                      })}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => restoreMutation.mutate(project.id)}
                    disabled={restoreMutation.isPending}
                  >
                    <ArchiveRestore size={16} /> {tProjects("restore")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (list?.items ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-14 text-muted">
          <FolderKanban size={32} />
          {/* « Mes projets » vide alors que l'organisation en a : on oriente
              vers l'autre onglet plutôt que d'inviter à créer un projet. */}
          {tab === "mine" && (counts?.all ?? 0) > 0 ? (
            <>
              <p className="text-sm">{t("emptyMine")}</p>
              <Button variant="ghost" onClick={() => setTab("all")}>
                {t("allProjects")}
              </Button>
            </>
          ) : (
            <p className="text-sm">{t("empty")}</p>
          )}
        </div>
      ) : (
        /* Grille de cartes projet façon Project Workspace */
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
          {(list?.items ?? []).map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="group">
              <Card className="flex h-full flex-col gap-3 p-4 transition-[transform,box-shadow] duration-200 ease-[var(--ease-macos)] group-hover:-translate-y-0.5 group-hover:shadow-[var(--shadow-pop)] group-active:translate-y-0 group-active:scale-[0.995]">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      HEALTH_PILL[project.health],
                    )}
                  >
                    {tProjects(`health.${project.health}`)}
                  </span>
                  <FavoriteStar
                    projectId={project.id}
                    isFavorite={project.isFavorite}
                    className="-m-1"
                  />
                </div>
                <p className="line-clamp-2 text-sm font-semibold leading-snug">
                  {project.name}
                </p>
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">
                    {(project.manager?.name ?? "—")
                      .split(" ")
                      .map((part) => part.charAt(0))
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <span className="truncate text-xs text-muted">
                    {project.manager
                      ? `${project.manager.name} (${t("manager")})`
                      : t("noManager")}
                  </span>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border-subtle pt-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">
                      {t("startDate")}
                    </p>
                    <p className="text-xs font-medium">{formatDate(project.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">
                      {t("endDate")}
                    </p>
                    <p className="text-xs font-medium">{formatDate(project.endDate)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={project.status} />
                  <CategoryBadge category={project.category} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
