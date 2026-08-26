"use client";

import { useTranslations } from "next-intl";
import { AdminOnly } from "@/features/settings/admin-only";
import { PermissionsMatrix } from "@/features/settings/permissions-matrix";
import { RolesAdmin } from "@/features/settings/roles-admin";

export default function RolesSettingsPage() {
  const t = useTranslations("settings");
  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("roles")}</h1>
        <p className="text-sm text-muted">{t("rolesSubtitle")}</p>
      </div>
      <AdminOnly>
        <RolesAdmin />
        <PermissionsMatrix />
      </AdminOnly>
    </div>
  );
}
