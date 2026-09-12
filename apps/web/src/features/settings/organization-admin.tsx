"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";

interface OrganizationProfile {
  id: string;
  name: string;
  slug: string;
  plan: string;
  country: string | null;
  address: string | null;
  vatNumber: string | null;
  logoUrl: string | null;
}

type FormState = {
  name: string;
  country: string;
  address: string;
  vatNumber: string;
  logoUrl: string;
};

const EMPTY: FormState = { name: "", country: "", address: "", vatNumber: "", logoUrl: "" };

/** Profil de l'organisation : nom + coordonnées société (réservé aux admins). */
export function OrganizationAdmin() {
  const t = useTranslations("organization");
  const tErrors = useTranslations("errors");
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );

  const { data: profile } = useQuery({
    queryKey: ["organization-profile"],
    queryFn: () => api<OrganizationProfile>("/organization/profile"),
  });

  // Synchronisation en phase de rendu (pattern React recommandé) : remplit le
  // formulaire une fois, quand les données arrivent ou changent d'organisation.
  if (profile && profile.id !== loadedId) {
    setLoadedId(profile.id);
    setForm({
      name: profile.name,
      country: profile.country ?? "",
      address: profile.address ?? "",
      vatNumber: profile.vatNumber ?? "",
      logoUrl: profile.logoUrl ?? "",
    });
  }

  const save = useMutation({
    mutationFn: (payload: FormState) =>
      api<OrganizationProfile>("/organization/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: payload.name.trim(),
          country: payload.country.trim().toUpperCase(),
          address: payload.address.trim(),
          vatNumber: payload.vatNumber.trim(),
          logoUrl: payload.logoUrl.trim(),
        }),
      }),
    onSuccess: (updated) => {
      setFeedback({ tone: "success", text: t("success") });
      // Le nom est affiché dans le menu de profil : on rafraîchit l'utilisateur courant.
      if (user) {
        setUser({ ...user, organization: { ...user.organization, name: updated.name } });
      }
      void queryClient.invalidateQueries({ queryKey: ["organization-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (caught) => {
      const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
      setFeedback({ tone: "error", text: tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN") });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    save.mutate(form);
  };

  const set = (key: keyof FormState) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2 text-muted">
        <Building2 size={16} />
        <h2 className="text-sm font-semibold uppercase tracking-wider">{t("profile")}</h2>
      </div>
      {feedback && (
        <div className="mb-4">
          <Alert tone={feedback.tone}>{feedback.text}</Alert>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="orgName">{t("name")}</Label>
          <Input
            id="orgName"
            required
            minLength={2}
            maxLength={120}
            value={form.name}
            onChange={set("name")}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="orgCountry">{t("country")}</Label>
            <Input
              id="orgCountry"
              maxLength={2}
              placeholder="FR"
              value={form.country}
              onChange={set("country")}
              className="uppercase"
            />
          </div>
          <div>
            <Label htmlFor="orgVat">{t("vatNumber")}</Label>
            <Input
              id="orgVat"
              maxLength={40}
              placeholder="FR12345678901"
              value={form.vatNumber}
              onChange={set("vatNumber")}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="orgAddress">{t("address")}</Label>
          <Input
            id="orgAddress"
            maxLength={255}
            value={form.address}
            onChange={set("address")}
          />
        </div>
        <div>
          <Label htmlFor="orgLogo">{t("logoUrl")}</Label>
          <Input
            id="orgLogo"
            type="url"
            maxLength={500}
            placeholder="https://…"
            value={form.logoUrl}
            onChange={set("logoUrl")}
          />
        </div>
        <Button type="submit" disabled={save.isPending}>
          {t("submit")}
        </Button>
      </form>
    </Card>
  );
}
