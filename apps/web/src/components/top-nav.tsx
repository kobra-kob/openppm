"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";

const LINKS = [
  { href: "/", key: "projects", match: (p: string) => p === "/" || p.startsWith("/projects") },
  { href: "/portfolios", key: "portfolios", match: (p: string) => p.startsWith("/portfolios") },
] as const;

/** Navigation principale de la topbar : Projets / Portefeuilles. */
export function TopNav() {
  const t = useTranslations("topNav");
  const pathname = usePathname();
  return (
    <nav className="flex shrink-0 items-center gap-1">
      {LINKS.map((link) => (
        <Link
          key={link.key}
          href={link.href}
          className={cn(
            "whitespace-nowrap rounded-(--radius-control) px-2.5 py-1.5 text-sm font-medium transition-colors",
            link.match(pathname)
              ? "bg-accent/15 text-accent"
              : "text-muted hover:text-foreground",
          )}
        >
          {t(link.key)}
        </Link>
      ))}
    </nav>
  );
}
