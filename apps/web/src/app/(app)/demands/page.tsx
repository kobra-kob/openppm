"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { formatEuro } from "@/features/portfolios/shared";
import {
  DemandDetailView,
  DemandListView,
  DemandUrgency,
  stateBadgeClass,
  URGENCY_BADGE,
} from "@/features/demands/shared";

interface PortfolioOption {
  id: string;
  name: string;
}

const URGENCIES: DemandUrgency[] = ["low", "medium", "high", "critical"];
const PRIORITIES = [1, 2, 3, 4, 5];

export default function DemandsPage() {
  const t = useTranslations("demands");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"mine" | "all">("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    department: "",
    urgency: "medium" as DemandUrgency,
    priority: "3",
    estimatedBudget: "",
    estimatedDurationDays: "",
    targetPortfolioId: "",
    tags: "",
  });

  const { data } = useQuery({
    queryKey: ["demands", { tab, search }],
    queryFn: () => {
      const params = new URLSearchParams({ scope: tab, pageSize: "50" });
      if (search) params.set("search", search);
      return api<DemandListView>(`/demands?${params.toString()}`);
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["demands-counts", search],
    queryFn: async () => {
      const total = async (scope: "mine" | "all") => {
        const params = new URLSearchParams({ scope, pageSize: "1" });
        if (search) params.set("search", search);
        return (await api<DemandListView>(`/demands?${params.toString()}`)).total;
      };
      const [mine, all] = await Promise.all([total("mine"), total("all")]);
      return { mine, all };
    },
  });

  const { data: portfolios } = useQuery({
    queryKey: ["portfolios"],
    queryFn: () => api<PortfolioOption[]>("/portfolios"),
    enabled: creating,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api<DemandDetailView>("/demands", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          urgency: form.urgency,
          priority: Number(form.priority),
          ...(form.department ? { department: form.department } : {}),
          ...(form.estimatedBudget ? { estimatedBudget: Number(form.estimatedBudget) } : {}),
          ...(form.estimatedDurationDays
            ? { estimatedDurationDays: Number(form.estimatedDurationDays) }
            : {}),
          ...(form.targetPortfolioId ? { targetPortfolioId: form.targetPortfolioId } : {}),
          ...(form.tags
            ? { tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) }
            : {}),
        }),
      }),
    onSuccess: (demand) => {
      void queryClient.invalidateQueries({ queryKey: ["demands"] });
      void queryClient.invalidateQueries({ queryKey: ["demands-counts"] });
      router.push(`/demands/${demand.id}`);
    },
    onError: (err: unknown) => {
      const code = err instanceof ApiError ? err.code : "UNKNOWN";
      setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    createMutation.mutate();
  };

  const items = data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> {t("new")}
          </Button>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {creating && (
        <Card>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label htmlFor="dTitle">{t("form.title")}</Label>
              <Input
                id="dTitle"
                required
                minLength={2}
                maxLength={160}
                autoFocus
                value={form.title}
                onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="dDept">{t("form.department")}</Label>
                <Input
                  id="dDept"
                  value={form.department}
                  onChange={(e) => setForm((c) => ({ ...c, department: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="dUrg">{t("form.urgency")}</Label>
                <Select
                  id="dUrg"
                  value={form.urgency}
                  onChange={(e) => setForm((c) => ({ ...c, urgency: e.target.value as DemandUrgency }))}
                >
                  {URGENCIES.map((u) => (
                    <option key={u} value={u}>
                      {t(`urgency.${u}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="dPrio">{t("form.priority")}</Label>
                <Select
                  id="dPrio"
                  value={form.priority}
                  onChange={(e) => setForm((c) => ({ ...c, priority: e.target.value }))}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      P{p}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="dBudget">{t("form.estimatedBudget")}</Label>
                <Input
                  id="dBudget"
                  type="number"
                  min={0}
                  step="1000"
                  value={form.estimatedBudget}
                  onChange={(e) => setForm((c) => ({ ...c, estimatedBudget: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="dDur">{t("form.estimatedDuration")}</Label>
                <Input
                  id="dDur"
                  type="number"
                  min={0}
                  value={form.estimatedDurationDays}
                  onChange={(e) => setForm((c) => ({ ...c, estimatedDurationDays: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="dPf">{t("form.targetPortfolio")}</Label>
                <Select
                  id="dPf"
                  value={form.targetPortfolioId}
                  onChange={(e) => setForm((c) => ({ ...c, targetPortfolioId: e.target.value }))}
                >
                  <option value="">{t("form.noPortfolio")}</option>
                  {(portfolios ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="dTags">{t("form.tags")}</Label>
              <Input
                id="dTags"
                placeholder={t("form.tagsHint")}
                value={form.tags}
                onChange={(e) => setForm((c) => ({ ...c, tags: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createMutation.isPending || !form.title}>
                {t("form.create")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                {t("form.cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Onglets Mes demandes / Toutes */}
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle">
        <div>
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
              {value === "mine" ? t("mine") : t("all")}
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
        <Input
          className="max-w-56"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 p-10 text-muted">
            <Inbox size={30} />
            <p className="text-sm">{t("empty")}</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((demand) => (
            <Link key={demand.id} href={`/demands/${demand.id}`}>
              <Card className="card-hover h-full">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-xs text-muted">{demand.reference}</span>
                  {demand.state && (
                    <span
                      className={cn(
                        "ml-auto rounded-full px-2 py-0.5 text-xs font-medium",
                        stateBadgeClass(
                          demand.state.isFinal
                            ? demand.state.key === "rejected"
                              ? "final_ko"
                              : "final_ok"
                            : demand.state.key === "draft"
                              ? "initial"
                              : "intermediate",
                        ),
                      )}
                    >
                      {demand.state.label}
                    </span>
                  )}
                </div>
                <p className="font-medium leading-snug">{demand.title}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-medium",
                      URGENCY_BADGE[demand.urgency],
                    )}
                  >
                    {t(`urgency.${demand.urgency}`)}
                  </span>
                  <span className="text-muted">P{demand.priority}</span>
                  {demand.targetPortfolio && (
                    <span className="text-muted">· {demand.targetPortfolio.name}</span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <span>{demand.requester.name}</span>
                  {demand.estimatedBudget !== null && (
                    <span className="tabular-nums">{formatEuro(demand.estimatedBudget, locale)}</span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Petit select stylé, aligné sur les champs de l'application. */
function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-[7px] text-sm",
        "focus:border-accent focus:outline-none focus:ring-3 focus:ring-[var(--ring)]",
        className,
      )}
      {...props}
    />
  );
}
