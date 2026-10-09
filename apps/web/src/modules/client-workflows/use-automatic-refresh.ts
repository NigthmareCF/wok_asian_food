"use client";
import { useEffect, useRef } from "react";
// Consultas únicamente: nunca reintenta escrituras en segundo plano.
export function useAutomaticRefresh(
  refresh: () => void,
  milliseconds = 10_000,
  enabled = true,
) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);
  useEffect(() => {
    if (!enabled || milliseconds <= 0) return;
    const update = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    const timer = window.setInterval(update, milliseconds);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [milliseconds, enabled]);
}
