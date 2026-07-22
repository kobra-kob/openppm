"use client";

import { Command } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { GlobalSearch } from "@/components/global-search";
import { LocaleSwitch } from "@/components/locale-switch";
import { NotificationBell } from "@/components/notification-bell";
import { ProfileMenu } from "@/components/profile-menu";
import { TopNav } from "@/components/top-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuthStore } from "@/lib/auth-store";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * Shell applicatif : topbar seule. La barre latérale n'existe que dans
 * l'espace projet (modules) et les paramètres — pas sur l'accueil.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const hydrated = useHydrated();

  useEffect(() => {
    if (hydrated && !accessToken) {
      router.replace("/login");
    }
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        {t("loading")}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass-strong sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <div className="btn-macos flex size-8 items-center justify-center rounded-[9px] text-accent-foreground">
            <Command size={18} />
          </div>
          <span className="hidden font-semibold tracking-tight sm:block">
            {t("appName")}
          </span>
        </Link>
        <TopNav />
        <div className="mx-2 hidden min-w-0 flex-1 justify-center sm:flex">
          <GlobalSearch />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <NotificationBell />
          <LocaleSwitch />
          <ThemeToggle />
          <ProfileMenu />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
