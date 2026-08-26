"use client";

import { useTranslations } from "next-intl";
import { AdminOnly } from "@/features/settings/admin-only";
import { MembersAdmin } from "@/features/settings/members-admin";

export default function MembersSettingsPage() {
  const t = useTranslations("settings");
  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("members")}</h1>
        <p className="text-sm text-muted">{t("membersSubtitle")}</p>
      </div>
      <AdminOnly>
        <MembersAdmin />
      </AdminOnly>
    </div>
  );
}
