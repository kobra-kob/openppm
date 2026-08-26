"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  Landmark,
  ShieldCheck,
  Wallet,
  XCircle,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { formatEuro } from "@/features/portfolios/shared";

type RequestStatus = "draft" | "pending" | "approved" | "rejected";
type StepStatus = "pending" | "approved" | "rejected";

interface GovernanceStep {
  id: string;
  stepOrder: number;
  approverRole: string;
  status: StepStatus;
  decidedByName: string | null;
  comment: string | null;
  decidedAt: string | null;
  canDecide: boolean;
}

interface GovernanceRequest {
  id: string;
  amount: number;
  capexAmount: number;
  opexAmount: number;
  justification: string | null;
  status: RequestStatus;
  currentStep: number;
  requestedByName: string;
  createdAt: string;
  steps: GovernanceStep[];
}

interface GovernanceView {
  projectStatus: string;
  hasPortfolio: boolean;
  canRequest: boolean;
  request: GovernanceRequest | null;
}

const REQUEST_BADGE: Record<RequestStatus, string> = {
  draft: "bg-border-subtle text-muted",
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export default function BudgetGovernancePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations("budget");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ capexAmount: "", opexAmount: "", justification: "" });
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["governance", id],
    queryFn: () => api<GovernanceView>(`/projects/${id}/budget`),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["governance", id] });
    void queryClient.invalidateQueries({ queryKey: ["project", id] });
  };

  const onError = (err: unknown) => {
    if (err instanceof ApiError) {
      setError(tErrors.has(err.code) ? tErrors(err.code) : err.message);
    } else {
      setError(tErrors("UNKNOWN"));
    }
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api<GovernanceRequest>(`/projects/${id}/budget/requests`, {
        method: "POST",
        body: JSON.stringify({
          capexAmount: Number(form.capexAmount || 0),
          opexAmount: Number(form.opexAmount || 0),
          justification: form.justification || undefined,
        }),
      }),
    onSuccess: () => {
      setForm({ capexAmount: "", opexAmount: "", justification: "" });
      setError(null);
      refresh();
    },
    onError,
  });

  const decideMutation = useMutation({
    mutationFn: (input: { requestId: string; stepId: string; approve: boolean }) =>
      api<GovernanceRequest>(
        `/projects/${id}/budget/requests/${input.requestId}/steps/${input.stepId}/decide`,
        {
          method: "POST",
          body: JSON.stringify({
            approve: input.approve,
            comment: comments[input.stepId] || undefined,
          }),
        },
      ),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError,
  });

  if (!data) {
    return null;
  }

  const request = data.request;
  const submitRequest = (event: FormEvent) => {
    event.preventDefault();
    createMutation.mutate();
  };

  const total = Number(form.capexAmount || 0) + Number(form.opexAmount || 0);

  return (
    <div className="w-full max-w-4xl space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      {/* Rappel du principe : le budget est piloté par la gouvernance */}
      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-accent" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">{t("intro.title")}</p>
            <p className="text-muted">{t("intro.body")}</p>
          </div>
        </div>
      </Card>

      {!data.hasPortfolio && (
        <Alert tone="warning">{t("noPortfolio")}</Alert>
      )}

      {/* Demande en cours / dernière demande */}
      {request && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-muted" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
                {t("request.title")}
              </h2>
            </div>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                REQUEST_BADGE[request.status],
              )}
            >
              {t(`status.${request.status}`)}
            </span>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-3">
            <Kpi label={t("request.capex")} value={formatEuro(request.capexAmount, locale)} icon={Landmark} />
            <Kpi label={t("request.opex")} value={formatEuro(request.opexAmount, locale)} icon={Wallet} />
            <Kpi label={t("request.total")} value={formatEuro(request.amount, locale)} strong />
          </div>

          {request.justification && (
            <p className="mb-4 rounded-(--radius-control) bg-border-subtle/50 px-3 py-2 text-sm text-muted">
              {request.justification}
            </p>
          )}

          <p className="mb-3 text-xs text-muted">
            {t("request.submittedBy", { name: request.requestedByName })}
          </p>

          {/* Circuit d'approbation étape par étape */}
          <ol className="space-y-3">
            {request.steps.map((step) => (
              <li key={step.id} className="flex gap-3">
                <StepIcon status={step.status} current={step.stepOrder === request.currentStep && request.status === "pending"} />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {t("step.label", {
                        order: step.stepOrder + 1,
                        role: t(`role.${step.approverRole}`),
                      })}
                    </p>
                    {step.decidedByName && (
                      <span className="text-xs text-muted">
                        {t(`step.${step.status}By`, { name: step.decidedByName })}
                      </span>
                    )}
                  </div>
                  {step.comment && (
                    <p className="mt-1 text-xs italic text-muted">« {step.comment} »</p>
                  )}
                  {step.canDecide && (
                    <div className="mt-2 space-y-2">
                      <Input
                        placeholder={t("step.commentPlaceholder")}
                        value={comments[step.id] ?? ""}
                        onChange={(event) =>
                          setComments((c) => ({ ...c, [step.id]: event.target.value }))
                        }
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          disabled={decideMutation.isPending}
                          onClick={() =>
                            decideMutation.mutate({ requestId: request.id, stepId: step.id, approve: true })
                          }
                        >
                          <CheckCircle2 size={15} /> {t("step.approve")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={decideMutation.isPending}
                          onClick={() =>
                            decideMutation.mutate({ requestId: request.id, stepId: step.id, approve: false })
                          }
                        >
                          <Ban size={15} /> {t("step.reject")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {request.status === "approved" && (
            <Alert tone="success" className="mt-4">
              {t("request.approvedNotice", { amount: formatEuro(request.amount, locale) })}
            </Alert>
          )}
        </Card>
      )}

      {/* Formulaire de demande */}
      {data.canRequest ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            {request ? t("form.titleNew") : t("form.title")}
          </h2>
          <form onSubmit={submitRequest} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="capex">{t("request.capex")}</Label>
                <Input
                  id="capex"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.capexAmount}
                  onChange={(event) => setForm((c) => ({ ...c, capexAmount: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="opex">{t("request.opex")}</Label>
                <Input
                  id="opex"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.opexAmount}
                  onChange={(event) => setForm((c) => ({ ...c, opexAmount: event.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="justification">{t("form.justification")}</Label>
              <textarea
                id="justification"
                rows={2}
                maxLength={2000}
                value={form.justification}
                onChange={(event) => setForm((c) => ({ ...c, justification: event.target.value }))}
                className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">
                {t("form.total")} <strong className="text-foreground">{formatEuro(total, locale)}</strong>
              </p>
              <Button type="submit" disabled={createMutation.isPending || total <= 0}>
                {t("form.submit")}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        !request &&
        data.hasPortfolio && <Alert tone="info">{t("cannotRequest")}</Alert>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  strong,
}: {
  label: string;
  value: string;
  icon?: typeof Wallet;
  strong?: boolean;
}) {
  return (
    <div className="rounded-(--radius-control) border border-border-subtle px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted">
        {Icon && <Icon size={12} />} {label}
      </p>
      <p className={cn("mt-0.5 tabular-nums", strong ? "text-lg font-semibold text-accent" : "text-sm font-medium")}>
        {value}
      </p>
    </div>
  );
}

function StepIcon({ status, current }: { status: StepStatus; current: boolean }) {
  if (status === "approved") {
    return <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" />;
  }
  if (status === "rejected") {
    return <XCircle size={18} className="mt-0.5 shrink-0 text-red-500" />;
  }
  if (current) {
    return <Clock size={18} className="mt-0.5 shrink-0 text-amber-500" />;
  }
  return <CircleDashed size={18} className="mt-0.5 shrink-0 text-muted" />;
}
