import * as SecureStore from "expo-secure-store";
import { useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { createCartState } from "@/lib/cart-state";

const memoryStorage = {
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
};
const cart = createCartState(Platform.OS === "web" ? memoryStorage : SecureStore);

export function useCart() {
  const state = useSyncExternalStore(cart.subscribe, cart.getSnapshot, cart.getServerSnapshot);
  useEffect(() => { void cart.restore(); }, []);
  return { ...state, changeQuantity: cart.changeQuantity, restore: cart.restore,
    prepareAttempt: cart.prepareAttempt, completeAttempt: cart.completeAttempt, releaseRejectedAttempt: cart.releaseRejectedAttempt };
}
