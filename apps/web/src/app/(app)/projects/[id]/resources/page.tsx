"use client";

import { useQuery } from "@tanstack/react-query";
import { Coins, Timer, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatEuro } from "@/features/portfolios/shared";
import type { ProjectResourceCostView } from "@/features/resources/shared";

/** Coût des ressources d'un projet, agrégé par ressource (calcul backend). */
export default function ProjectResourcesPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations("resources");
  const locale = useLocale();

  const { data } = useQuery({
    queryKey: ["project-resources", id],
    queryFn: () => api<ProjectResourceCostView>(`/projects/${id}/resources`),
  });

  if (!data) {
    return null;
  }

  const money = (value: number) => formatEuro(value, locale);

  return (
    <div className="w-full space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          {t("projectCostTitle")}
        </h2>
        <p className="mt-0.5 text-sm text-muted">{t("projectCostSubtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi icon={Coins} label={t("totalCost")} value={money(data.totalCost)} accent />
        <Kpi
          icon={Timer}
          label={t("totalDays")}
          value={data.totalAllocatedDays.toLocaleString(locale)}
        />
        <Kpi icon={Users} label={t("resourceCount")} value={String(data.resourceCount)} />
      </div>

      <Card>
        {data.perResource.length === 0 ? (
          <p className="py-2 text-sm text-muted">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 font-medium">{t("resource")}</th>
                  <th className="py-2 text-right font-medium">{t("allocation")}</th>
                  <th className="py-2 text-right font-medium">{t("cost")}</th>
                </tr>
              </thead>
              <tbody>
                {data.perResource.map((row) => (
                  <tr key={row.resourceId} className="border-b border-border-subtle/60">
                    <td className="py-2">
                      <Link
                        href={`/resources/${row.resourceId}`}
                        className="text-accent transition-colors hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {t("allocationDays", { days: row.allocationDays })}
                    </td>
                    <td className="py-2 text-right tabular-nums">{money(row.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Link href="/resources" className="inline-block text-sm text-accent hover:underline">
        {t("title")} →
      </Link>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className="!p-3">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
        <Icon size={13} /> {label}
      </p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${accent ? "text-accent" : ""}`}>
        {value}
      </p>
    </Card>
  );
}
