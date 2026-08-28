"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api-client";

interface MeResponse {
  subscriptionActive: boolean;
}

/**
 * Bandeau affiché quand l'organisation courante est en lecture seule (essai
 * expiré / abonnement suspendu). Les écritures sont refusées côté backend ; ce
 * bandeau l'explique et renvoie vers la facturation pour réactiver.
 */
export function SubscriptionBanner() {
  const t = useTranslations("subscriptionBanner");
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => api<MeResponse>("/auth/me") });

  if (!data || data.subscriptionActive) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
      <AlertTriangle size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">{t("message")}</span>
      <Link
        href="/settings/billing"
        className="shrink-0 rounded-(--radius-control) bg-amber-500/20 px-2.5 py-1 text-xs font-medium hover:bg-amber-500/30"
      >
        {t("action")}
      </Link>
    </div>
  );
}
