"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";

const LINKS = [
  { href: "/demands", key: "demands", match: (p: string) => p.startsWith("/demands") },
  { href: "/", key: "projects", match: (p: string) => p === "/" || p.startsWith("/projects") },
  { href: "/portfolios", key: "portfolios", match: (p: string) => p.startsWith("/portfolios") },
  { href: "/validations", key: "validations", match: (p: string) => p.startsWith("/validations") },
] as const;

/** Navigation principale de la topbar : onglets soulignés, sobres et sans cadre. */
export function TopNav({ className }: { className?: string }) {
  const t = useTranslations("topNav");
  const pathname = usePathname();
  return (
    <nav className={cn("flex shrink-0 items-center gap-1", className)}>
      {LINKS.map((link) => {
        const active = link.match(pathname);
        return (
          <Link
            key={link.key}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative whitespace-nowrap px-2.5 py-1.5 text-[13px] font-medium transition-colors",
              active ? "text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {t(link.key)}
            <span
              className={cn(
                "pointer-events-none absolute inset-x-2.5 -bottom-0.5 h-0.5 rounded-full bg-accent transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
