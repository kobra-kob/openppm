"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

const LOCALES = [
  { value: "fr", label: "FR" },
  { value: "en", label: "EN" },
];

export function LocaleSwitch() {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();

  const change = (value: string) => {
    document.cookie = `locale=${value};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };

  return (
    <select
      aria-label={t("language")}
      value={locale}
      onChange={(event) => change(event.target.value)}
      className="rounded-(--radius-control) border border-border-subtle bg-transparent px-2 py-1 text-xs font-medium text-muted hover:text-foreground focus:outline-none"
    >
      {LOCALES.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}
