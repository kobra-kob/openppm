"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { toDataURL } from "qrcode";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { AuthUser } from "@/lib/auth-store";

interface MfaSetup {
  secret: string;
  otpauthUrl: string;
}

export default function SecurityPage() {
  const t = useTranslations("security.mfa");
  const tPage = useTranslations("security");
  const tErrors = useTranslations("errors");
  const queryClient = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<AuthUser & { mfaEnabled: boolean }>("/auth/me"),
  });

  const [setup, setSetup] = useState<(MfaSetup & { qrDataUrl: string }) | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableForm, setDisableForm] = useState({ password: "", code: "" });
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const errorText = (caught: unknown): string => {
    const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
    return tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN");
  };

  const startSetup = useMutation({
    mutationFn: () => api<MfaSetup>("/auth/2fa/setup", { method: "POST", body: "{}" }),
    onSuccess: async (data) => {
      setFeedback(null);
      const qrDataUrl = await toDataURL(data.otpauthUrl, { margin: 1, width: 192 });
      setSetup({ ...data, qrDataUrl });
    },
    onError: (caught) => setFeedback({ tone: "error", text: errorText(caught) }),
  });

  const enable = useMutation({
    mutationFn: (code: string) =>
      api<{ recoveryCodes: string[] }>("/auth/2fa/enable", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
    onSuccess: (data) => {
      setFeedback(null);
      setSetup(null);
      setEnableCode("");
      setRecoveryCodes(data.recoveryCodes);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (caught) => setFeedback({ tone: "error", text: errorText(caught) }),
  });

  const disable = useMutation({
    mutationFn: (payload: { password: string; code: string }) =>
      api<void>("/auth/2fa/disable", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setDisableForm({ password: "", code: "" });
      setFeedback({ tone: "success", text: t("disabledSuccess") });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (caught) => setFeedback({ tone: "error", text: errorText(caught) }),
  });

  const submitEnable = (event: FormEvent) => {
    event.preventDefault();
    enable.mutate(enableCode.trim());
  };

  const submitDisable = (event: FormEvent) => {
    event.preventDefault();
    disable.mutate(disableForm);
  };

  if (!me) {
    return null;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{tPage("title")}</h1>
        <p className="text-sm text-muted">{tPage("subtitle")}</p>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted">
            {me.mfaEnabled ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
            <h2 className="text-sm font-semibold uppercase tracking-wider">{t("title")}</h2>
          </div>
          <span
            className={
              me.mfaEnabled
                ? "rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success"
                : "rounded-full bg-border-subtle px-2.5 py-0.5 text-xs font-medium text-muted"
            }
          >
            {me.mfaEnabled ? t("enabled") : t("disabled")}
          </span>
        </div>

        {feedback && (
          <div className="mb-4">
            <Alert tone={feedback.tone}>{feedback.text}</Alert>
          </div>
        )}

        {recoveryCodes && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{t("recoveryTitle")}</h3>
            <Alert tone="success">{t("recoveryWarning")}</Alert>
            <div className="grid grid-cols-2 gap-2 rounded-(--radius-control) border border-border-subtle bg-surface-solid p-4 font-mono text-sm">
              {recoveryCodes.map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
            <Button onClick={() => setRecoveryCodes(null)}>{t("recoveryDone")}</Button>
          </div>
        )}

        {!recoveryCodes && !me.mfaEnabled && !setup && (
          <Button onClick={() => startSetup.mutate()} disabled={startSetup.isPending}>
            {t("start")}
          </Button>
        )}

        {!recoveryCodes && !me.mfaEnabled && setup && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{t("scan")}</p>
            {/* Data URL générée localement, next/image inutile ici */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setup.qrDataUrl}
              alt="QR code TOTP"
              className="rounded-(--radius-control) border border-border-subtle"
              width={192}
              height={192}
            />
            <p className="text-sm text-muted">
              {t("manual")} <span className="font-mono text-foreground">{setup.secret}</span>
            </p>
            <form onSubmit={submitEnable} className="flex items-end gap-3">
              <div>
                <Label htmlFor="enableCode">{t("codeLabel")}</Label>
                <Input
                  id="enableCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  minLength={6}
                  maxLength={6}
                  value={enableCode}
                  onChange={(event) => setEnableCode(event.target.value)}
                  className="w-36"
                />
              </div>
              <Button type="submit" disabled={enable.isPending}>
                {t("confirm")}
              </Button>
            </form>
          </div>
        )}

        {!recoveryCodes && me.mfaEnabled && (
          <form onSubmit={submitDisable} className="space-y-4">
            <h3 className="text-sm font-semibold">{t("disableTitle")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="disablePassword">{t("password")}</Label>
                <Input
                  id="disablePassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={disableForm.password}
                  onChange={(event) =>
                    setDisableForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="disableCode">{t("codeLabel")}</Label>
                <Input
                  id="disableCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  minLength={6}
                  maxLength={6}
                  value={disableForm.code}
                  onChange={(event) =>
                    setDisableForm((current) => ({ ...current, code: event.target.value }))
                  }
                />
              </div>
            </div>
            <Button type="submit" variant="danger" disabled={disable.isPending}>
              {t("disableSubmit")}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
