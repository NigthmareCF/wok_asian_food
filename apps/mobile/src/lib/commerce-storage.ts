import * as Crypto from "expo-crypto";
import { CommerceChannel, CommerceStorageKeys, commerceStorageKeys } from "./commerce-storage-keys";

export { CommerceChannel, CommerceStorageKeys, commerceStorageKeys } from "./commerce-storage-keys";

export async function resolveCommerceStorageKeys(channel: CommerceChannel, ownerEmail: string | null): Promise<CommerceStorageKeys> {
  const normalizedEmail = ownerEmail?.trim().toLowerCase();
  const ownerHash = normalizedEmail
    ? await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalizedEmail)
    : "anonymous";
  return commerceStorageKeys(channel, ownerHash);
}
