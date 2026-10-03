"use client";
import { useEffect, useState } from "react";
import { isPublicMenu, type PublicMenu } from "./public-menu";

export function usePublicMenu() {
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/bff/menu", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Menu unavailable");
        const data: unknown = await response.json();
        if (!isPublicMenu(data)) throw new Error("Invalid menu response");
        if (!controller.signal.aborted) setMenu(data);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  return {
    menu,
    error,
    reload: () => {
      setMenu(null);
      setError(false);
      setAttempt((value) => value + 1);
    },
  };
}
