export type AccountStorage = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

export function normalizeAccountOwner(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

export function accountStorageKey(kind: "cart" | "pending" | "reservation-draft" | "reservation-pending", email?: string | null) {
  const owner = normalizeAccountOwner(email);
  // Fixed-width UTF-16 encoding avoids punctuation collisions and SecureStore-invalid keys.
  const encoded = owner?.split("").map((part) => part.charCodeAt(0).toString(16).padStart(4, "0")).join("");
  const suffix = owner === null ? "guest" : `owner-${encoded}`;
  const namespace = kind.startsWith("reservation-") ? "client" : "pickup";
  return `wok.${namespace}.${kind}.v2.${suffix}`;
}

const queues = new WeakMap<AccountStorage, Promise<unknown>>();
// Sharing the queue across store lifetimes prevents a relogin from reading half a write.
export function withAccountStorage<T>(storage: AccountStorage, task: () => Promise<T>): Promise<T> {
  const queued = (queues.get(storage) ?? Promise.resolve()).catch(() => {}).then(task);
  queues.set(storage, queued);
  return queued;
}
