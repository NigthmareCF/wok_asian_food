import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import Dashboard from "@/app/(private)/(admin)/admin/page";
import Reports from "@/app/(private)/(admin)/admin/reports/page";
import Closings from "@/app/(private)/(admin)/admin/cash-closings/page";
import Audit from "@/app/(private)/(admin)/admin/audit/page";
import Clients from "@/app/(private)/(admin)/admin/clients/page";
import Ai from "@/app/(private)/(admin)/admin/ai/page";
import Vision from "@/app/(private)/(admin)/admin/vision/page";
afterEach(cleanup);
it.each([Dashboard, Reports, Closings, Audit, Clients, Ai, Vision])(
  "keeps unsupported active routes blocked without mounting demo controls",
  (Page) => {
    render(<Page />);
    expect(screen.getByRole("status")).toHaveTextContent("Bloqueado");
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/DATOS SIMULADOS/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Volver al inicio" }),
    ).toHaveAttribute("href", "/");
  },
);
