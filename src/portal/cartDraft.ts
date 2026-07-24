import type { CartLine } from "./repository";

const DRAFT_VERSION = 1;

type StoredCartDraft = {
  cart: CartLine[];
  idempotencyKey: string;
  version: number;
};

function storageKey(userId: string) {
  return `joy-corner:cart:${userId}`;
}

export function createClientId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createOrderIdempotencyKey(): string {
  return createClientId();
}

export function loadCartDraft(userId: string): StoredCartDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<StoredCartDraft>;
    if (
      draft.version !== DRAFT_VERSION ||
      !Array.isArray(draft.cart) ||
      typeof draft.idempotencyKey !== "string" ||
      draft.idempotencyKey.length < 8
    ) {
      window.localStorage.removeItem(storageKey(userId));
      return null;
    }
    return draft as StoredCartDraft;
  } catch {
    window.localStorage.removeItem(storageKey(userId));
    return null;
  }
}

export function saveCartDraft(
  userId: string,
  cart: CartLine[],
  idempotencyKey: string,
): void {
  if (!cart.length) {
    window.localStorage.removeItem(storageKey(userId));
    return;
  }
  const draft: StoredCartDraft = {
    cart,
    idempotencyKey,
    version: DRAFT_VERSION,
  };
  window.localStorage.setItem(storageKey(userId), JSON.stringify(draft));
}

export function clearCartDraft(userId: string): void {
  window.localStorage.removeItem(storageKey(userId));
}
