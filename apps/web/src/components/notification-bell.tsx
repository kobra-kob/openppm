"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { api } from "@/lib/api-client";

interface NotificationPayload {
  taskId?: string;
  taskTitle?: string;
  projectId?: string;
  authorName?: string;
}

interface NotificationItem {
  id: string;
  type: string;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  items: NotificationItem[];
  unread: number;
}

const KNOWN_TYPES = ["task.assigned", "task.comment", "task.mention"];

export function NotificationBell() {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<NotificationsResponse>("/notifications"),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markRead = useMutation({
    mutationFn: (id: string) => api<void>(`/notifications/${id}/read`, { method: "POST", body: "{}" }),
    onSuccess: invalidate,
  });
  const markAllRead = useMutation({
    mutationFn: () => api<void>("/notifications/read-all", { method: "POST", body: "{}" }),
    onSuccess: invalidate,
  });

  const label = (item: NotificationItem): string => {
    const key = item.type.replace("task.", "");
    if (!KNOWN_TYPES.includes(item.type) || !t.has(key)) {
      return item.type;
    }
    return t(key, {
      author: item.payload.authorName ?? "",
      task: item.payload.taskTitle ?? "",
    });
  };

  const onItem = (item: NotificationItem) => {
    if (!item.readAt) markRead.mutate(item.id);
    if (item.payload.projectId) {
      setOpen(false);
      router.push(`/projects/${item.payload.projectId}/tasks`);
    }
  };

  const unread = data?.unread ?? 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t("title")}
        className="relative rounded-full p-2 text-muted transition-colors hover:bg-border-subtle hover:text-foreground"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="glass absolute right-0 top-full z-30 mt-2 w-80 max-h-[26rem] overflow-y-auto rounded-(--radius-card) p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-semibold">{t("title")}</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="text-xs text-accent hover:underline"
              >
                {t("markAllRead")}
              </button>
            )}
          </div>
          {(data?.items ?? []).length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted">{t("empty")}</p>
          ) : (
            <ul>
              {(data?.items ?? []).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onItem(item)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-(--radius-control) px-2 py-2 text-left transition-colors hover:bg-border-subtle",
                      !item.readAt && "bg-accent/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        item.readAt ? "bg-transparent" : "bg-accent",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-snug">{label(item)}</span>
                      <span className="text-xs text-muted">
                        {new Date(item.createdAt).toLocaleString(locale)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
