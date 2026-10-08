import { describe, expect, it } from "vitest";
import {
  ActiveStoredSession,
  clearStoredSession,
  readStoredSession,
  SecureKeyValueStore,
  writeStoredSession,
} from "./secure-session-storage";

class MemorySecureStore implements SecureKeyValueStore {
  values = new Map<string, string>();
  failingWrites = new Set<string>();
  failingDeletes = new Set<string>();

  async getItemAsync(key: string) { return this.values.get(key) ?? null; }
  async setItemAsync(key: string, value: string) {
    if (this.failingWrites.has(key)) throw new Error("secure write failed");
    this.values.set(key, value);
  }
  async deleteItemAsync(key: string) {
    if (this.failingDeletes.has(key)) throw new Error("secure delete failed");
    this.values.delete(key);
  }
}

const active: ActiveStoredSession = {
  status: "ACTIVE",
  refreshToken: "opaque-refresh-token",
  email: "edgar@example.com",
};

describe("atomic secure session storage", () => {
  it("writes token and account identity as one canonical value", async () => {
    const store = new MemorySecureStore();

    await writeStoredSession(store, active);

    expect([...store.values.entries()]).toEqual([[
      "wok.session-record.v1",
      JSON.stringify({ version: 1, ...active }),
    ]]);
  });

  it("migrates the existing two-key session without losing the account identity", async () => {
    const store = new MemorySecureStore();
    store.values.set("wok.refresh-token", active.refreshToken);
    store.values.set("wok.session-email", active.email);

    await expect(readStoredSession(store)).resolves.toEqual(active);
    await expect(readStoredSession(store)).resolves.toEqual(active);
    expect(store.values.get("wok.session-record.v1")).toBe(JSON.stringify({ version: 1, ...active }));
    expect(store.values.has("wok.refresh-token")).toBe(false);
    expect(store.values.has("wok.session-email")).toBe(false);
  });

  it("keeps old credentials intact if the atomic migration write fails", async () => {
    const store = new MemorySecureStore();
    store.values.set("wok.refresh-token", active.refreshToken);
    store.values.set("wok.session-email", active.email);
    store.failingWrites.add("wok.session-record.v1");

    await expect(readStoredSession(store)).resolves.toEqual(active);
    expect(store.values.get("wok.refresh-token")).toBe(active.refreshToken);
    expect(store.values.get("wok.session-email")).toBe(active.email);
  });

  it("does not revive legacy credentials after logout, even if their deletion fails", async () => {
    const store = new MemorySecureStore();
    store.values.set("wok.refresh-token", active.refreshToken);
    store.values.set("wok.session-email", active.email);
    store.failingDeletes.add("wok.refresh-token");
    store.failingDeletes.add("wok.session-email");

    await clearStoredSession(store);

    await expect(readStoredSession(store)).resolves.toBeNull();
    expect(store.values.get("wok.session-record.v1")).toBe(JSON.stringify({ version: 1, status: "SIGNED_OUT" }));
    expect(store.values.get("wok.refresh-token")).toBe(active.refreshToken);
  });

  it("rejects malformed canonical data without falling back to legacy credentials", async () => {
    const store = new MemorySecureStore();
    store.values.set("wok.session-record.v1", "not-json");
    store.values.set("wok.refresh-token", active.refreshToken);
    store.values.set("wok.session-email", active.email);

    await expect(readStoredSession(store)).resolves.toBeNull();
  });
});
