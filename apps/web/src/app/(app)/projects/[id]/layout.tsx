"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Info, ListChecks, SquareKanban } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";
import { api } from "@/lib/api-client";
import {
  CategoryBadge,
  FavoriteStar,
  HealthDot,
  ProjectView,
  StatusBadge,
} from "@/features/projects/shared";

/** Espace projet : en-tête + navigation de modules, une page par module. */
export default function ProjectWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations("projectNav");
  const tWorkspace = useTranslations("workspace");
  const pathname = usePathname();

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api<ProjectView>(`/projects/${id}`),
  });

  const modules = [
    { href: `/projects/${id}`, key: "details", icon: Info, exact: true },
    { href: `/projects/${id}/tasks`, key: "tasks", icon: ListChecks, exact: false },
    { href: `/projects/${id}/board`, key: "board", icon: SquareKanban, exact: false },
  ] as const;

  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> {tWorkspace("title")}
      </Link>

      {project && (
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <span className="font-mono text-sm text-muted">{project.code}</span>
          <StatusBadge status={project.status} />
          <HealthDot health={project.health} />
          <CategoryBadge category={project.category} />
          <FavoriteStar projectId={project.id} isFavorite={project.isFavorite} />
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Navigation des modules du projet */}
        <nav className="glass flex shrink-0 gap-1 overflow-x-auto rounded-(--radius-card) p-2 lg:h-fit lg:w-44 lg:flex-col lg:sticky lg:top-20">
          {modules.map(({ href, key, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={key}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 whitespace-nowrap rounded-(--radius-control) px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent/15 font-medium text-accent"
                    : "text-foreground hover:bg-border-subtle",
                )}
              >
                <Icon size={16} />
                {t(key)}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
