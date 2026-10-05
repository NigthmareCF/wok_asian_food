import { useCallback } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { isPollingAllowed } from "./polling-policy";

export function useFocusedPolling(callback: () => void, intervalMs: number, enabled: boolean) {
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      if (timer === null && isPollingAllowed(AppState.currentState, enabled)) {
        timer = setInterval(callback, intervalMs);
      }
    };
    const subscription = AppState.addEventListener("change", (state) => {
      if (isPollingAllowed(state, enabled)) start();
      else stop();
    });
    start();
    return () => { stop(); subscription.remove(); };
  }, [callback, enabled, intervalMs]));
}
