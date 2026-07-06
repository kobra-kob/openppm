import { SessionPayload, useAuthStore } from "./auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Routes auth pour lesquelles un 401 est une réponse métier, pas une session expirée. */
const NO_RETRY_PATHS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let refreshPromise: Promise<boolean> | null = null;

/** Rafraîchit la session (cookie httpOnly ou token persisté). Dédoublonné. */
export async function refreshSession(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const { refreshToken } = useAuthStore.getState();
      const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      });
      if (!response.ok) {
        return false;
      }
      const session = (await response.json()) as SessionPayload;
      useAuthStore.getState().setSession(session);
      return true;
    } catch {
      return false;
    } finally {
      queueMicrotask(() => {
        refreshPromise = null;
      });
    }
  })();
  return refreshPromise;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  allowRetry = true,
): Promise<T> {
  const { accessToken } = useAuthStore.getState();
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401 && allowRetry && !NO_RETRY_PATHS.includes(path)) {
    if (await refreshSession()) {
      return api<T>(path, init, false);
    }
    useAuthStore.getState().clear();
  }

  if (!response.ok) {
    let body: { code?: string; message?: string } | undefined;
    try {
      body = (await response.json()) as { code?: string; message?: string };
    } catch {
      body = undefined;
    }
    throw new ApiError(
      response.status,
      body?.code ?? "UNKNOWN",
      body?.message ?? response.statusText,
      body,
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
