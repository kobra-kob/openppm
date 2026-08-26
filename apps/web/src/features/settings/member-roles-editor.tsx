"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, Button, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";

interface RoleOption {
  id: string;
  key: string | null;
  name: string;
  active: boolean;
  isSystem: boolean;
}

/** Éditeur multi-rôles d'un membre : cases à cocher, rôles cumulables. */
export function MemberRolesEditor({
  memberId,
  currentRoleIds,
  onClose,
}: {
  memberId: string;
  currentRoleIds: string[];
  onClose: () => void;
}) {
  const t = useTranslations("members");
  const tRoles = useTranslations("roles");
  const tErrors = useTranslations("errors");
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set(currentRoleIds));
  const [error, setError] = useState<string | null>(null);

  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api<RoleOption[]>("/roles"),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api(`/members/${memberId}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roleIds: [...selected] }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      onClose();
    },
    onError: (caught: unknown) => {
      const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
      setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
    },
  });

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const assignable = (roles ?? []).filter((r) => r.active);

  return (
    <div className="mt-2 rounded-(--radius-control) border border-border-subtle bg-surface-solid p-3">
      {error && <Alert tone="error" className="mb-2">{error}</Alert>}
      <p className="mb-2 text-xs text-muted">{t("roleEditor.hint")}</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {assignable.map((role) => {
          const checked = selected.has(role.id);
          const label = role.key && tRoles.has(role.key) ? tRoles(role.key) : role.name;
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => toggle(role.id)}
              className={cn(
                "flex items-center gap-2 rounded-(--radius-control) border px-2.5 py-1.5 text-left text-sm transition-colors",
                checked
                  ? "border-accent/40 bg-accent/10 text-foreground"
                  : "border-border-subtle text-muted hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded border text-[10px]",
                  checked ? "border-accent bg-accent text-accent-foreground" : "border-border-subtle",
                )}
              >
                {checked ? "✓" : ""}
              </span>
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {t("roleEditor.save")}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t("roleEditor.cancel")}
        </Button>
      </div>
    </div>
  );
}
