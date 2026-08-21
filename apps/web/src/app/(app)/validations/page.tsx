"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileText, Wallet } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Card, cn } from "@/components/ui";
import { formatEuro } from "@/features/portfolios/shared";
import { api } from "@/lib/api-client";

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

interface DemandValidationItem {
  type: "demand";
  demandId: string;
  reference: string;
  title: string;
  stateKey: string;
  stateLabel: string;
}

interface ValidationsView {
  budget: BudgetValidationItem[];
  demands: DemandValidationItem[];
  total: number;
}

export default function ValidationsPage() {
  const t = useTranslations("validations");
  const locale = useLocale();

  const { data, isLoading } = useQuery({
    queryKey: ["my-validations"],
    queryFn: () => api<ValidationsView>("/me/validations"),
    refetchOnWindowFocus: true,
  });

  const budget = data?.budget ?? [];
  const demands = data?.demands ?? [];
  const empty = !isLoading && data?.total === 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

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
            {budget.map((item) => (
              <Link key={item.requestId} href={`/projects/${item.projectId}/budget`}>
                <Card className="card-hover flex items-center gap-3">
                  <span className="rounded-lg bg-accent/10 p-2 text-accent">
                    <Wallet size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.projectName}</p>
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
                </Card>
              </Link>
            ))}
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
              <Link key={item.demandId} href={`/demands/${item.demandId}`}>
                <Card className="card-hover flex items-center gap-3">
                  <span className="rounded-lg bg-accent/10 p-2 text-accent">
                    <FileText size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted">{item.reference}</span>
                      <span className="truncate font-medium">{item.title}</span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full bg-border-subtle px-2 py-0.5 text-xs font-medium text-muted",
                    )}
                  >
                    {item.stateLabel}
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
