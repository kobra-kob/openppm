"use client";

import { useTranslations } from "next-intl";
import { AdminOnly } from "@/features/settings/admin-only";
import { CommitteeRuleCard } from "@/features/settings/committee-rule-card";
import { WorkflowAdmin } from "@/features/settings/workflow-admin";

export default function WorkflowsSettingsPage() {
  const t = useTranslations("settings");
  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("workflows")}</h1>
        <p className="text-sm text-muted">{t("workflowsSubtitle")}</p>
      </div>
      <AdminOnly>
        <CommitteeRuleCard />
        <WorkflowAdmin />
      </AdminOnly>
    </div>
  );
}
