"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ui";
import { api } from "@/lib/api-client";
import { SessionPayload, useAuthStore } from "@/lib/auth-store";

interface OrgOption {
  id: string;
  name: string;
  slug: string;
  isOwner: boolean;
}
interface MeResponse {
  organizationId: string;
  organization: { id: string; name: string; slug: string };
  organizations: OrgOption[];
}

/**
 * Sélecteur d'organisation courante (tenant). Le changement passe par le backend
 * (`/auth/switch-organization`), qui vérifie le membership et ré-émet un jeton :
 * le front ne peut jamais imposer une organisation.
 */
export function OrganizationSwitcher() {
  const { data } = useQuery({ queryKey: ["me"], queryFn: () => api<MeResponse>("/auth/me") });
  const setSession = useAuthStore((s) => s.setSession);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const orgs = data?.organizations ?? [];
  const currentId = data?.organizationId;
  const current = orgs.find((o) => o.id === currentId) ?? data?.organization;
  const multi = orgs.length > 1;

  const switchOrg = useMutation({
    mutationFn: (organizationId: string) =>
      api<SessionPayload>("/auth/switch-organization", {
        method: "POST",
        body: JSON.stringify({ organizationId }),
      }),
    onSuccess: (session) => {
      setSession(session);
      setOpen(false);
      queryClient.clear();
      // Rechargement complet : tout le contenu se recharge dans le nouveau tenant.
      window.location.href = "/";
    },
  });

  if (!current) {
    return null;
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => multi && setOpen((o) => !o)}
        className={cn(
          "flex max-w-[190px] items-center gap-1.5 rounded-(--radius-control) px-2 py-1.5 text-sm font-medium transition-colors",
          multi ? "hover:bg-border-subtle" : "cursor-default",
        )}
        aria-haspopup={multi ? "menu" : undefined}
        title={current.name}
      >
        <Building2 size={15} className="shrink-0 text-muted" />
        <span className="truncate">{current.name}</span>
        {multi && <ChevronDown size={14} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />}
      </button>

      {open && multi && (
        <>
          <button
            type="button"
            aria-label="Fermer"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="glass-strong absolute left-0 z-50 mt-1 w-64 rounded-(--radius-card) border border-border-subtle p-1 shadow-lg">
            {orgs.map((org) => (
              <button
                key={org.id}
                type="button"
                disabled={switchOrg.isPending}
                onClick={() => (org.id === currentId ? setOpen(false) : switchOrg.mutate(org.id))}
                className={cn(
                  "flex w-full items-center gap-2 rounded-(--radius-control) px-2.5 py-2 text-left text-sm transition-colors hover:bg-border-subtle",
                  org.id === currentId && "font-medium",
                )}
              >
                <Building2 size={15} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{org.name}</span>
                {org.isOwner && (
                  <span className="shrink-0 rounded-full bg-border-subtle px-1.5 text-[10px] uppercase tracking-wide text-muted">
                    owner
                  </span>
                )}
                {org.id === currentId && <Check size={15} className="shrink-0 text-accent" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
