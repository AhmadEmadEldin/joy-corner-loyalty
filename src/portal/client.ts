export type SessionUser = {
  email: string;
  full_name: string;
  id: string;
  role: "owner" | "manager" | "cashier" | "waiter" | "barista" | "customer";
};

type ApiError = { error?: string; message?: string };

const runtimeConfig =
  typeof __API_CONFIG__ === "undefined"
    ? { baseUrl: "/api" }
    : __API_CONFIG__;

const TOKEN_KEY = "joy-corner:access-token";
const USER_KEY = "joy-corner:session-user";
const sessionListeners = new Set<(user: SessionUser | null) => void>();

export const apiBaseUrl = runtimeConfig.baseUrl.replace(/\/$/, "");
export const apiConfigured = Boolean(apiBaseUrl);

function storedUser(): SessionUser | null {
  try {
    const value = window.localStorage.getItem(USER_KEY);
    return value ? (JSON.parse(value) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function currentSessionUser(): SessionUser | null {
  return storedUser();
}

export function accessToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, user: SessionUser): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  sessionListeners.forEach((listener) => listener(user));
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  sessionListeners.forEach((listener) => listener(null));
}

export function subscribeToSession(
  listener: (user: SessionUser | null) => void,
): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = accessToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  const payload = (await response
    .json()
    .catch(() => ({}))) as T & ApiError;
  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new Error(
      payload.error || payload.message || `Request failed (${response.status}).`,
    );
  }
  return payload;
}

export async function restoreSession(): Promise<SessionUser | null> {
  if (!accessToken()) return null;
  try {
    const result = await apiRequest<{ user: SessionUser }>("/auth/me");
    window.localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    return result.user;
  } catch {
    clearSession();
    return null;
  }
}

export function subscribeToEvents(
  topics: string[],
  onChange: () => void,
): () => void {
  const controller = new AbortController();
  const token = accessToken();
  if (!token) return () => controller.abort();

  void fetch(`${apiBaseUrl}/events?topics=${encodeURIComponent(topics.join(","))}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) {
          if (frame.includes("event: change")) onChange();
        }
      }
    })
    .catch(() => undefined);

  return () => controller.abort();
}
