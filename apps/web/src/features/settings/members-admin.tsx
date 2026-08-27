"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, ShieldCheck, Trash2, UserPlus, UsersRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { MemberRolesEditor } from "@/features/settings/member-roles-editor";

interface Member {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: string[];
  roleIds: string[];
}

interface PendingInvitation {
  id: string;
  email: string;
  roleKey: string | null;
  roleName: string;
  invitedByName: string;
  expiresAt: string;
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

/** Gestion des membres : invitations, rôles et invitations en attente. */
export function MembersAdmin() {
  const t = useTranslations("members");
  const tRoles = useTranslations("roles");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState("employee");
  const [existingEmail, setExistingEmail] = useState("");
  const [existingRole, setExistingRole] = useState("employee");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const { data: members } = useQuery({
    queryKey: ["members"],
    queryFn: () => api<Member[]>("/members"),
  });
  const { data: invitations } = useQuery({
    queryKey: ["invitations"],
    queryFn: () => api<PendingInvitation[]>("/members/invitations"),
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
      setFeedback({ tone: "error", text: tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN") });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api<void>(`/members/invitations/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["invitations"] }),
  });

  const addExistingMutation = useMutation({
    mutationFn: (payload: { email: string; roleKey: string }) =>
      api<Member>("/members/existing", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (_, payload) => {
      setFeedback({ tone: "success", text: t("addExisting.success", { email: payload.email }) });
      setExistingEmail("");
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (caught) => {
      const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
      setFeedback({ tone: "error", text: tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN") });
    },
  });

  const submitInvite = (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    inviteMutation.mutate({ email, roleKey });
  };

  return (
    <div className="space-y-6">
      {/* Inviter un collaborateur */}
      <Card>
        <div className="mb-3 flex items-center gap-2 text-muted">
          <MailPlus size={16} />
          <h2 className="text-sm font-semibold uppercase tracking-wider">{t("invite.title")}</h2>
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

      {/* Ajouter un compte existant (multi-org) */}
      <Card>
        <div className="mb-3 flex items-center gap-2 text-muted">
          <UserPlus size={16} />
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            {t("addExisting.title")}
          </h2>
        </div>
        <p className="mb-3 text-xs text-muted">{t("addExisting.subtitle")}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setFeedback(null);
            addExistingMutation.mutate({ email: existingEmail, roleKey: existingRole });
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-56 flex-1">
            <Label htmlFor="existingEmail">{t("invite.email")}</Label>
            <Input
              id="existingEmail"
              type="email"
              required
              value={existingEmail}
              onChange={(event) => setExistingEmail(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="existingRole">{t("invite.role")}</Label>
            <select
              id="existingRole"
              value={existingRole}
              onChange={(event) => setExistingRole(event.target.value)}
              className="rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {INVITABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {tRoles.has(role) ? tRoles(role) : role}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={addExistingMutation.isPending}>
            {t("addExisting.submit")}
          </Button>
        </form>
      </Card>

      {/* Membres */}
      <Card>
        <div className="mb-3 flex items-center gap-2 text-muted">
          <UsersRound size={16} />
          <h2 className="text-sm font-semibold uppercase tracking-wider">{t("title")}</h2>
        </div>
        <ul className="divide-y divide-border-subtle">
          {(members ?? []).map((member) => (
            <li key={member.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
                <div className="flex flex-wrap justify-end gap-1.5">
                  {member.roles.map((role) => (
                    <span
                      key={role}
                      className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent"
                    >
                      {tRoles.has(role) ? tRoles(role) : role}
                    </span>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setEditingMemberId((id) => (id === member.id ? null : member.id))
                  }
                  className="shrink-0 gap-1.5 px-2.5 py-1.5 text-xs"
                >
                  <ShieldCheck size={14} />
                  <span className="hidden sm:inline">{t("roleEditor.manage")}</span>
                </Button>
              </div>
              {editingMemberId === member.id && (
                <MemberRolesEditor
                  memberId={member.id}
                  currentRoleIds={member.roleIds}
                  onClose={() => setEditingMemberId(null)}
                />
              )}
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
    </div>
  );
}
