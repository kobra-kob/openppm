"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { SessionPayload, useAuthStore } from "@/lib/auth-store";

export default function RegisterPage() {
  const t = useTranslations("auth.register");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [form, setForm] = useState({
    organizationName: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const session = await api<SessionPayload>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ ...form, locale }),
      });
      setSession(session);
      router.replace("/dashboard");
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
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div>
          <Label htmlFor="organizationName">{t("organizationName")}</Label>
          <Input
            id="organizationName"
            required
            minLength={2}
            maxLength={120}
            value={form.organizationName}
            onChange={update("organizationName")}
          />
        </div>
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
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={update("email")}
          />
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
      <p className="mt-4 text-center text-sm text-muted">
        {t("hasAccount")}{" "}
        <Link href="/login" className="text-accent hover:underline">
          {t("loginLink")}
        </Link>
      </p>
    </Card>
  );
}
