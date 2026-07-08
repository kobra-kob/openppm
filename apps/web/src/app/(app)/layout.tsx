"use client";

import {
  Command,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/components/ui";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { useHydrated } from "@/lib/use-hydrated";

const NAV_SECTIONS = [
  {
    key: "sectionSteering",
    items: [
      { href: "/", key: "dashboard", icon: LayoutDashboard },
      { href: "/projects", key: "projects", icon: FolderKanban },
    ],
  },
  {
    key: "sectionOrganization",
    items: [{ href: "/members", key: "members", icon: UsersRound }],
  },
  {
    key: "sectionAccount",
    items: [{ href: "/settings/security", key: "security", icon: ShieldCheck }],
  },
] as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { user, accessToken, refreshToken, clear } = useAuthStore();
  const hydrated = useHydrated();

  useEffect(() => {
    if (hydrated && !accessToken) {
      router.replace("/login");
    }
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        {t("common.loading")}
      </div>
    );
  }

  const logout = async () => {
    try {
      await api("/auth/logout", {
        method: "POST",
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      });
    } finally {
      clear();
      router.replace("/login");
    }
  };

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : "?";

  return (
    <div className="flex min-h-screen">
      {/* Sidebar type Finder */}
      <aside className="glass sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border-subtle px-3 py-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Command size={18} />
          </div>
          <span className="font-semibold tracking-tight">{t("common.appName")}</span>
        </div>
        <nav className="flex-1 space-y-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.key}>
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {t(`nav.${section.key}`)}
              </p>
              {section.items.map(({ href, key, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-(--radius-control) px-2 py-1.5 text-sm transition-colors",
                    pathname === href || (href !== "/" && pathname.startsWith(href))
                      ? "bg-accent/15 font-medium text-accent"
                      : "text-foreground hover:bg-border-subtle",
                  )}
                >
                  <Icon size={16} />
                  {t(`nav.${key}`)}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-border-subtle pt-3">
          <div className="flex items-center gap-2 px-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-xs text-muted">{user?.organization.name}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              aria-label={t("common.logout")}
              className="rounded-full p-1.5 text-muted transition-colors hover:bg-border-subtle hover:text-danger"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="glass sticky top-0 z-10 flex h-14 items-center justify-end gap-2 border-b border-border-subtle px-4">
          <LocaleSwitch />
          <ThemeToggle />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
