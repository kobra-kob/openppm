"use client";

import { Command } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { GlobalSearch } from "@/components/global-search";
import { LocaleSwitch } from "@/components/locale-switch";
import { NotificationBell } from "@/components/notification-bell";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { ProfileMenu } from "@/components/profile-menu";
import { SubscriptionBanner } from "@/components/subscription-banner";
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
      <div className="glass-strong sticky top-0 z-10 border-b border-border-subtle">
        <header className="flex h-14 items-center gap-2 px-3 sm:px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <div className="btn-macos flex size-8 items-center justify-center rounded-[9px] text-accent-foreground">
              <Command size={18} />
            </div>
            <span className="hidden font-semibold tracking-tight sm:block">
              {t("appName")}
            </span>
          </Link>
          <span className="mx-2 hidden h-6 w-px shrink-0 bg-border-subtle sm:block" />
          <OrganizationSwitcher />
          <span className="mx-2 hidden h-6 w-px shrink-0 bg-border-subtle md:block lg:mx-4" />
          {/* Onglets en ligne sur desktop, repliés en 2e rangée sur mobile */}
          <TopNav className="hidden md:flex" />
          <div className="flex min-w-0 flex-1 justify-center">
            <div className="hidden w-full max-w-md lg:block">
              <GlobalSearch />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <NotificationBell />
            <LocaleSwitch />
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </header>
        {/* Navigation mobile : rangée dédiée, défilement horizontal */}
        <div className="flex overflow-x-auto border-t border-border-subtle px-2 py-1 md:hidden">
          <TopNav />
        </div>
      </div>
      <SubscriptionBanner />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
