"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui";
import { useAuthStore } from "@/lib/auth-store";

/**
 * Réserve un contenu de paramètres au rôle administrateur. La navigation masque
 * déjà ces entrées, mais l'accès direct par URL doit rester gardé.
 */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const tSettings = useTranslations("settings");
  const isAdmin = useAuthStore((state) => state.user?.roles.includes("admin") ?? false);
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl">
        <Alert tone="error">{tSettings("adminForbidden")}</Alert>
      </div>
    );
  }
  return <>{children}</>;
}
