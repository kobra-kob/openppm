"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Plus, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import {
  canManageResources,
  formatRate,
  RESOURCE_TYPES,
  type RateUnit,
  type ResourceType,
  type ResourceView,
} from "@/features/resources/shared";

type Filter = "active" | "inactive" | "all";

export default function ResourcesPage() {
  const t = useTranslations("resources");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.user?.roles);
  const canManage = canManageResources(roles);

  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeParam = filter === "all" ? undefined : filter === "active";

  const { data: resources } = useQuery({
    queryKey: ["resources", filter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeParam !== undefined) params.set("active", String(activeParam));
      if (search.trim()) params.set("search", search.trim());
      const query = params.toString();
      return api<ResourceView[]>(`/resources${query ? `?${query}` : ""}`);
    },
  });

  const onError = (caught: unknown) => {
    const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
    setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
  };

  const archive = useMutation({
    mutationFn: (id: string) => api(`/resources/${id}/archive`, { method: "POST" }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
    onError,
  });

  const unitLabels = { HOUR: t("unit.HOUR"), DAY: t("unit.DAY") };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        </div>
        {canManage && (
          <Button className="ml-auto" onClick={() => setCreating((value) => !value)}>
            <Plus size={16} /> {t("new")}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted">{t("subtitle")}</p>

      {error && <Alert tone="error">{error}</Alert>}

      {creating && canManage && (
        <CreateResourceForm
          onDone={() => {
            setCreating(false);
            void queryClient.invalidateQueries({ queryKey: ["resources"] });
          }}
          onError={onError}
        />
      )}

      {/* Filtres + recherche */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["active", "inactive", "all"] as Filter[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-(--radius-control) px-3 py-1 text-xs font-medium transition-colors",
                filter === value
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-border-subtle",
              )}
            >
              {t(value === "active" ? "filterActive" : value === "inactive" ? "filterInactive" : "filterAll")}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            placeholder={t("search")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-56 pl-8"
          />
        </div>
      </div>

      <Card>
        {(resources ?? []).length === 0 ? (
          <p className="py-2 text-sm text-muted">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 font-medium">{t("resource")}</th>
                  <th className="py-2 font-medium">{t("type")}</th>
                  <th className="py-2 font-medium">{t("company")}</th>
                  <th className="py-2 text-right font-medium">{t("rate")}</th>
                  {canManage && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {(resources ?? []).map((resource) => (
                  <tr key={resource.id} className="border-b border-border-subtle/60">
                    <td className="py-2">
                      <Link
                        href={`/resources/${resource.id}`}
                        className="font-medium text-accent transition-colors hover:underline"
                      >
                        {resource.name}
                      </Link>
                      {!resource.active && (
                        <span className="ml-2 rounded-full bg-border-subtle/70 px-1.5 py-0.5 text-[10px] text-muted">
                          {t("archived")}
                        </span>
                      )}
                      {resource.jobTitle && (
                        <span className="ml-2 text-xs text-muted">{resource.jobTitle}</span>
                      )}
                    </td>
                    <td className="py-2 text-muted">{t(`types.${resource.resourceType}`)}</td>
                    <td className="py-2 text-muted">{resource.company ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatRate(resource.rate, locale, unitLabels)}
                    </td>
                    {canManage && (
                      <td className="py-2 text-right">
                        {resource.active && (
                          <button
                            type="button"
                            aria-label={t("archive")}
                            title={t("archive")}
                            className="text-muted transition-colors hover:text-danger"
                            onClick={() => {
                              if (window.confirm(t("confirmArchive"))) archive.mutate(resource.id);
                            }}
                          >
                            <Archive size={15} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CreateResourceForm({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (caught: unknown) => void;
}) {
  const t = useTranslations("resources");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    resourceType: "CONTRACTOR" as ResourceType,
    company: "",
    email: "",
    jobTitle: "",
    amount: "",
    unit: "DAY" as RateUnit,
    currency: "EUR",
  });

  const create = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        resourceType: form.resourceType,
      };
      if (form.company.trim()) body.company = form.company.trim();
      if (form.email.trim()) body.email = form.email.trim();
      if (form.jobTitle.trim()) body.jobTitle = form.jobTitle.trim();
      if (form.amount) {
        body.rate = { amount: Number(form.amount), unit: form.unit, currency: form.currency };
      }
      return api<ResourceView>("/resources", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: onDone,
    onError,
  });

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{t("new")}</h2>
        <button type="button" onClick={onDone} aria-label={t("cancel")} className="text-muted hover:text-foreground">
          <X size={16} />
        </button>
      </div>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (form.firstName.trim() && form.lastName.trim()) create.mutate();
        }}
      >
        <div>
          <Label htmlFor="firstName">{t("firstName")}</Label>
          <Input
            id="firstName"
            required
            value={form.firstName}
            onChange={(event) => setForm((c) => ({ ...c, firstName: event.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="lastName">{t("lastName")}</Label>
          <Input
            id="lastName"
            required
            value={form.lastName}
            onChange={(event) => setForm((c) => ({ ...c, lastName: event.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="type">{t("type")}</Label>
          <select
            id="type"
            value={form.resourceType}
            onChange={(event) =>
              setForm((c) => ({ ...c, resourceType: event.target.value as ResourceType }))
            }
            className="h-9 w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 text-sm focus:border-accent focus:outline-none"
          >
            {RESOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="company">{t("company")}</Label>
          <Input
            id="company"
            value={form.company}
            onChange={(event) => setForm((c) => ({ ...c, company: event.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(event) => setForm((c) => ({ ...c, email: event.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="jobTitle">{t("jobTitle")}</Label>
          <Input
            id="jobTitle"
            value={form.jobTitle}
            onChange={(event) => setForm((c) => ({ ...c, jobTitle: event.target.value }))}
          />
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-end gap-2 border-t border-border-subtle pt-3">
          <div>
            <Label htmlFor="amount">{t("rateAmount")}</Label>
            <Input
              id="amount"
              type="number"
              min={0}
              step="0.01"
              className="w-32"
              value={form.amount}
              onChange={(event) => setForm((c) => ({ ...c, amount: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="unit">{t("rateUnit")}</Label>
            <select
              id="unit"
              value={form.unit}
              onChange={(event) => setForm((c) => ({ ...c, unit: event.target.value as RateUnit }))}
              className="h-9 rounded-(--radius-control) border border-border-subtle bg-surface-solid px-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="DAY">{t("unitLong.DAY")}</option>
              <option value="HOUR">{t("unitLong.HOUR")}</option>
            </select>
          </div>
          <Button type="submit" className="ml-auto" disabled={create.isPending}>
            {t("create")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
