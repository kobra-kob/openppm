"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";
import { api } from "@/lib/api-client";

export type ProjectStatus = "draft" | "active" | "on_hold" | "completed" | "archived";
export type ProjectHealth = "green" | "amber" | "red";
export type ProjectRole = "manager" | "member" | "observer";

export interface ProjectMemberView {
  userId: string;
  name: string;
  email: string;
  role: ProjectRole;
}

export interface ProjectView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  health: ProjectHealth;
  priority: number;
  startDate: string | null;
  endDate: string | null;
  budget: string | null;
  category: { id: string; name: string; color: string } | null;
  isFavorite: boolean;
  manager: { id: string; name: string } | null;
  members: ProjectMemberView[];
  allowedTransitions: ProjectStatus[];
  deletedAt: string | null;
  updatedAt: string;
}

export interface ProjectListView {
  items: ProjectView[];
  total: number;
  page: number;
  pageSize: number;
}

/** Rôles d'organisation autorisés à créer des projets / gérer la corbeille. */
export const PROJECT_CREATOR_ROLES = ["admin", "manager", "pmo", "project_manager"];
export const ORG_WIDE_ROLES = ["admin", "manager", "pmo"];

const STATUS_STYLES: Record<ProjectStatus, string> = {
  draft: "bg-border-subtle text-muted",
  active: "bg-accent/15 text-accent",
  on_hold: "bg-danger/10 text-danger",
  completed: "bg-success/15 text-success",
  archived: "bg-border-subtle text-muted line-through",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const t = useTranslations("projects.status");
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLES[status],
      )}
    >
      {t(status)}
    </span>
  );
}

const HEALTH_COLORS: Record<ProjectHealth, string> = {
  green: "bg-success",
  amber: "bg-[#ff9f0a]",
  red: "bg-danger",
};

export function HealthDot({ health }: { health: ProjectHealth }) {
  const t = useTranslations("projects.health");
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={t(health)}>
      <span className={cn("size-2 rounded-full", HEALTH_COLORS[health])} />
      {t(health)}
    </span>
  );
}

export function CategoryBadge({
  category,
}: {
  category: { name: string; color: string } | null;
}) {
  if (!category) {
    return null;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle px-2 py-0.5 text-xs text-muted">
      <span className="size-2 rounded-full" style={{ backgroundColor: category.color }} />
      {category.name}
    </span>
  );
}

/** Étoile favori : bascule et invalide projets + favoris (sidebar). */
export function FavoriteStar({
  projectId,
  isFavorite,
  className,
}: {
  projectId: string;
  isFavorite: boolean;
  className?: string;
}) {
  const t = useTranslations("projects.detail");
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () =>
      api<void>(`/favorites/project/${projectId}`, {
        method: isFavorite ? "DELETE" : "PUT",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });
  return (
    <button
      type="button"
      aria-label={isFavorite ? t("favoriteRemove") : t("favoriteAdd")}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle.mutate();
      }}
      className={cn(
        "rounded-full p-1.5 transition-colors hover:bg-border-subtle",
        isFavorite ? "text-[#ff9f0a]" : "text-muted hover:text-foreground",
        className,
      )}
    >
      <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
    </button>
  );
}
