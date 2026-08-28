"use client";

import { useQuery } from "@tanstack/react-query";
import { CreditCard, Users, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, cn } from "@/components/ui";
import { AdminOnly } from "@/features/settings/admin-only";
import { formatEuro } from "@/features/portfolios/shared";
import { api } from "@/lib/api-client";

interface BillingOverview {
  planKey: string;
  planName: string;
  status: string;
  seats: number;
  unitAmount: number;
  currency: string;
  interval: string;
  amount: number;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  TRIALING: "bg-accent/15 text-accent",
  PAST_DUE: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  GRACE_PERIOD: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  SUSPENDED: "bg-danger/15 text-danger",
  CANCELED: "bg-border-subtle text-muted",
  ENTERPRISE: "bg-accent/15 text-accent",
};

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="flex items-center gap-3">
      <span className="rounded-lg bg-accent/10 p-2 text-accent">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
        <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
    </Card>
  );
}

export default function BillingPage() {
  const t = useTranslations("billing");
  const locale = useLocale();
  const { data, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: () => api<BillingOverview>("/billing"),
  });

  const money = (cents: number) => formatEuro(cents / 100, locale);
  const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" }) : "—";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      <AdminOnly>
        {isLoading || !data ? (
          <Card>
            <p className="p-6 text-sm text-muted">{t("loading")}</p>
          </Card>
        ) : (
          <div className="space-y-5">
            {/* Plan + statut */}
            <Card>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-lg bg-accent/10 p-2.5 text-accent">
                  <CreditCard size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">{data.planName}</p>
                  <p className="text-sm text-muted">
                    {money(data.unitAmount)} {t("perSeatPerMonth")}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide",
                    STATUS_TONE[data.status] ?? "bg-border-subtle text-muted",
                  )}
                >
                  {t.has(`status.${data.status}`) ? t(`status.${data.status}`) : data.status}
                </span>
              </div>
            </Card>

            {/* Chiffres clés */}
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                icon={<Users size={18} />}
                label={t("seats")}
                value={String(data.seats)}
                hint={t("billableMembers")}
              />
              <Stat
                icon={<Wallet size={18} />}
                label={t("monthlyAmount")}
                value={money(data.amount)}
                hint={t("seatsTimesPrice", { seats: data.seats, price: money(data.unitAmount) })}
              />
              <Stat
                icon={<CreditCard size={18} />}
                label={data.trialEnd ? t("trialEnds") : t("nextRenewal")}
                value={date(data.trialEnd ?? data.currentPeriodEnd)}
                hint={data.cancelAtPeriodEnd ? t("cancelsAtPeriodEnd") : undefined}
              />
            </div>

            <p className="text-xs text-muted">{t("managedByOrg")}</p>
          </div>
        )}
      </AdminOnly>
    </div>
  );
}
