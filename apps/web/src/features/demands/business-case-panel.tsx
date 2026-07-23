"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { BusinessCaseView, RISK_BADGE, RiskLevel } from "@/features/demands/shared";

const LEVELS: RiskLevel[] = ["low", "medium", "high"];

interface RiskDraft {
  label: string;
  probability: RiskLevel;
  impact: RiskLevel;
  mitigation: string;
}

/** Onglet Business Case de la fiche demande : lecture + édition (PMO / Business Analyst). */
export function BusinessCasePanel({ demandId }: { demandId: string }) {
  const t = useTranslations("businessCase");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    roi: "",
    costs: "",
    benefits: "",
    assumptions: "",
    resources: "",
    dependencies: "",
    plannedStartDate: "",
    plannedEndDate: "",
  });
  const [risks, setRisks] = useState<RiskDraft[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["business-case", demandId],
    // La réponse peut être vide (aucun Business Case encore rédigé)
    queryFn: () => api<BusinessCaseView | null>(`/demands/${demandId}/business-case`),
  });
  const businessCase = data && (data as BusinessCaseView).id ? (data as BusinessCaseView) : null;

  const saveMutation = useMutation({
    mutationFn: () =>
      api<BusinessCaseView>(`/demands/${demandId}/business-case`, {
        method: "PUT",
        body: JSON.stringify({
          roi: form.roi || null,
          costs: form.costs || null,
          benefits: form.benefits || null,
          assumptions: form.assumptions || null,
          resources: form.resources || null,
          dependencies: form.dependencies || null,
          plannedStartDate: form.plannedStartDate || null,
          plannedEndDate: form.plannedEndDate || null,
          risks: risks
            .filter((r) => r.label.trim())
            .map((r) => ({
              label: r.label.trim(),
              probability: r.probability,
              impact: r.impact,
              mitigation: r.mitigation.trim() || null,
            })),
        }),
      }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(["business-case", demandId], fresh);
      setEditing(false);
      setError(null);
    },
    onError: (err: unknown) => {
      const code = err instanceof ApiError ? err.code : "UNKNOWN";
      setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
    },
  });

  const startEditing = () => {
    setForm({
      roi: businessCase?.roi ?? "",
      costs: businessCase?.costs ?? "",
      benefits: businessCase?.benefits ?? "",
      assumptions: businessCase?.assumptions ?? "",
      resources: businessCase?.resources ?? "",
      dependencies: businessCase?.dependencies ?? "",
      plannedStartDate: businessCase?.plannedStartDate ?? "",
      plannedEndDate: businessCase?.plannedEndDate ?? "",
    });
    setRisks(
      (businessCase?.risks ?? []).map((r) => ({
        label: r.label,
        probability: r.probability,
        impact: r.impact,
        mitigation: r.mitigation ?? "",
      })),
    );
    setEditing(true);
    setError(null);
  };

  // canEdit est renvoyé sur le Business Case existant ; sinon on tente et l'API tranche (403).
  const canEdit = businessCase?.canEdit ?? true;

  if (isLoading) {
    return <Card><p className="text-sm text-muted">{t("loading")}</p></Card>;
  }

  if (editing) {
    return (
      <Card>
        {error && <Alert tone="error" className="mb-3">{error}</Alert>}
        <form
          className="space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={t("roi")} value={form.roi} onChange={(v) => setForm((c) => ({ ...c, roi: v }))} />
            <TextField label={t("costs")} value={form.costs} onChange={(v) => setForm((c) => ({ ...c, costs: v }))} />
            <TextField label={t("benefits")} value={form.benefits} onChange={(v) => setForm((c) => ({ ...c, benefits: v }))} />
            <TextField label={t("assumptions")} value={form.assumptions} onChange={(v) => setForm((c) => ({ ...c, assumptions: v }))} />
            <TextField label={t("resources")} value={form.resources} onChange={(v) => setForm((c) => ({ ...c, resources: v }))} />
            <TextField label={t("dependencies")} value={form.dependencies} onChange={(v) => setForm((c) => ({ ...c, dependencies: v }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="bcStart">{t("plannedStart")}</Label>
              <Input id="bcStart" type="date" value={form.plannedStartDate} onChange={(e) => setForm((c) => ({ ...c, plannedStartDate: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="bcEnd">{t("plannedEnd")}</Label>
              <Input id="bcEnd" type="date" value={form.plannedEndDate} onChange={(e) => setForm((c) => ({ ...c, plannedEndDate: e.target.value }))} />
            </div>
          </div>

          {/* Registre de risques */}
          <div className="border-t border-border-subtle pt-3">
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0">{t("risksTitle")}</Label>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setRisks((c) => [...c, { label: "", probability: "medium", impact: "medium", mitigation: "" }])
                }
              >
                <Plus size={14} /> {t("addRisk")}
              </Button>
            </div>
            {risks.length === 0 ? (
              <p className="text-sm text-muted">{t("noRisk")}</p>
            ) : (
              <div className="space-y-2">
                {risks.map((risk, index) => (
                  <div key={index} className="rounded-(--radius-control) border border-border-subtle p-2.5">
                    <div className="flex gap-2">
                      <Input
                        className="flex-1"
                        placeholder={t("riskLabel")}
                        value={risk.label}
                        onChange={(e) =>
                          setRisks((c) => c.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setRisks((c) => c.filter((_, i) => i !== index))}
                        aria-label={t("removeRisk")}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <LevelSelect
                        label={t("probability")}
                        value={risk.probability}
                        onChange={(v) => setRisks((c) => c.map((r, i) => (i === index ? { ...r, probability: v } : r)))}
                        levelLabel={(l) => t(`level.${l}`)}
                      />
                      <LevelSelect
                        label={t("impact")}
                        value={risk.impact}
                        onChange={(v) => setRisks((c) => c.map((r, i) => (i === index ? { ...r, impact: v } : r)))}
                        levelLabel={(l) => t(`level.${l}`)}
                      />
                      <div>
                        <Label>{t("mitigation")}</Label>
                        <Input
                          value={risk.mitigation}
                          onChange={(e) =>
                            setRisks((c) => c.map((r, i) => (i === index ? { ...r, mitigation: e.target.value } : r)))
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={saveMutation.isPending}>{t("save")}</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>{t("cancel")}</Button>
          </div>
        </form>
      </Card>
    );
  }

  if (!businessCase) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 p-8 text-center text-muted">
          <FileText size={28} />
          <p className="text-sm">{t("empty")}</p>
          {canEdit && (
            <Button onClick={startEditing}>
              <Plus size={15} /> {t("create")}
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{t("title")}</h2>
          {canEdit && (
            <Button variant="ghost" onClick={startEditing}>
              <Pencil size={15} /> {t("edit")}
            </Button>
          )}
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label={t("roi")} value={businessCase.roi} empty={t("none")} />
          <Field label={t("costs")} value={businessCase.costs} empty={t("none")} />
          <Field label={t("benefits")} value={businessCase.benefits} empty={t("none")} />
          <Field label={t("assumptions")} value={businessCase.assumptions} empty={t("none")} />
          <Field label={t("resources")} value={businessCase.resources} empty={t("none")} />
          <Field label={t("dependencies")} value={businessCase.dependencies} empty={t("none")} />
        </dl>
        {(businessCase.plannedStartDate || businessCase.plannedEndDate) && (
          <p className="mt-3 text-sm text-muted">
            {t("planned")} :{" "}
            {businessCase.plannedStartDate
              ? new Date(businessCase.plannedStartDate).toLocaleDateString(locale)
              : "—"}
            {" → "}
            {businessCase.plannedEndDate
              ? new Date(businessCase.plannedEndDate).toLocaleDateString(locale)
              : "—"}
          </p>
        )}
        <p className="mt-2 text-xs text-muted">{t("author", { name: businessCase.createdBy.name })}</p>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{t("risksTitle")}</h2>
        {businessCase.risks.length === 0 ? (
          <p className="text-sm text-muted">{t("noRisk")}</p>
        ) : (
          <ul className="space-y-2">
            {businessCase.risks.map((risk) => (
              <li key={risk.id} className="rounded-(--radius-control) border border-border-subtle p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{risk.label}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", RISK_BADGE[risk.severity])}>
                    {t("severity")} : {t(`level.${risk.severity}`)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                  <span className={cn("rounded-full px-2 py-0.5", RISK_BADGE[risk.probability])}>
                    {t("probability")} : {t(`level.${risk.probability}`)}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5", RISK_BADGE[risk.impact])}>
                    {t("impact")} : {t(`level.${risk.impact}`)}
                  </span>
                </div>
                {risk.mitigation && (
                  <p className="mt-1.5 text-sm text-muted">{t("mitigation")} : {risk.mitigation}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Field({ label, value, empty }: { label: string; value: string | null; empty: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm">{value || <span className="text-muted">{empty}</span>}</dd>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <textarea
        rows={2}
        maxLength={10000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
    </div>
  );
}

function LevelSelect({
  label,
  value,
  onChange,
  levelLabel,
}: {
  label: string;
  value: RiskLevel;
  onChange: (v: RiskLevel) => void;
  levelLabel: (l: RiskLevel) => string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as RiskLevel)}
        className="w-full rounded-(--radius-control) border border-border-subtle bg-surface-solid px-3 py-[7px] text-sm focus:border-accent focus:outline-none"
      >
        {LEVELS.map((l) => (
          <option key={l} value={l}>{levelLabel(l)}</option>
        ))}
      </select>
    </div>
  );
}
