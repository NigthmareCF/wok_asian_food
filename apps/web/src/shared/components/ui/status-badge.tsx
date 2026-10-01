import { Circle } from "lucide-react";

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "info" | "warning" | "error";
}) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <Circle aria-hidden="true" fill="currentColor" size={8} />
      {label}
    </span>
  );
}
