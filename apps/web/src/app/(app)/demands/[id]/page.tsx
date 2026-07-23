"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, CheckCircle2, History, Lock, Pencil, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { formatEuro } from "@/features/portfolios/shared";
import { BusinessCasePanel } from "@/features/demands/business-case-panel";
import {
  DemandDetailView,
  DemandUrgency,
  stateBadgeClass,
  URGENCY_BADGE,
  WorkflowState,
} from "@/features/demands/shared";

interface PortfolioOption {
  id: string;
  name: string;
}

const URGENCIES: DemandUrgency[] = ["low", "medium", "high", "critical"];

export default function DemandDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations("demands");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [tab, setTab] = useState<"detail" | "businessCase">("detail");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    objectives: "",
    justification: "",
    department: "",
    urgency: "medium" as DemandUrgency,
    priority: "3",
    estimatedBudget: "",
    estimatedDurationDays: "",
    targetPortfolioId: "",
    tags: "",
  });

  const { data: demand } = useQuery({
    queryKey: ["demand", id],
    queryFn: () => api<DemandDetailView>(`/demands/${id}`),
  });
  const { data: portfolios } = useQuery({
    queryKey: ["portfolios"],
    queryFn: () => api<PortfolioOption[]>("/portfolios"),
    enabled: editing,
  });

  const onError = (err: unknown) => {
    const code = err instanceof ApiError ? err.code : "UNKNOWN";
    setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
  };
  const onData = (fresh: DemandDetailView) => {
    setError(null);
    queryClient.setQueryData(["demand", id], fresh);
    void queryClient.invalidateQueries({ queryKey: ["demands"] });
  };

  const transitionMutation = useMutation({
    mutationFn: (transitionKey: string) =>
      api<DemandDetailView>(`/demands/${id}/transitions/${transitionKey}`, {
        method: "POST",
        body: JSON.stringify({ comment: comment.trim() || undefined }),
      }),
    onSuccess: (fresh) => {
      onData(fresh);
      setComment("");
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api<DemandDetailView>(`/demands/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title,
          description: form.description || null,
          objectives: form.objectives || null,
          justification: form.justification || null,
          department: form.department || null,
          urgency: form.urgency,
          priority: Number(form.priority),
          estimatedBudget: form.estimatedBudget ? Number(form.estimatedBudget) : null,
          estimatedDurationDays: form.estimatedDurationDays
            ? Number(form.estimatedDurationDays)
            : null,
          targetPortfolioId: form.targetPortfolioId || null,
          tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      }),
    onSuccess: (fresh) => {
      onData(fresh);
      setEditing(false);
    },
    onError,
  });

  const removeMutation = useMutation({
    mutationFn: () => api<void>(`/demands/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["demands"] });
      router.push("/demands");
    },
    onError,
  });

  if (!demand) {
    return null;
  }

  const wf = demand.workflow;
  const rejected = wf.currentState.kind === "final_ko";
  // Piste principale (hors état de rejet) pour l'indicateur d'étapes
  const track = wf.states
    .filter((s) => s.kind !== "final_ko")
    .sort((a, b) => a.position - b.position);
  const currentIndex = track.findIndex((s) => s.key === wf.currentState.key);

  const startEditing = () => {
    setForm({
      title: demand.title,
      description: demand.description ?? "",
      objectives: demand.objectives ?? "",
      justification: demand.justification ?? "",
      department: demand.department ?? "",
      urgency: demand.urgency,
      priority: String(demand.priority),
      estimatedBudget: demand.estimatedBudget !== null ? String(demand.estimatedBudget) : "",
      estimatedDurationDays:
        demand.estimatedDurationDays !== null ? String(demand.estimatedDurationDays) : "",
      targetPortfolioId: demand.targetPortfolio?.id ?? "",
      tags: demand.tags.join(", "),
    });
    setEditing(true);
    setError(null);
  };

  const money = (v: number) => formatEuro(v, locale);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
      <Link
        href="/demands"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} /> {t("back")}
      </Link>

      {error && <Alert tone="error">{error}</Alert>}

      {/* En-tête + indicateur d'étapes */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted">{demand.reference}</span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  stateBadgeClass(wf.currentState.kind),
                )}
              >
                {wf.currentState.label}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  URGENCY_BADGE[demand.urgency],
                )}
              >
                {t(`urgency.${demand.urgency}`)}
              </span>
            </div>
            <h1 className="mt-1 text-xl font-semibold">{demand.title}</h1>
            <p className="text-sm text-muted">
              {t("byRequester", { name: demand.requester.name })}
            </p>
          </div>
          {demand.canEdit && !editing && (
            <Button variant="ghost" onClick={startEditing}>
              <Pencil size={15} /> {t("edit")}
            </Button>
          )}
        </div>

        {rejected ? (
          <Alert tone="error" className="mt-4">
            {t("rejectedNotice")}
          </Alert>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-1">
            {track.map((state, index) => (
              <StepPill
                key={state.key}
                state={state}
                done={index < currentIndex}
                current={index === currentIndex}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Onglets Détail / Business Case */}
      <div className="flex gap-1 border-b border-border-subtle">
        {(["detail", "businessCase"] as const).map((value) => (
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
            {value === "detail" ? t("tabDetail") : t("tabBusinessCase")}
          </button>
        ))}
      </div>

      {tab === "businessCase" && <BusinessCasePanel demandId={id} />}

      {tab === "detail" && (
        <>
      {/* Édition en ligne */}
      {editing && (
        <Card>
          <form
            className="space-y-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              updateMutation.mutate();
            }}
          >
            <div>
              <Label htmlFor="eTitle">{t("form.title")}</Label>
              <Input
                id="eTitle"
                required
                value={form.title}
                onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("form.objectives")}>
                <TextArea value={form.objectives} onChange={(v) => setForm((c) => ({ ...c, objectives: v }))} />
              </Field>
              <Field label={t("form.justification")}>
                <TextArea value={form.justification} onChange={(v) => setForm((c) => ({ ...c, justification: v }))} />
              </Field>
            </div>
            <Field label={t("form.description")}>
              <TextArea value={form.description} onChange={(v) => setForm((c) => ({ ...c, description: v }))} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="eDept">{t("form.department")}</Label>
                <Input id="eDept" value={form.department} onChange={(e) => setForm((c) => ({ ...c, department: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="eUrg">{t("form.urgency")}</Label>
                <FieldSelect id="eUrg" value={form.urgency} onChange={(v) => setForm((c) => ({ ...c, urgency: v as DemandUrgency }))}>
                  {URGENCIES.map((u) => (
                    <option key={u} value={u}>{t(`urgency.${u}`)}</option>
                  ))}
                </FieldSelect>
              </div>
              <div>
                <Label htmlFor="ePrio">{t("form.priority")}</Label>
                <FieldSelect id="ePrio" value={form.priority} onChange={(v) => setForm((c) => ({ ...c, priority: v }))}>
                  {[1, 2, 3, 4, 5].map((p) => (
                    <option key={p} value={p}>P{p}</option>
                  ))}
                </FieldSelect>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="eBudget">{t("form.estimatedBudget")}</Label>
                <Input id="eBudget" type="number" min={0} step="1000" value={form.estimatedBudget} onChange={(e) => setForm((c) => ({ ...c, estimatedBudget: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="eDur">{t("form.estimatedDuration")}</Label>
                <Input id="eDur" type="number" min={0} value={form.estimatedDurationDays} onChange={(e) => setForm((c) => ({ ...c, estimatedDurationDays: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="ePf">{t("form.targetPortfolio")}</Label>
                <FieldSelect id="ePf" value={form.targetPortfolioId} onChange={(v) => setForm((c) => ({ ...c, targetPortfolioId: v }))}>
                  <option value="">{t("form.noPortfolio")}</option>
                  {(portfolios ?? []).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </FieldSelect>
              </div>
            </div>
            <div>
              <Label htmlFor="eTags">{t("form.tags")}</Label>
              <Input id="eTags" placeholder={t("form.tagsHint")} value={form.tags} onChange={(e) => setForm((c) => ({ ...c, tags: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={updateMutation.isPending}>{t("form.save")}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>{t("form.cancel")}</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Informations */}
      {!editing && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
              {t("infoTitle")}
            </h2>
            <dl className="space-y-2 text-sm">
              <Row label={t("form.department")} value={demand.department ?? "—"} />
              <Row label={t("form.priority")} value={`P${demand.priority}`} />
              <Row
                label={t("form.estimatedBudget")}
                value={demand.estimatedBudget !== null ? money(demand.estimatedBudget) : "—"}
              />
              <Row
                label={t("form.estimatedDuration")}
                value={
                  demand.estimatedDurationDays !== null
                    ? t("days", { count: demand.estimatedDurationDays })
                    : "—"
                }
              />
              <Row label={t("form.targetPortfolio")} value={demand.targetPortfolio?.name ?? "—"} />
            </dl>
            {demand.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {demand.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-border-subtle px-2 py-0.5 text-xs text-muted">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-3 text-sm">
            <Block title={t("form.objectives")} text={demand.objectives} empty={t("none")} />
            <Block title={t("form.justification")} text={demand.justification} empty={t("none")} />
            <Block title={t("form.description")} text={demand.description} empty={t("none")} />
          </Card>
        </div>
      )}

      {/* Actions de workflow */}
      {!editing && (wf.available.length > 0 || demand.canEdit) && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            {t("actionsTitle")}
          </h2>
          {wf.available.length === 0 ? (
            <p className="text-sm text-muted">{t("noAction")}</p>
          ) : (
            <div className="space-y-3">
              {wf.available.some((tr) => tr.requiresComment) && (
                <Input
                  placeholder={t("commentPlaceholder")}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              )}
              <div className="flex flex-wrap gap-2">
                {wf.available.map((tr) => {
                  const isReject = tr.key.startsWith("reject");
                  const isSubmit = tr.key === "submit";
                  return (
                    <Button
                      key={tr.key}
                      type="button"
                      variant={isReject ? "ghost" : "primary"}
                      disabled={transitionMutation.isPending}
                      onClick={() => transitionMutation.mutate(tr.key)}
                    >
                      {isReject ? <Ban size={15} /> : isSubmit ? <Send size={15} /> : <CheckCircle2 size={15} />}
                      {tr.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
          {demand.canEdit && wf.currentState.key === "draft" && (
            <div className="mt-3 border-t border-border-subtle pt-3">
              <Button type="button" variant="ghost" onClick={() => removeMutation.mutate()}>
                <Trash2 size={15} /> {t("delete")}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Historique */}
      <Card>
        <div className="mb-3 flex items-center gap-2 text-muted">
          <History size={16} />
          <h2 className="text-sm font-semibold uppercase tracking-wider">{t("historyTitle")}</h2>
        </div>
        <ol className="space-y-3">
          {[...wf.history].reverse().map((entry, index) => {
            const stateLabel =
              wf.states.find((s) => s.key === entry.toStateKey)?.label ?? entry.toStateKey;
            return (
              <li key={index} className="flex gap-3 text-sm">
                <div className="mt-1 size-2 shrink-0 rounded-full bg-accent" />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{stateLabel}</span>
                    <span className="text-xs tabular-nums text-muted">
                      {new Date(entry.createdAt).toLocaleString(locale)}
                    </span>
                  </div>
                  {entry.actorName && (
                    <p className="text-xs text-muted">{entry.actorName}</p>
                  )}
                  {entry.comment && (
                    <p className="mt-1 text-xs italic text-muted">« {entry.comment} »</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
        </>
      )}
    </div>
  );
}

function StepPill({
  state,
  done,
  current,
}: {
  state: WorkflowState;
  done: boolean;
  current: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
        current
          ? "bg-accent text-accent-foreground"
          : done
            ? "bg-accent/15 text-accent"
            : "bg-border-subtle text-muted",
      )}
    >
      {state.kind === "final_ok" && current && <Lock size={11} />}
      {state.label}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Block({ title, text, empty }: { title: string; text: string | null; empty: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-foreground">{text || <span className="text-muted">{empty}</span>}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function TextArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      rows={2}
      maxLength={10000}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
    />
  );
}

function FieldSelect({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-[7px] text-sm focus:border-accent focus:outline-none"
    >
      {children}
    </select>
  );
}
