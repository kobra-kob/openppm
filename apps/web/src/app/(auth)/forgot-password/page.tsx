"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label } from "@/components/ui";
import { api } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgot");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setError(tErrors("UNKNOWN"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="mb-5 text-sm text-muted">{t("subtitle")}</p>
      {sent ? (
        <Alert tone="success">{t("sent")}</Alert>
      ) : (
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
          <Button type="submit" disabled={pending} className="w-full">
            {t("submit")}
          </Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-accent hover:underline">
          {tCommon("back")}
        </Link>
      </p>
    </Card>
  );
}
