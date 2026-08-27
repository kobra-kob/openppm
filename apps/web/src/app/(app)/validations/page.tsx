"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, FileText, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, Button, Card, cn } from "@/components/ui";
import { formatEuro } from "@/features/portfolios/shared";
import { api, ApiError } from "@/lib/api-client";

interface BudgetValidationItem {
  type: "budget";
  requestId: string;
  projectId: string;
  projectName: string;
  amount: number;
  approverRole: string;
  stepId: string;
  createdAt: string;
}

interface DemandTransitionOption {
  key: string;
  label: string;
  requiresComment: boolean;
}

interface DemandValidationItem {
  type: "demand";
  demandId: string;
  reference: string;
  title: string;
  stateKey: string;
  stateLabel: string;
  transitions: DemandTransitionOption[];
}

interface ValidationsView {
  budget: BudgetValidationItem[];
  demands: DemandValidationItem[];
  total: number;
}

/** Un formulaire de commentaire est en cours pour cette action précise. */
interface PendingComment {
  id: string; // identifiant unique de l'action (clé transition / budget)
  run: (comment: string) => void;
}

export default function ValidationsPage() {
  const t = useTranslations("validations");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingComment | null>(null);
  const [comment, setComment] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["my-validations"],
    queryFn: () => api<ValidationsView>("/me/validations"),
    refetchOnWindowFocus: true,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["my-validations"] });
    void queryClient.invalidateQueries({ queryKey: ["demands"] });
  };
  const onError = (caught: unknown) => {
    const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
    // FORBIDDEN = rôle insuffisant (jeton périmé le plus souvent) → message dédié ;
    // sinon on affiche l'erreur métier traduite si elle existe.
    setError(code === "FORBIDDEN" || !tErrors.has(code) ? t("actionError") : tErrors(code));
  };

  const fireDemand = useMutation({
    mutationFn: (v: { demandId: string; key: string; comment?: string }) =>
      api(`/demands/${v.demandId}/transitions/${v.key}`, {
        method: "POST",
        body: JSON.stringify(v.comment ? { comment: v.comment } : {}),
      }),
    onSuccess: () => {
      setPending(null);
      setComment("");
      setError(null);
      refresh();
    },
    onError,
  });

  const decideBudget = useMutation({
    mutationFn: (v: {
      projectId: string;
      requestId: string;
      stepId: string;
      approve: boolean;
      comment?: string;
    }) =>
      api(
        `/projects/${v.projectId}/budget/requests/${v.requestId}/steps/${v.stepId}/decide`,
        { method: "POST", body: JSON.stringify({ approve: v.approve, comment: v.comment }) },
      ),
    onSuccess: () => {
      setPending(null);
      setComment("");
      setError(null);
      refresh();
    },
    onError,
  });

  const busy = fireDemand.isPending || decideBudget.isPending;
  const budget = data?.budget ?? [];
  const demands = data?.demands ?? [];
  const empty = !isLoading && data?.total === 0;

  /** Lance une action, en demandant d'abord un commentaire s'il est requis. */
  const act = (id: string, requiresComment: boolean, run: (comment: string) => void) => {
    if (requiresComment) {
      setComment("");
      setPending({ id, run });
    } else {
      run("");
    }
  };

  // Fonction de rendu (pas un composant) : l'input conserve son focus entre les
  // frappes car son identité d'élément reste stable d'un rendu à l'autre.
  const renderComment = (id: string) =>
    pending?.id === id ? (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("commentPlaceholder")}
          className="min-w-40 flex-1 rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
        />
        <Button
          disabled={busy || !comment.trim()}
          onClick={() => pending.run(comment.trim())}
          className="px-3 py-1.5 text-xs"
        >
          {t("confirm")}
        </Button>
        <Button variant="ghost" onClick={() => setPending(null)} className="px-3 py-1.5 text-xs">
          {t("cancel")}
        </Button>
      </div>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {empty && (
        <Card>
          <div className="flex flex-col items-center gap-2 p-10 text-muted">
            <CheckCircle2 size={30} />
            <p className="text-sm">{t("empty")}</p>
          </div>
        </Card>
      )}

      {budget.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Wallet size={15} /> {t("budgetSection")}
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-xs tabular-nums text-accent">
              {budget.length}
            </span>
          </h2>
          <div className="space-y-2">
            {budget.map((item) => {
              const rejectId = `b-${item.requestId}-reject`;
              return (
                <Card key={item.requestId}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-lg bg-accent/10 p-2 text-accent">
                      <Wallet size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/projects/${item.projectId}/budget`} className="hover:underline">
                        <p className="truncate font-medium">{item.projectName}</p>
                      </Link>
                      <p className="text-xs text-muted">
                        {t("awaitingRole", {
                          role: t.has(`roles.${item.approverRole}`)
                            ? t(`roles.${item.approverRole}`)
                            : item.approverRole,
                        })}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums font-medium">
                      {formatEuro(item.amount, locale)}
                    </span>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        disabled={busy}
                        onClick={() =>
                          decideBudget.mutate({
                            projectId: item.projectId,
                            requestId: item.requestId,
                            stepId: item.stepId,
                            approve: true,
                          })
                        }
                        className="gap-1.5 px-3 py-1.5 text-xs"
                      >
                        <Check size={14} /> {t("approve")}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={busy}
                        onClick={() =>
                          act(rejectId, true, (c) =>
                            decideBudget.mutate({
                              projectId: item.projectId,
                              requestId: item.requestId,
                              stepId: item.stepId,
                              approve: false,
                              comment: c,
                            }),
                          )
                        }
                        className="gap-1.5 px-3 py-1.5 text-xs"
                      >
                        <X size={14} /> {t("reject")}
                      </Button>
                    </div>
                  </div>
                  {renderComment(rejectId)}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {demands.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
            <FileText size={15} /> {t("demandSection")}
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-xs tabular-nums text-accent">
              {demands.length}
            </span>
          </h2>
          <div className="space-y-2">
            {demands.map((item) => (
              <Card key={item.demandId}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-lg bg-accent/10 p-2 text-accent">
                    <FileText size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/demands/${item.demandId}`} className="hover:underline">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted">{item.reference}</span>
                        <span className="truncate font-medium">{item.title}</span>
                      </div>
                    </Link>
                  </div>
                  <span className="shrink-0 rounded-full bg-border-subtle px-2 py-0.5 text-xs font-medium text-muted">
                    {item.stateLabel}
                  </span>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {item.transitions.map((tr) => {
                      const actionId = `d-${item.demandId}-${tr.key}`;
                      return (
                        <Button
                          key={tr.key}
                          variant={tr.requiresComment ? "danger" : "primary"}
                          disabled={busy}
                          onClick={() =>
                            act(actionId, tr.requiresComment, (c) =>
                              fireDemand.mutate({
                                demandId: item.demandId,
                                key: tr.key,
                                comment: c || undefined,
                              }),
                            )
                          }
                          className="px-3 py-1.5 text-xs"
                        >
                          {tr.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                {item.transitions.map((tr) => (
                  <div key={tr.key}>{renderComment(`d-${item.demandId}-${tr.key}`)}</div>
                ))}
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
