"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="centered-state">
      <AlertTriangle size={32} aria-hidden="true" />
      <h1>No pudimos cargar esta vista</h1>
      <p>Intenta nuevamente.</p>
      <Button onClick={reset}>
        <RotateCcw size={18} aria-hidden="true" />
        Reintentar
      </Button>
    </main>
  );
}
