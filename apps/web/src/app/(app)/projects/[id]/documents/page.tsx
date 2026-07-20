"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Alert, Button, Card, cn } from "@/components/ui";
import { api, ApiError, refreshSession } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { ORG_WIDE_ROLES, ProjectView } from "@/features/projects/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const MAX_SIZE = 25 * 1024 * 1024;

interface DocumentView {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedByName: string;
  createdAt: string;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function DocumentsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const t = useTranslations("documents");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: documents } = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => api<DocumentView[]>(`/projects/${projectId}/documents`),
  });
  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api<ProjectView>(`/projects/${projectId}`),
  });

  const canWork =
    (currentUser?.roles.some((role) => ORG_WIDE_ROLES.includes(role)) ?? false) ||
    (project?.members.some(
      (member) => member.userId === currentUser?.id && member.role !== "observer",
    ) ??
      false);

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["documents", projectId] });

  /** Upload multipart : hors du client api() qui force le Content-Type JSON. */
  const uploadFile = async (file: File, retry = true): Promise<void> => {
    const form = new FormData();
    form.append("file", file);
    const { accessToken } = useAuthStore.getState();
    const response = await fetch(`${API_URL}/api/v1/projects/${projectId}/documents`, {
      method: "POST",
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: form,
    });
    if (response.status === 401 && retry && (await refreshSession())) {
      return uploadFile(file, false);
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { code?: string };
      throw new ApiError(response.status, body.code ?? "UNKNOWN", "upload failed");
    }
  };

  const onFileChosen = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_SIZE) {
      setError(t("tooLarge"));
      return;
    }
    setUploading(true);
    try {
      await uploadFile(file);
      refresh();
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : "UNKNOWN";
      setError(tErrors.has(code) ? tErrors(code) : tErrors("UNKNOWN"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const download = async (document_: DocumentView) => {
    const { accessToken } = useAuthStore.getState();
    const response = await fetch(
      `${API_URL}/api/v1/projects/${projectId}/documents/${document_.id}/download`,
      {
        credentials: "include",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      },
    );
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = document_.name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/projects/${projectId}/documents/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {canWork && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => void onFileChosen(event.target.files?.[0])}
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload size={16} /> {t("upload")}
            </Button>
            <span className="text-xs text-muted">{t("maxSize")}</span>
          </>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="p-0">
        {(documents ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-muted">
            <FileText size={32} />
            <p className="text-sm">{t("empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {(documents ?? []).map((document_) => (
              <li key={document_.id} className="flex items-center gap-3 px-5 py-3">
                <FileText size={18} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{document_.name}</p>
                  <p className="truncate text-xs text-muted">
                    {formatBytes(document_.size)} ·{" "}
                    {t("uploadedBy", { name: document_.uploadedByName })} ·{" "}
                    {new Date(document_.createdAt).toLocaleDateString(locale)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void download(document_)}
                  aria-label={t("download")}
                  className="rounded-full p-1.5 text-muted transition-colors hover:bg-border-subtle hover:text-foreground"
                >
                  <Download size={16} />
                </button>
                {canWork && (
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(document_.id)}
                    aria-label={t("delete")}
                    className={cn(
                      "rounded-full p-1.5 text-muted transition-colors hover:bg-border-subtle hover:text-danger",
                    )}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
