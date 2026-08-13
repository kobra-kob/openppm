"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, Tags, Trash2, UsersRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { RolesAdmin } from "@/features/settings/roles-admin";

interface Member {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: string[];
}

interface PendingInvitation {
  id: string;
  email: string;
  roleKey: string | null;
  roleName: string;
  invitedByName: string;
  expiresAt: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
}

const INVITABLE_ROLES = [
  "admin",
  "manager",
  "project_manager",
  "pmo",
  "finance",
  "business_analyst",
  "executive",
  "employee",
  "observer",
  "guest",
];

/** Administration de l'application — réservée au rôle Administrateur. */
export default function AdminSettingsPage() {
  const t = useTranslations("members");
  const tSettings = useTranslations("settings");
  const tProjects = useTranslations("projects");
  const tRoles = useTranslations("roles");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.roles.includes("admin") ?? false;

  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState("employee");
  const [newCategory, setNewCategory] = useState({ name: "", color: "#0071e3" });
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const { data: members } = useQuery({
    queryKey: ["members"],
    queryFn: () => api<Member[]>("/members"),
    enabled: isAdmin,
  });
  const { data: invitations } = useQuery({
    queryKey: ["invitations"],
    queryFn: () => api<PendingInvitation[]>("/members/invitations"),
    enabled: isAdmin,
  });
  const { data: categories } = useQuery({
    queryKey: ["project-categories"],
    queryFn: () => api<Category[]>("/project-categories"),
    enabled: isAdmin,
  });

  const inviteMutation = useMutation({
    mutationFn: (payload: { email: string; roleKey: string }) =>
      api<PendingInvitation>("/members/invitations", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, payload) => {
      setFeedback({ tone: "success", text: t("invite.success", { email: payload.email }) });
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (caught) => {
      const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
      setFeedback({
        tone: "error",
        text: tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"),
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api<void>(`/members/invitations/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["invitations"] }),
  });

  const addCategoryMutation = useMutation({
    mutationFn: () =>
      api<Category>("/project-categories", {
        method: "POST",
        body: JSON.stringify(newCategory),
      }),
    onSuccess: () => {
      setNewCategory({ name: "", color: "#0071e3" });
      void queryClient.invalidateQueries({ queryKey: ["project-categories"] });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => api<void>(`/project-categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project-categories"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const submitInvite = (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    inviteMutation.mutate({ email, roleKey });
  };

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl">
        <Alert tone="error">{tSettings("adminForbidden")}</Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{tSettings("admin")}</h1>
        <p className="text-sm text-muted">{tSettings("adminSubtitle")}</p>
      </div>

      {/* Inviter un collaborateur */}
      <Card>
        <div className="mb-3 flex items-center gap-2 text-muted">
          <MailPlus size={16} />
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            {t("invite.title")}
          </h2>
        </div>
        <form onSubmit={submitInvite} className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Label htmlFor="inviteEmail">{t("invite.email")}</Label>
            <Input
              id="inviteEmail"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="inviteRole">{t("invite.role")}</Label>
            <select
              id="inviteRole"
              value={roleKey}
              onChange={(event) => setRoleKey(event.target.value)}
              className="rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {INVITABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {tRoles.has(role) ? tRoles(role) : role}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={inviteMutation.isPending}>
            {t("invite.submit")}
          </Button>
        </form>
        {feedback && (
          <div className="mt-3">
            <Alert tone={feedback.tone}>{feedback.text}</Alert>
          </div>
        )}
      </Card>

      {/* Membres */}
      <Card>
        <div className="mb-3 flex items-center gap-2 text-muted">
          <UsersRound size={16} />
          <h2 className="text-sm font-semibold uppercase tracking-wider">{t("title")}</h2>
        </div>
        <ul className="divide-y divide-border-subtle">
          {(members ?? []).map((member) => (
            <li key={member.id} className="flex items-center gap-3 py-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                {member.firstName.charAt(0)}
                {member.lastName.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.firstName} {member.lastName}
                  {member.id === currentUser?.id && (
                    <span className="ml-2 text-xs text-muted">({t("you")})</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted">{member.email}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {member.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent"
                  >
                    {tRoles.has(role) ? tRoles(role) : role}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Invitations en attente */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          {t("pending.title")}
        </h2>
        {(invitations ?? []).length === 0 ? (
          <p className="text-sm text-muted">{t("pending.empty")}</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {(invitations ?? []).map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{invitation.email}</p>
                  <p className="truncate text-xs text-muted">
                    {t("pending.invitedBy", { name: invitation.invitedByName })} ·{" "}
                    {t("pending.expires", {
                      date: new Date(invitation.expiresAt).toLocaleDateString(locale),
                    })}
                  </p>
                </div>
                <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent">
                  {invitation.roleKey && tRoles.has(invitation.roleKey)
                    ? tRoles(invitation.roleKey)
                    : invitation.roleName}
                </span>
                <button
                  type="button"
                  onClick={() => revokeMutation.mutate(invitation.id)}
                  aria-label={t("pending.revoke")}
                  className="rounded-full p-1.5 text-muted transition-colors hover:bg-border-subtle hover:text-danger"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Rôles et permissions */}
      <RolesAdmin />

      {/* Catégories de projets */}
      <Card>
        <div className="mb-3 flex items-center gap-2 text-muted">
          <Tags size={16} />
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            {tProjects("categories.manage")}
          </h2>
        </div>
        {(categories ?? []).length === 0 ? (
          <p className="mb-3 text-sm text-muted">{tProjects("categories.empty")}</p>
        ) : (
          <ul className="mb-3 space-y-1.5">
            {(categories ?? []).map((category) => (
              <li key={category.id} className="flex items-center gap-2 text-sm">
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="flex-1">{category.name}</span>
                <button
                  type="button"
                  onClick={() => deleteCategoryMutation.mutate(category.id)}
                  aria-label={tProjects("form.cancel")}
                  className="rounded-full p-1 text-muted transition-colors hover:bg-border-subtle hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (newCategory.name) addCategoryMutation.mutate();
          }}
          className="flex items-end gap-2"
        >
          <div className="flex-1">
            <Label htmlFor="catName">{tProjects("categories.name")}</Label>
            <Input
              id="catName"
              maxLength={60}
              required
              value={newCategory.name}
              onChange={(event) =>
                setNewCategory((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <input
            type="color"
            aria-label="couleur"
            value={newCategory.color}
            onChange={(event) =>
              setNewCategory((current) => ({ ...current, color: event.target.value }))
            }
            className="h-9 w-12 cursor-pointer rounded-(--radius-control) border border-border-subtle bg-surface-solid"
          />
          <Button type="submit" disabled={addCategoryMutation.isPending}>
            {tProjects("categories.add")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
