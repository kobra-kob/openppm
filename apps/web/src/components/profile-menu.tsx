"use client";

import { LogOut, Settings2, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";

/** Avatar cliquable → menu : Compte, Administration (admin), Déconnexion. */
export function ProfileMenu() {
  const t = useTranslations();
  const router = useRouter();
  const { user, refreshToken, clear } = useAuthStore();
  const [open, setOpen] = useState(false);

  if (!user) {
    return null;
  }
  const isAdmin = user.roles.includes("admin");
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();

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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`${user.firstName} ${user.lastName}`}
        aria-expanded={open}
        className="flex size-8 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent transition-transform hover:scale-105"
      >
        {initials}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div className="glass-strong animate-pop absolute right-0 z-30 mt-2 w-64 origin-top-right rounded-(--radius-card) p-2 shadow-[var(--shadow-pop)]">
            <div className="border-b border-border-subtle px-3 pb-2 pt-1">
              <p className="truncate text-sm font-medium">
                {user.firstName} {user.lastName}
              </p>
              <p className="truncate text-xs text-muted">{user.email}</p>
              <p className="truncate text-xs text-muted">{user.organization.name}</p>
            </div>
            <div className="mt-1 space-y-0.5">
              <Link
                href="/settings/account"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-(--radius-control) px-3 py-2 text-sm transition-colors hover:bg-border-subtle"
              >
                <UserRound size={15} /> {t("settings.account")}
              </Link>
              {isAdmin && (
                <Link
                  href="/settings/members"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-(--radius-control) px-3 py-2 text-sm transition-colors hover:bg-border-subtle"
                >
                  <Settings2 size={15} /> {t("settings.admin")}
                </Link>
              )}
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-2.5 rounded-(--radius-control) px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10"
              >
                <LogOut size={15} /> {t("common.logout")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
