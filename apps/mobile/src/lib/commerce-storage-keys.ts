export type CommerceChannel = "pickup" | "delivery";
export type CommerceStorageKeys = { cart: string; modifiers: string; pending: string };

export function commerceStorageKeys(channel: CommerceChannel, ownerHash: string): CommerceStorageKeys {
  const prefix = `wok.${channel}.v2.${ownerHash}`;
  return { cart: `${prefix}.cart`, modifiers: `${prefix}.modifiers`, pending: `${prefix}.pending` };
}
