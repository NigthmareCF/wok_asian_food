export type ActiveStoredSession = {
  status: "ACTIVE";
  refreshToken: string;
  email: string;
};

export type StoredSession = ActiveStoredSession | { status: "SIGNED_OUT" };

export type SecureKeyValueStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

const sessionRecordKey = "wok.session-record.v1";
const legacyRefreshTokenKey = "wok.refresh-token";
const legacyEmailKey = "wok.session-email";

export async function readStoredSession(store: SecureKeyValueStore): Promise<ActiveStoredSession | null> {
  const rawRecord = await store.getItemAsync(sessionRecordKey);
  if (rawRecord !== null) {
    const record = parseStoredSession(rawRecord);
    if (!record || record.status === "SIGNED_OUT") return null;
    await removeLegacyRecords(store);
    return record;
  }

  const [refreshToken, email] = await Promise.all([
    store.getItemAsync(legacyRefreshTokenKey),
    store.getItemAsync(legacyEmailKey),
  ]);
  if (!refreshToken?.trim()) return null;

  const migrated: ActiveStoredSession = {
    status: "ACTIVE",
    refreshToken,
    email: email?.trim() || "Cuenta Cliente",
  };
  try {
    await store.setItemAsync(sessionRecordKey, JSON.stringify({ version: 1, ...migrated }));
    await removeLegacyRecords(store);
  } catch {
    // Keep legacy data intact when the migration write fails; the server still validates the token.
  }
  return migrated;
}

export async function writeStoredSession(store: SecureKeyValueStore, session: ActiveStoredSession): Promise<void> {
  await store.setItemAsync(sessionRecordKey, JSON.stringify({ version: 1, ...session }));
  await removeLegacyRecords(store);
}

export async function clearStoredSession(store: SecureKeyValueStore): Promise<void> {
  // A tombstone takes precedence over legacy keys so failed cleanup cannot restore a logged-out account.
  await store.setItemAsync(sessionRecordKey, JSON.stringify({ version: 1, status: "SIGNED_OUT" }));
  await removeLegacyRecords(store);
}

function parseStoredSession(raw: string): StoredSession | null {
  if (raw.length > 5000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as { version?: unknown; status?: unknown; refreshToken?: unknown; email?: unknown };
    if (record.version !== 1) return null;
    if (record.status === "SIGNED_OUT") return { status: "SIGNED_OUT" };
    if (record.status !== "ACTIVE" || typeof record.refreshToken !== "string"
      || !record.refreshToken.trim() || record.refreshToken.length > 4096
      || typeof record.email !== "string" || !record.email.trim() || record.email.length > 320) return null;
    return { status: "ACTIVE", refreshToken: record.refreshToken, email: record.email };
  } catch {
    return null;
  }
}

async function removeLegacyRecords(store: SecureKeyValueStore): Promise<void> {
  await Promise.allSettled([
    store.deleteItemAsync(legacyRefreshTokenKey),
    store.deleteItemAsync(legacyEmailKey),
  ]);
}
