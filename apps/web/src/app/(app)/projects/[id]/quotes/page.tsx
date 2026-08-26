"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Alert, Button, Card, Input, Label, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { formatEuro } from "@/features/portfolios/shared";
import { QUOTE_STATUS_BADGE, QuoteView } from "@/features/quotes/shared";

export default function QuotesListPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations("quotes");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", customerName: "", vatRate: "20" });
  const [error, setError] = useState<string | null>(null);

  const { data: quotes } = useQuery({
    queryKey: ["quotes", id],
    queryFn: () => api<QuoteView[]>(`/projects/${id}/quotes`),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api<QuoteView>(`/projects/${id}/quotes`, {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          customerName: form.customerName || undefined,
          vatRate: Number(form.vatRate || 20),
        }),
      }),
    onSuccess: (quote) => {
      void queryClient.invalidateQueries({ queryKey: ["quotes", id] });
      router.push(`/projects/${id}/quotes/${quote.id}`);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setError(tErrors.has(err.code) ? tErrors(err.code) : err.message);
      } else {
        setError(tErrors("UNKNOWN"));
      }
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createMutation.mutate();
  };

  const list = quotes ?? [];

  return (
    <div className="w-full space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{t("subtitle")}</p>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={15} /> {t("new")}
          </Button>
        )}
      </div>

      {creating && (
        <Card>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label htmlFor="title">{t("form.title")}</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(event) => setForm((c) => ({ ...c, title: event.target.value }))}
                  required
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="vat">{t("form.vatRate")}</Label>
                <Input
                  id="vat"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={form.vatRate}
                  onChange={(event) => setForm((c) => ({ ...c, vatRate: event.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="customer">{t("form.customer")}</Label>
              <Input
                id="customer"
                value={form.customerName}
                onChange={(event) => setForm((c) => ({ ...c, customerName: event.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createMutation.isPending || !form.title}>
                {t("form.create")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                {t("form.cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {list.length === 0 && !creating ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted">
            <FileText size={28} />
            <p className="text-sm">{t("empty")}</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((quote) => (
            <Link key={quote.id} href={`/projects/${id}/quotes/${quote.id}`}>
              <Card className="card-hover flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs text-muted">{quote.reference}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {quote.title}
                    {quote.revision > 1 && (
                      <span className="ml-1 text-xs text-muted">{t("rev", { n: quote.revision })}</span>
                    )}
                  </p>
                  {quote.customerName && <p className="truncate text-xs text-muted">{quote.customerName}</p>}
                </div>
                <span className="text-sm tabular-nums">{formatEuro(quote.totalTTC, locale)}</span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    QUOTE_STATUS_BADGE[quote.status],
                  )}
                >
                  {t(`status.${quote.status}`)}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
