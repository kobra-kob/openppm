"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";

const LINKS = [
  { href: "/", key: "projects", match: (p: string) => p === "/" || p.startsWith("/projects") },
  { href: "/demands", key: "demands", match: (p: string) => p.startsWith("/demands") },
  { href: "/portfolios", key: "portfolios", match: (p: string) => p.startsWith("/portfolios") },
] as const;

/** Navigation principale de la topbar : Projets / Demandes / Portefeuilles. */
export function TopNav() {
  const t = useTranslations("topNav");
  const pathname = usePathname();
  return (
    <nav className="flex shrink-0 items-center gap-0.5 rounded-[10px] bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] p-[3px]">
      {LINKS.map((link) => {
        const active = link.match(pathname);
        return (
          <Link
            key={link.key}
            href={link.href}
            className={cn(
              "whitespace-nowrap rounded-[7px] px-3 py-1 text-[13px] font-medium transition-all",
              active
                ? "bg-surface-solid text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.14)]"
                : "text-muted hover:text-foreground",
            )}
          >
            {t(link.key)}
          </Link>
        );
      })}
    </nav>
  );
}
