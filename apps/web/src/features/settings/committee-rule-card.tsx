"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, Card, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";

interface Governance {
  committeeRuleEnabled: boolean;
}

/** Règle de gouvernance : comité d'investissement conditionnel au budget (admin). */
export function CommitteeRuleCard() {
  const t = useTranslations("governance");
  const tErrors = useTranslations("errors");
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["organization-governance"],
    queryFn: () => api<Governance>("/organization/governance"),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api<Governance>("/organization/governance", {
        method: "PATCH",
        body: JSON.stringify({ committeeRuleEnabled: enabled }),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(["organization-governance"], result);
      void queryClient.invalidateQueries({ queryKey: ["organization-governance"] });
    },
  });

  const enabled = data?.committeeRuleEnabled ?? false;
  const errorText =
    toggle.error instanceof ApiError && tErrors.has(toggle.error.code)
      ? tErrors(toggle.error.code)
      : null;

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2 text-muted">
        <Landmark size={16} />
        <h2 className="text-sm font-semibold uppercase tracking-wider">{t("title")}</h2>
      </div>
      {errorText && (
        <div className="mb-3">
          <Alert tone="error">{errorText}</Alert>
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("committeeRule")}</p>
          <p className="mt-0.5 text-sm text-muted">
            {enabled ? t("enabledHint") : t("disabledHint")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("committeeRule")}
          disabled={data === undefined || toggle.isPending}
          onClick={() => toggle.mutate(!enabled)}
          className={cn(
            "inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50",
            enabled ? "bg-accent" : "bg-border-strong",
          )}
        >
          <span
            className={cn(
              "size-5 rounded-full bg-white shadow transition-transform duration-200 ease-out",
              enabled ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>
    </Card>
  );
}
