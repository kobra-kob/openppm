"use client";

import { ArrowLeft, Settings2, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";
import { useAuthStore } from "@/lib/auth-store";

/** Paramètres : Compte (tous) + Administration (rôle admin uniquement). */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.roles.includes("admin") ?? false;

  const entries = [
    { href: "/settings/account", key: "settings.account", icon: UserRound, show: true },
    { href: "/settings/admin", key: "settings.admin", icon: Settings2, show: isAdmin },
  ];

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="glass sticky top-14 flex h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col border-r border-border-subtle px-3 py-4">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 px-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} /> {t("workspace.title")}
        </Link>
        <nav className="flex-1 space-y-0.5">
          {entries
            .filter((entry) => entry.show)
            .map(({ href, key, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-(--radius-control) px-2 py-1.5 text-sm transition-colors",
                  pathname.startsWith(href)
                    ? "bg-accent/15 font-medium text-accent"
                    : "text-foreground hover:bg-border-subtle",
                )}
              >
                <Icon size={16} />
                {t(key)}
              </Link>
            ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 p-6">{children}</div>
    </div>
  );
}
