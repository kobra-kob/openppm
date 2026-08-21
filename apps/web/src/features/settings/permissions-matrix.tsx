"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Grid3x3, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Card, cn } from "@/components/ui";
import { api } from "@/lib/api-client";

interface Permission {
  key: string;
  subject: string;
  action: string;
}
interface Role {
  id: string;
  key: string | null;
  name: string;
  active: boolean;
  permissionKeys: string[];
}

/**
 * Matrice des responsabilités (lecture seule) : permissions en lignes (groupées
 * par sujet), rôles en colonnes, une coche marque une permission accordée. Les
 * données proviennent des endpoints /roles et /permissions déjà utilisés par
 * l'éditeur de rôles (React Query mutualise les requêtes).
 */
export function PermissionsMatrix() {
  const t = useTranslations("permissionsMatrix");
  const tPerm = useTranslations("permissions");
  const tRoles = useTranslations("roles");

  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => api<Role[]>("/roles") });
  const { data: permissions } = useQuery({
    queryKey: ["permissions"],
    queryFn: () => api<Permission[]>("/permissions"),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions ?? []) {
      const list = map.get(p.subject) ?? [];
      list.push(p);
      map.set(p.subject, list);
    }
    return [...map.entries()];
  }, [permissions]);

  const visibleRoles = (roles ?? []).filter((r) => r.active);
  const roleLabel = (r: Role) => (r.key && tRoles.has(r.key) ? tRoles(r.key) : r.name);
  const actionLabel = (action: string) =>
    tPerm.has(`action.${action}`) ? tPerm(`action.${action}`) : action;
  const subjectLabel = (subject: string) =>
    tPerm.has(`subject.${subject}`) ? tPerm(`subject.${subject}`) : subject;

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2 text-muted">
        <Grid3x3 size={16} />
        <h2 className="text-sm font-semibold uppercase tracking-wider">{t("title")}</h2>
      </div>
      <p className="mb-3 text-xs text-muted">{t("subtitle")}</p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface-solid p-2 text-left text-xs font-semibold text-muted">
                {t("permission")}
              </th>
              {visibleRoles.map((role) => (
                <th
                  key={role.id}
                  className="whitespace-nowrap p-2 text-center text-xs font-medium text-muted"
                  title={roleLabel(role)}
                >
                  {roleLabel(role)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(([subject, perms]) => (
              <SubjectRows
                key={subject}
                subject={subjectLabel(subject)}
                perms={perms}
                roles={visibleRoles}
                actionLabel={actionLabel}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SubjectRows({
  subject,
  perms,
  roles,
  actionLabel,
}: {
  subject: string;
  perms: Permission[];
  roles: Role[];
  actionLabel: (action: string) => string;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={roles.length + 1}
          className="sticky left-0 bg-border-subtle/40 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted"
        >
          {subject}
        </td>
      </tr>
      {perms.map((perm) => (
        <tr key={perm.key} className="border-t border-border-subtle">
          <td className="sticky left-0 z-10 whitespace-nowrap bg-surface-solid p-2 text-left">
            {actionLabel(perm.action)}
          </td>
          {roles.map((role) => {
            const granted = role.permissionKeys.includes(perm.key);
            return (
              <td key={role.id} className="p-2 text-center">
                {granted ? (
                  <Check size={15} className="mx-auto text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Minus size={13} className={cn("mx-auto text-muted/40")} />
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
