"use client";

import { useEffect, useRef, useState } from "react";
import { replacePage } from "@/modules/auth/auth-navigation";

async function restoreSession() {
  const next = new URLSearchParams(window.location.search).get("next");
  const response = await fetch(
    `/bff/auth/refresh${next ? `?next=${encodeURIComponent(next)}` : ""}`,
    {
      method: "POST",
    },
  );
  if (!response.ok) return null;
  const result = (await response.json()) as { redirectTo: string };
  return result.redirectTo;
}

export function RestoreSession({ children }: { children: React.ReactNode }) {
  const request = useRef<Promise<string | null> | null>(null);
  const [restoring, setRestoring] = useState(true);
  useEffect(() => {
    let active = true;
    // Serialize refresh across tabs; the backend rotates each refresh token once.
    request.current ??= (
      navigator.locks
        ? navigator.locks.request("wok-session-refresh", restoreSession)
        : restoreSession()
    ).catch(() => null);
    request.current.then((destination) => {
      if (!active) return;
      if (destination) replacePage(destination);
      else setRestoring(false);
    });
    return () => {
      active = false;
    };
  }, []);
  return restoring ? (
    <p className="form-feedback" role="status">
      Comprobando tu sesión…
    </p>
  ) : (
    children
  );
}
