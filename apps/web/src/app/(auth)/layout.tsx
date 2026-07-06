import { Command } from "lucide-react";
import { useTranslations } from "next-intl";
import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      {/* Fond dégradé doux, type macOS */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-br from-accent/15 via-background to-background dark:from-accent/10"
      />
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <LocaleSwitch />
        <ThemeToggle />
      </div>
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-lg">
          <Command size={26} />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{t("appName")}</h1>
        <p className="text-sm text-muted">{t("tagline")}</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
