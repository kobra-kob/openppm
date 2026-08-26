"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarRange,
  FolderOpen,
  House,
  Info,
  LayoutDashboard,
  FileText,
  ListChecks,
  PiggyBank,
  SquareKanban,
  Wallet,
} from "lucide-react";
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

/**
 * Espace projet façon SPM : barre latérale pleine hauteur listant les
 * modules, fil d'ariane + en-tête projet dans le contenu.
 */
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
    { href: `/projects/${id}/dashboard`, key: "dashboard", icon: LayoutDashboard, exact: false },
    { href: `/projects/${id}`, key: "details", icon: Info, exact: true },
    { href: `/projects/${id}/tasks`, key: "tasks", icon: ListChecks, exact: false },
    { href: `/projects/${id}/board`, key: "board", icon: SquareKanban, exact: false },
    { href: `/projects/${id}/gantt`, key: "gantt", icon: CalendarRange, exact: false },
    { href: `/projects/${id}/budget`, key: "budget", icon: Wallet, exact: false },
    { href: `/projects/${id}/finance`, key: "finance", icon: PiggyBank, exact: false },
    { href: `/projects/${id}/quotes`, key: "quotes", icon: FileText, exact: false },
    { href: `/projects/${id}/documents`, key: "documents", icon: FolderOpen, exact: false },
  ] as const;

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* Sidebar des modules — colonne sur desktop, barre défilante sur mobile */}
      <aside className="glass-strong shrink-0 border-b border-border-subtle md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:w-56 md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-4">
        {/* En-tête projet — desktop uniquement (le nom figure déjà dans le contenu) */}
        <div className="hidden md:block">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 px-2 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft size={14} /> {tWorkspace("title")}
          </Link>
          <div className="mb-4 border-b border-border-subtle px-2 pb-3">
            <p className="truncate text-sm font-semibold">{project?.name ?? "…"}</p>
            <p className="font-mono text-xs text-muted">{project?.code ?? ""}</p>
          </div>
          <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t("modules")}
          </p>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto px-2 py-2 md:flex-col md:items-stretch md:gap-0.5 md:overflow-visible md:px-0 md:py-0">
          {modules.map(({ href, key, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={key}
                href={href}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-(--radius-control) px-3 py-1.5 text-sm transition-colors md:px-2",
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
      </aside>

      <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        {/* Fil d'ariane + en-tête projet */}
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
          <House size={12} />
          <Link href="/" className="hover:text-foreground">
            {tWorkspace("title")}
          </Link>
          <span>›</span>
          <span className="truncate text-foreground">{project?.name ?? ""}</span>
        </div>
        {project && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <StatusBadge status={project.status} />
            <HealthDot health={project.health} />
            <CategoryBadge category={project.category} />
            <FavoriteStar projectId={project.id} isFavorite={project.isFavorite} />
          </div>
        )}
        {/* `key` sur le chemin : le fondu rejoue à chaque changement de module */}
        <div key={pathname} className="animate-fade-up">
          {children}
        </div>
      </div>
    </div>
  );
}
