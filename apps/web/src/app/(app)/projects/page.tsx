"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, FolderKanban, Plus, Tags, Trash2 } from "lucide-react";
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
  HealthDot,
  ORG_WIDE_ROLES,
  PROJECT_CREATOR_ROLES,
  ProjectListView,
  ProjectStatus,
  ProjectView,
  StatusBadge,
} from "@/features/projects/shared";

interface Category {
  id: string;
  name: string;
  color: string;
}

interface Template {
  id: string;
  name: string;
}

const STATUSES: ProjectStatus[] = ["draft", "active", "on_hold", "completed", "archived"];

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const canCreate = user?.roles.some((role) => PROJECT_CREATOR_ROLES.includes(role)) ?? false;
  const canSeeTrash = user?.roles.some((role) => ORG_WIDE_ROLES.includes(role)) ?? false;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [showTrash, setShowTrash] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    priority: "3",
    startDate: "",
    endDate: "",
    budget: "",
    description: "",
    templateId: "",
    categoryId: "",
  });
  const [newCategory, setNewCategory] = useState({ name: "", color: "#0071e3" });
  const [error, setError] = useState<string | null>(null);

  const { data: list } = useQuery({
    queryKey: ["projects", { search, status, categoryFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (categoryFilter) params.set("categoryId", categoryFilter);
      params.set("pageSize", "50");
      return api<ProjectListView>(`/projects?${params.toString()}`);
    },
    enabled: !showTrash,
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

  const { data: trash } = useQuery({
    queryKey: ["projects-trash"],
    queryFn: () => api<ProjectView[]>("/projects/trash"),
    enabled: showTrash && canSeeTrash,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api<ProjectView>("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          ...(form.code ? { code: form.code } : {}),
          priority: Number(form.priority),
          ...(form.startDate ? { startDate: form.startDate } : {}),
          ...(form.endDate ? { endDate: form.endDate } : {}),
          ...(form.budget ? { budget: Number(form.budget) } : {}),
          ...(form.description ? { description: form.description } : {}),
          ...(form.templateId ? { templateId: form.templateId } : {}),
          ...(form.categoryId ? { categoryId: form.categoryId } : {}),
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

  const addCategoryMutation = useMutation({
    mutationFn: () =>
      api<Category>("/project-categories", {
        method: "POST",
        body: JSON.stringify(newCategory),
      }),
    onSuccess: () => {
      setNewCategory({ name: "", color: "#0071e3" });
      void queryClient.invalidateQueries({ queryKey: ["project-categories"] });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => api<void>(`/project-categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project-categories"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api<ProjectView>(`/projects/${id}/restore`, { method: "POST", body: "{}" }),
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {showTrash ? t("trash") : t("title")}
          </h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {canSeeTrash && !showTrash && (
            <Button variant="ghost" onClick={() => setShowCategories((v) => !v)}>
              <Tags size={16} /> {t("categories.manage")}
            </Button>
          )}
          {canSeeTrash && (
            <Button variant="ghost" onClick={() => setShowTrash((v) => !v)}>
              {showTrash ? t("backToList") : (
                <>
                  <Trash2 size={16} /> {t("trash")}
                </>
              )}
            </Button>
          )}
          {canCreate && !showTrash && (
            <Button onClick={() => setShowForm((v) => !v)}>
              <Plus size={16} /> {t("new")}
            </Button>
          )}
        </div>
      </div>

      {showCategories && !showTrash && (
        <Card>
          <div className="mb-3 flex items-center gap-2 text-muted">
            <Tags size={16} />
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              {t("categories.manage")}
            </h2>
          </div>
          {(categories ?? []).length === 0 ? (
            <p className="mb-3 text-sm text-muted">{t("categories.empty")}</p>
          ) : (
            <ul className="mb-3 space-y-1.5">
              {(categories ?? []).map((category) => (
                <li key={category.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="flex-1">{category.name}</span>
                  <button
                    type="button"
                    onClick={() => deleteCategoryMutation.mutate(category.id)}
                    aria-label={t("form.cancel")}
                    className="rounded-full p-1 text-muted transition-colors hover:bg-border-subtle hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (newCategory.name) addCategoryMutation.mutate();
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1">
              <Label htmlFor="catName">{t("categories.name")}</Label>
              <Input
                id="catName"
                maxLength={60}
                required
                value={newCategory.name}
                onChange={(event) =>
                  setNewCategory((c) => ({ ...c, name: event.target.value }))
                }
              />
            </div>
            <input
              type="color"
              aria-label="couleur"
              value={newCategory.color}
              onChange={(event) =>
                setNewCategory((c) => ({ ...c, color: event.target.value }))
              }
              className="h-9 w-12 cursor-pointer rounded-(--radius-control) border border-border-subtle bg-surface-solid"
            />
            <Button type="submit" disabled={addCategoryMutation.isPending}>
              {t("categories.add")}
            </Button>
          </form>
        </Card>
      )}

      {showForm && !showTrash && (
        <Card>
          <form onSubmit={submitCreate} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pName">{t("form.name")}</Label>
                <Input id="pName" required minLength={2} maxLength={140} value={form.name} onChange={update("name")} />
              </div>
              <div>
                <Label htmlFor="pCode">{t("form.code")}</Label>
                <Input id="pCode" maxLength={20} value={form.code} onChange={update("code")} />
              </div>
              {(templates ?? []).length > 0 && (
                <div>
                  <Label htmlFor="pTemplate">{t("form.template")}</Label>
                  <select
                    id="pTemplate"
                    value={form.templateId}
                    onChange={(event) => setForm((c) => ({ ...c, templateId: event.target.value }))}
                    className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  >
                    <option value="">{t("form.noTemplate")}</option>
                    {(templates ?? []).map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <Label htmlFor="pCategory">{t("form.category")}</Label>
                <select
                  id="pCategory"
                  value={form.categoryId}
                  onChange={(event) => setForm((c) => ({ ...c, categoryId: event.target.value }))}
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
                <Label htmlFor="pPriority">{t("form.priority")}</Label>
                <select
                  id="pPriority"
                  value={form.priority}
                  onChange={(event) => setForm((c) => ({ ...c, priority: event.target.value }))}
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
                <Label htmlFor="pBudget">{t("form.budget")}</Label>
                <Input id="pBudget" type="number" min={0} step="0.01" value={form.budget} onChange={update("budget")} />
              </div>
              <div>
                <Label htmlFor="pStart">{t("form.startDate")}</Label>
                <Input id="pStart" type="date" value={form.startDate} onChange={update("startDate")} />
              </div>
              <div>
                <Label htmlFor="pEnd">{t("form.endDate")}</Label>
                <Input id="pEnd" type="date" value={form.endDate} onChange={update("endDate")} />
              </div>
            </div>
            <div>
              <Label htmlFor="pDescription">{t("form.description")}</Label>
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
                {t("form.create")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                {t("form.cancel")}
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
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">{t("allStatuses")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
          {(categories ?? []).length > 0 && (
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">{t("allCategories")}</option>
              {(categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <Card className="p-0">
        {showTrash ? (
          (trash ?? []).length === 0 ? (
            <p className="p-6 text-sm text-muted">{t("trashEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {(trash ?? []).map((project) => (
                <li key={project.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="font-mono text-xs text-muted">{project.code}</span>
                  <span className="flex-1 truncate text-sm font-medium">{project.name}</span>
                  <span className="text-xs text-muted">
                    {project.deletedAt &&
                      t("deletedOn", {
                        date: new Date(project.deletedAt).toLocaleDateString(locale),
                      })}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => restoreMutation.mutate(project.id)}
                    disabled={restoreMutation.isPending}
                  >
                    <ArchiveRestore size={16} /> {t("restore")}
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : (list?.items ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-muted">
            <FolderKanban size={32} />
            <p className="text-sm">{t("empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {(list?.items ?? []).map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-border-subtle/50"
                >
                  <span className="w-20 shrink-0 font-mono text-xs text-muted">{project.code}</span>
                  <span
                    className={cn(
                      "w-8 shrink-0 text-xs font-semibold",
                      project.priority <= 2 ? "text-danger" : "text-muted",
                    )}
                  >
                    {t("priorityShort", { value: project.priority })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{project.name}</span>
                  <CategoryBadge category={project.category} />
                  <span className="hidden text-xs text-muted sm:block">
                    {t("membersCount", { count: project.members.length })}
                  </span>
                  <HealthDot health={project.health} />
                  <StatusBadge status={project.status} />
                  <FavoriteStar projectId={project.id} isFavorite={project.isFavorite} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
