"use client";

import { useTranslations } from "next-intl";
import { AdminOnly } from "@/features/settings/admin-only";
import { OrganizationAdmin } from "@/features/settings/organization-admin";

export default function OrganizationSettingsPage() {
  const t = useTranslations("settings");
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("organization")}</h1>
        <p className="text-sm text-muted">{t("organizationSubtitle")}</p>
      </div>
      <AdminOnly>
        <OrganizationAdmin />
      </AdminOnly>
    </div>
  );
}
