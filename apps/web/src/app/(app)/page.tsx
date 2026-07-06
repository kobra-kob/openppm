"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, Sparkles, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui";
import { api } from "@/lib/api-client";
import { AuthUser, useAuthStore } from "@/lib/auth-store";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tRoles = useTranslations("roles");
  const cachedUser = useAuthStore((state) => state.user);

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<AuthUser>("/auth/me"),
    initialData: cachedUser ?? undefined,
  });

  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("welcome", { name: user.firstName })}
        </h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2 text-muted">
            <Building2 size={16} />
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              {t("organizationCard")}
            </h2>
          </div>
          <p className="text-lg font-medium">{user.organization.name}</p>
          <p className="mt-1 text-sm text-muted">
            {t("organizationId")} :{" "}
            <span className="font-mono">{user.organization.slug}</span>
          </p>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2 text-muted">
            <UserRound size={16} />
            <h2 className="text-sm font-semibold uppercase tracking-wider">
              {t("profileCard")}
            </h2>
          </div>
          <p className="text-lg font-medium">
            {user.firstName} {user.lastName}
          </p>
          <p className="mt-1 text-sm text-muted">{user.email}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {user.roles.map((role) => (
              <span
                key={role}
                className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent"
              >
                {tRoles.has(role) ? tRoles(role) : role}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-2 flex items-center gap-2 text-muted">
          <Sparkles size={16} />
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            {t("nextSteps")}
          </h2>
        </div>
        <p className="text-sm text-muted">{t("nextStepsBody")}</p>
      </Card>
    </div>
  );
}
