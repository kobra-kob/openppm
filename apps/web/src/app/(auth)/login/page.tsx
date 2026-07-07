"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { SessionPayload, useAuthStore } from "@/lib/auth-store";

type LoginResponse = SessionPayload | { mfaRequired: true; mfaToken: string };

export default function LoginPage() {
  const t = useTranslations("auth.login");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const fail = (caught: unknown) => {
    const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
    setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
    setPending(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if ("mfaRequired" in response) {
        setMfaToken(response.mfaToken);
        setPending(false);
        return;
      }
      setSession(response);
      router.replace("/");
    } catch (caught) {
      fail(caught);
    }
  };

  const submitMfa = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const session = await api<SessionPayload>("/auth/2fa/verify", {
        method: "POST",
        body: JSON.stringify({ mfaToken, code: mfaCode.trim() }),
      });
      setSession(session);
      router.replace("/");
    } catch (caught) {
      fail(caught);
      if (caught instanceof ApiError && caught.code === "MFA_CHALLENGE_EXPIRED") {
        setMfaToken(null);
        setMfaCode("");
      }
    }
  };

  if (mfaToken) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">{t("mfaTitle")}</h2>
        <p className="mb-5 text-sm text-muted">{t("mfaSubtitle")}</p>
        <form onSubmit={submitMfa} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div>
            <Label htmlFor="mfaCode">{t("mfaCode")}</Label>
            <Input
              id="mfaCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              minLength={6}
              maxLength={32}
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {t("mfaSubmit")}
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="mb-5 text-sm text-muted">{t("subtitle")}</p>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div>
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password">{t("password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {t("submit")}
        </Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-accent hover:underline">
          {t("forgot")}
        </Link>
        <span className="text-muted">
          {t("noAccount")}{" "}
          <Link href="/register" className="text-accent hover:underline">
            {t("registerLink")}
          </Link>
        </span>
      </div>
    </Card>
  );
}
