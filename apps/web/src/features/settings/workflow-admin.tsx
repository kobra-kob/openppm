"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, GitBranch, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, Button, Card, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";

interface WorkflowState {
  key: string;
  label: string;
  kind: string;
}
interface WorkflowTransition {
  key: string;
  label: string;
  fromStateKey: string;
  toStateKey: string;
  allowedRoles: string[];
  requiresComment: boolean;
  autoAction: Record<string, unknown> | null;
}
interface WorkflowDefinition {
  id: string;
  key: string;
  name: string;
  entityType: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}
interface Role {
  key: string | null;
  name: string;
}

/** Rôles proposés comme acteurs d'une étape (rôles système, hors invité). */
const ACTOR_ROLE_KEYS = [
  "manager",
  "pmo",
  "finance",
  "business_analyst",
  "executive",
  "project_manager",
  "employee",
];

/**
 * Administration des workflows (§19) : reconfigurer qui valide chaque étape et
 * l'obligation de commentaire. Le graphe d'états n'est pas modifiable ici
 * (garantit l'intégrité des circuits en cours).
 */
export function WorkflowAdmin() {
  const t = useTranslations("workflowAdmin");
  const { data: definitions } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api<WorkflowDefinition[]>("/workflows"),
  });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => api<Role[]>("/roles") });

  const roleLabel = (key: string) => roles?.find((r) => r.key === key)?.name ?? key;

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2 text-muted">
        <GitBranch size={16} />
        <h2 className="text-sm font-semibold uppercase tracking-wider">{t("title")}</h2>
      </div>
      <p className="mb-3 text-xs text-muted">{t("subtitle")}</p>

      {(definitions ?? []).map((definition) => {
        const stateLabel = (key: string) =>
          definition.states.find((s) => s.key === key)?.label ?? key;
        return (
          <div key={definition.id} className="space-y-2">
            <ul className="divide-y divide-border-subtle">
              {definition.transitions.map((transition) => (
                <TransitionRow
                  key={transition.key}
                  definitionKey={definition.key}
                  transition={transition}
                  fromLabel={stateLabel(transition.fromStateKey)}
                  toLabel={stateLabel(transition.toStateKey)}
                  roleLabel={roleLabel}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </Card>
  );
}

function TransitionRow({
  definitionKey,
  transition,
  fromLabel,
  toLabel,
  roleLabel,
}: {
  definitionKey: string;
  transition: WorkflowTransition;
  fromLabel: string;
  toLabel: string;
  roleLabel: (key: string) => string;
}) {
  const t = useTranslations("workflowAdmin");
  const tErrors = useTranslations("errors");
  const queryClient = useQueryClient();

  const [roles, setRoles] = useState<Set<string>>(new Set(transition.allowedRoles));
  const [requiresComment, setRequiresComment] = useState(transition.requiresComment);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    requiresComment !== transition.requiresComment ||
    roles.size !== transition.allowedRoles.length ||
    [...roles].some((r) => !transition.allowedRoles.includes(r));

  const toggle = (key: string) =>
    setRoles((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = useMutation({
    mutationFn: () =>
      api(`/workflows/${definitionKey}/transitions/${transition.key}`, {
        method: "PATCH",
        body: JSON.stringify({ allowedRoles: [...roles], requiresComment }),
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
    onError: (caught: unknown) => {
      const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
      setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
    },
  });

  return (
    <li className="py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{transition.label}</span>
        <span className="flex items-center gap-1 text-xs text-muted">
          {fromLabel} <ArrowRight size={12} /> {toLabel}
        </span>
        {transition.autoAction && (
          <span className="flex items-center gap-1 rounded-full bg-border-subtle px-2 py-0.5 text-[11px] text-muted">
            <Lock size={11} /> {t("automated")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {ACTOR_ROLE_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={roles.has(key)} onChange={() => toggle(key)} />
            {roleLabel(key)}
          </label>
        ))}
      </div>
      {roles.size === 0 && <p className="mt-1 text-xs text-muted">{t("anyRole")}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={requiresComment}
            onChange={(e) => setRequiresComment(e.target.checked)}
          />
          {t("requiresComment")}
        </label>
        <Button
          type="button"
          className={cn("ml-auto", !dirty && "invisible")}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {t("save")}
        </Button>
      </div>
      {error && (
        <Alert tone="error" className="mt-2">
          {error}
        </Alert>
      )}
    </li>
  );
}
