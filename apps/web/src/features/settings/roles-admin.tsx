"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Lock, Plus, Shield, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useMemo, useState } from "react";
import { Alert, Button, Card, Input, Label, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";

interface Permission {
  key: string;
  subject: string;
  action: string;
}
interface Role {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  active: boolean;
  permissionKeys: string[];
  userCount: number;
}

/** Administration des rôles et de leurs permissions (Paramètres → Rôles). */
export function RolesAdmin() {
  const t = useTranslations("rolesAdmin");
  const tRoles = useTranslations("roles");
  const tErrors = useTranslations("errors");
  const queryClient = useQueryClient();

  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => api<Role[]>("/roles") });
  const { data: permissions } = useQuery({
    queryKey: ["permissions"],
    queryFn: () => api<Permission[]>("/permissions"),
  });

  /** Permissions groupées par sujet, pour l'affichage en grille. */
  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions ?? []) {
      const list = map.get(p.subject) ?? [];
      list.push(p);
      map.set(p.subject, list);
    }
    return [...map.entries()];
  }, [permissions]);

  const onError = (caught: unknown) => {
    const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
    setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
  };
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["roles"] });

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted">
          <Shield size={16} />
          <h2 className="text-sm font-semibold uppercase tracking-wider">{t("title")}</h2>
        </div>
        {!creating && (
          <Button variant="ghost" onClick={() => { setCreating(true); setError(null); }}>
            <Plus size={15} /> {t("new")}
          </Button>
        )}
      </div>

      {error && <Alert tone="error" className="mb-3">{error}</Alert>}

      {creating && (
        <RoleEditor
          grouped={grouped}
          onCancel={() => setCreating(false)}
          onSaved={() => { setCreating(false); refresh(); }}
          onError={onError}
        />
      )}

      <ul className="divide-y divide-border-subtle">
        {(roles ?? []).map((role) => {
          const open = openId === role.id;
          return (
            <li key={role.id} className="py-2.5">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : role.id)}
                className="flex w-full items-center gap-3 text-left"
              >
                <span className="flex-1 truncate text-sm font-medium">
                  {role.key && tRoles.has(role.key) ? tRoles(role.key) : role.name}
                </span>
                {role.isSystem && (
                  <span className="rounded-full bg-border-subtle px-2 py-0.5 text-[11px] text-muted">
                    {t("system")}
                  </span>
                )}
                {!role.active && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                    {t("inactive")}
                  </span>
                )}
                <span className="text-xs text-muted">{t("permCount", { n: role.permissionKeys.length })}</span>
                <span className="text-xs text-muted">{t("userCount", { n: role.userCount })}</span>
                <ChevronDown size={16} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
              </button>
              {open && (
                <div className="mt-3">
                  <RoleEditor
                    role={role}
                    grouped={grouped}
                    onCancel={() => setOpenId(null)}
                    onSaved={() => { setOpenId(null); refresh(); }}
                    onError={onError}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function RoleEditor({
  role,
  grouped,
  onCancel,
  onSaved,
  onError,
}: {
  role?: Role;
  grouped: Array<[string, Permission[]]>;
  onCancel: () => void;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const t = useTranslations("rolesAdmin");
  const tPerm = useTranslations("permissions");
  const isAdminRole = role?.key === "admin";
  const isSystem = role?.isSystem ?? false;

  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [active, setActive] = useState(role?.active ?? true);
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissionKeys ?? []));

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const saveMutation = useMutation({
    mutationFn: () => {
      const permissionKeys = [...selected];
      if (role) {
        const body: Record<string, unknown> = { permissionKeys, description: description || null };
        if (!isSystem) {
          body.name = name;
          body.active = active;
        }
        return api<Role>(`/roles/${role.id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      return api<Role>("/roles", {
        method: "POST",
        body: JSON.stringify({ name, description: description || undefined, permissionKeys }),
      });
    },
    onSuccess: onSaved,
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api<void>(`/roles/${role!.id}`, { method: "DELETE" }),
    onSuccess: onSaved,
    onError,
  });

  const label = (subject: string, action: string) =>
    (tPerm.has(`subject.${subject}`) ? tPerm(`subject.${subject}`) : subject) +
    " · " +
    (tPerm.has(`action.${action}`) ? tPerm(`action.${action}`) : action);

  return (
    <form
      className="space-y-3 rounded-(--radius-control) border border-border-subtle bg-surface-solid/40 p-3"
      onSubmit={(e: FormEvent) => { e.preventDefault(); saveMutation.mutate(); }}
    >
      {isAdminRole ? (
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Lock size={14} /> {t("adminImmutable")}
        </p>
      ) : (
        <>
          {!isSystem && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="rName">{t("name")}</Label>
                <Input id="rName" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                {t("activeLabel")}
              </label>
            </div>
          )}
          <div>
            <Label htmlFor="rDesc">{t("description")}</Label>
            <Input id="rDesc" maxLength={255} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div>
            <Label className="mb-1">{t("permissions")}</Label>
            <div className="space-y-2">
              {grouped.map(([subject, perms]) => (
                <div key={subject} className="rounded-(--radius-control) border border-border-subtle p-2">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                    {tPerm.has(`subject.${subject}`) ? tPerm(`subject.${subject}`) : subject}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {perms.map((p) => (
                      <label key={p.key} className="flex items-center gap-1.5 text-sm" title={label(p.subject, p.action)}>
                        <input type="checkbox" checked={selected.has(p.key)} onChange={() => toggle(p.key)} />
                        {tPerm.has(`action.${p.action}`) ? tPerm(`action.${p.action}`) : p.action}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={saveMutation.isPending}>{t("save")}</Button>
            <Button type="button" variant="ghost" onClick={onCancel}>{t("cancel")}</Button>
            {role && !isSystem && role.userCount === 0 && (
              <Button
                type="button"
                variant="danger"
                onClick={() => deleteMutation.mutate()}
                className="ml-auto"
              >
                <Trash2 size={15} /> {t("delete")}
              </Button>
            )}
          </div>
        </>
      )}
    </form>
  );
}
