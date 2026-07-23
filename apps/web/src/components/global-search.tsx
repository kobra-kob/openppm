"use client";

import { useQuery } from "@tanstack/react-query";
import { FolderKanban, ListChecks, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { api } from "@/lib/api-client";

interface SearchResults {
  projects: Array<{ id: string; code: string; name: string; status: string }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    project: { id: string; name: string; code: string };
  }>;
}

/** Recherche globale de la topbar : projets et tâches, navigation au clic. */
export function GlobalSearch() {
  const t = useTranslations("search");
  const router = useRouter();
  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce de la saisie
  useEffect(() => {
    const timer = setTimeout(() => setQuery(value.trim()), 250);
    return () => clearTimeout(timer);
  }, [value]);

  // Fermeture au clic extérieur
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", query],
    queryFn: () => api<SearchResults>(`/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    staleTime: 10_000,
  });

  const go = (href: string) => {
    setOpen(false);
    setValue("");
    router.push(href);
  };

  const hasResults = (data?.projects.length ?? 0) + (data?.tasks.length ?? 0) > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          placeholder={t("placeholder")}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              (event.target as HTMLInputElement).blur();
            }
          }}
          className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid py-1.5 pl-9 pr-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      {open && query.length >= 2 && (
        <div className="glass-strong animate-pop absolute left-0 right-0 top-full z-30 mt-2 max-h-96 origin-top overflow-y-auto rounded-(--radius-card) p-2 shadow-[var(--shadow-pop)]">
          {!hasResults && (
            <p className="px-3 py-2 text-sm text-muted">
              {isFetching ? "…" : t("empty")}
            </p>
          )}
          {(data?.projects.length ?? 0) > 0 && (
            <div>
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {t("projects")}
              </p>
              {data!.projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => go(`/projects/${project.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-(--radius-control) px-3 py-2 text-left text-sm transition-colors hover:bg-border-subtle"
                >
                  <FolderKanban size={14} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <span className="font-mono text-xs text-muted">{project.code}</span>
                </button>
              ))}
            </div>
          )}
          {(data?.tasks.length ?? 0) > 0 && (
            <div>
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {t("tasks")}
              </p>
              {data!.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => go(`/projects/${task.project.id}/tasks`)}
                  className="flex w-full items-center gap-2.5 rounded-(--radius-control) px-3 py-2 text-left text-sm transition-colors hover:bg-border-subtle"
                >
                  <ListChecks size={14} className="shrink-0 text-muted" />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      task.status === "done" && "text-muted line-through",
                    )}
                  >
                    {task.title}
                  </span>
                  <span className="truncate font-mono text-xs text-muted">
                    {task.project.code}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
