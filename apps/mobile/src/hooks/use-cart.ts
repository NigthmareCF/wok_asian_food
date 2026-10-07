import * as SecureStore from "expo-secure-store";
import { useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { createAccountCartState } from "@/lib/cart-state";
import { useSession } from "@/providers/session-provider";

const memoryValues = new Map<string, string>();
const memoryStorage = {
  getItemAsync: async (key: string) => memoryValues.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { memoryValues.set(key, value); },
  deleteItemAsync: async (key: string) => { memoryValues.delete(key); },
};
const carts = createAccountCartState(Platform.OS === "web" ? memoryStorage : SecureStore);

export function useCart() {
  const { session } = useSession();
  const cart = carts.forAccount(session?.email, session?.version);
  const state = useSyncExternalStore(cart.subscribe, cart.getSnapshot, cart.getServerSnapshot);
  useEffect(() => { void cart.restore(); }, [cart]);
  return { ...state, changeQuantity: cart.changeQuantity, restore: cart.restore,
    prepareAttempt: cart.prepareAttempt, completeAttempt: cart.completeAttempt, releaseRejectedAttempt: cart.releaseRejectedAttempt };
}
