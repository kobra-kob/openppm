"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";

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
