"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, Suspense, useState } from "react";
import { Alert, Button, Card, Input, Label } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { SessionPayload, useAuthStore } from "@/lib/auth-store";

function AcceptInvitationForm() {
  const t = useTranslations("auth.acceptInvitation");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const setSession = useAuthStore((state) => state.setSession);
  const [form, setForm] = useState({ firstName: "", lastName: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const update =
    (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const session = await api<SessionPayload>("/auth/accept-invitation", {
        method: "POST",
        body: JSON.stringify({ token, ...form, locale }),
      });
      setSession(session);
      router.replace("/");
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
      setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
      setPending(false);
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="mb-5 text-sm text-muted">{t("subtitle")}</p>
      {!token ? (
        <Alert tone="error">{t("missingToken")}</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="firstName">{t("firstName")}</Label>
              <Input
                id="firstName"
                autoComplete="given-name"
                required
                maxLength={80}
                value={form.firstName}
                onChange={update("firstName")}
              />
            </div>
            <div>
              <Label htmlFor="lastName">{t("lastName")}</Label>
              <Input
                id="lastName"
                autoComplete="family-name"
                required
                maxLength={80}
                value={form.lastName}
                onChange={update("lastName")}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={form.password}
              onChange={update("password")}
            />
            <p className="mt-1 text-xs text-muted">{t("passwordHint")}</p>
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {t("submit")}
          </Button>
        </form>
      )}
    </Card>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense>
      <AcceptInvitationForm />
    </Suspense>
  );
}
