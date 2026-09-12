"use client";

import {
  ArrowLeft,
  Building2,
  CreditCard,
  GitBranch,
  Shield,
  Tags,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";
import { useAuthStore } from "@/lib/auth-store";

/** Paramètres : Compte (tous) + pages d'administration (rôle admin uniquement). */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.roles.includes("admin") ?? false;

  const entries = [
    { href: "/settings/account", key: "settings.account", icon: UserRound, show: true },
    { href: "/settings/organization", key: "settings.organization", icon: Building2, show: isAdmin },
    { href: "/settings/members", key: "settings.members", icon: UsersRound, show: isAdmin },
    { href: "/settings/roles", key: "settings.roles", icon: Shield, show: isAdmin },
    { href: "/settings/workflows", key: "settings.workflows", icon: GitBranch, show: isAdmin },
    { href: "/settings/categories", key: "settings.categories", icon: Tags, show: isAdmin },
    { href: "/settings/billing", key: "settings.billing", icon: CreditCard, show: isAdmin },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="glass shrink-0 border-b border-border-subtle md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center gap-1 overflow-x-auto px-2 py-2 md:h-full md:flex-col md:items-stretch md:gap-0.5 md:overflow-visible md:px-3 md:py-4">
          <Link
            href="/"
            className="mb-0 mr-1 hidden shrink-0 items-center gap-1.5 px-2 text-sm text-muted transition-colors hover:text-foreground md:mb-4 md:mr-0 md:inline-flex"
          >
            <ArrowLeft size={14} /> {t("workspace.title")}
          </Link>
          {entries
            .filter((entry) => entry.show)
            .map(({ href, key, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-(--radius-control) px-3 py-1.5 text-sm transition-colors md:px-2",
                  pathname.startsWith(href)
                    ? "bg-accent/15 font-medium text-accent"
                    : "text-foreground hover:bg-border-subtle",
                )}
              >
                <Icon size={16} />
                {t(key)}
              </Link>
            ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
    </div>
  );
}
