"use client";

import { useTranslations } from "next-intl";
import { AdminOnly } from "@/features/settings/admin-only";
import { CategoriesAdmin } from "@/features/settings/categories-admin";

export default function CategoriesSettingsPage() {
  const t = useTranslations("settings");
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("categories")}</h1>
        <p className="text-sm text-muted">{t("categoriesSubtitle")}</p>
      </div>
      <AdminOnly>
        <CategoriesAdmin />
      </AdminOnly>
    </div>
  );
}
