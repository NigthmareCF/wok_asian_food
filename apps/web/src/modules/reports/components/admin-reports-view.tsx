"use client";
import { useRef, useState } from "react";
import {
  Button,
  DataTable,
  FormField,
  Metrics,
  Notice,
  Select,
  Workspace,
  downloadCsv,
  money,
  styles,
  useAdminFilter,
  useAdminWorkspace,
} from "@/modules/admin-workspace";
export function AdminReportsView() {
  const { state, canManage } = useAdminWorkspace();
  const [from, setFrom] = useAdminFilter("reports.from", "2026-09-01");
  const [to, setTo] = useAdminFilter("reports.to", "2026-09-12");
  const [channel, setChannel] = useAdminFilter("reports.channel", "Todos");
  const [report, setReport] = useAdminFilter("reports.kind", "Ventas");
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const exportingRef = useRef(false);
  const invalid = !from || !to || from > to;
  const rows = invalid
    ? []
    : state.sales
        .filter(
          (r) =>
            r.date >= from &&
            r.date <= to &&
            (channel === "Todos" || r.channel === channel),
        )
        .map((r) => ({ ...r, id: `${r.date}-${r.channel}` }));
  const total = rows.reduce((sum, r) => sum + r.sales, 0);
  const costs = rows.reduce((sum, r) => sum + r.costs, 0);
  const orders = rows.reduce((sum, r) => sum + r.orders, 0);
  const max = Math.max(1, ...rows.map((r) => r.sales));
  async function exportReport() {
    if (!canManage || !rows.length || exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    setMessage("Preparando exportación…");
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      downloadCsv(`wok-${report.toLowerCase()}-${from}-${to}-demo.csv`, [
        [
          "Fecha",
          "Canal",
          "Pedidos",
          "Ventas Q",
          ...(report === "Margen estimado" ? ["Costo Q", "Margen Q"] : []),
        ],
        ...rows.map((r) => [
          r.date,
          r.channel,
          r.orders,
          r.sales,
          ...(report === "Margen estimado" ? [r.costs, r.sales - r.costs] : []),
        ]),
      ]);
      setMessage("Exportación CSV generada con datos simulados.");
    } catch {
      setMessage("No se pudo exportar. Intenta de nuevo.");
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }
  return (
    <Workspace
      id="A-10"
      title="Reportes"
      description="Compara resultados de ejemplo por período y canal."
      actions={
        <Button
          disabled={!canManage || !rows.length || exporting}
          onClick={exportReport}
        >
          {exporting ? "Exportando…" : "Exportar CSV"}
        </Button>
      }
    >
      <div className={styles.toolbar}>
        <FormField
          id="report-from"
          label="Desde"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <FormField
          id="report-to"
          label="Hasta"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Select
          label="Canal"
          value={channel}
          onChange={setChannel}
          options={["Todos", "Salón", "Delivery"]}
        />
        <Select
          label="Reporte"
          value={report}
          onChange={setReport}
          options={["Ventas", "Margen estimado"]}
        />
      </div>
      {invalid && (
        <Notice error>
          Selecciona un período válido; la fecha inicial no puede ser posterior
          a la final.
        </Notice>
      )}
      {message && <Notice>{message}</Notice>}
      <Metrics
        items={[
          { label: "Ventas del período", value: money(total) },
          { label: "Pedidos", value: orders },
          {
            label: report === "Ventas" ? "Ticket promedio" : "Margen estimado",
            value: money(
              report === "Ventas"
                ? orders
                  ? total / orders
                  : 0
                : total - costs,
            ),
          },
        ]}
      />
      <section className={styles.card}>
        <h2>Ventas por fecha</h2>
        {rows.length ? (
          rows.map((r) => (
            <div key={r.id}>
              <div className={styles.header}>
                <span>
                  {r.date} · {r.channel}
                </span>
                <strong>{money(r.sales)}</strong>
              </div>
              <div className={styles.bar} aria-hidden="true">
                <span style={{ width: `${(r.sales / max) * 100}%` }} />
              </div>
            </div>
          ))
        ) : (
          <p>No hay ventas para este período y canal.</p>
        )}
      </section>
      <DataTable
        id="reports"
        rows={rows}
        columns={[
          { label: "Fecha", render: (r) => r.date },
          { label: "Canal", render: (r) => r.channel },
          { label: "Pedidos", render: (r) => r.orders },
          { label: "Ventas", render: (r) => money(r.sales) },
          ...(report === "Margen estimado"
            ? [
                {
                  label: "Costos",
                  render: (r: (typeof rows)[number]) => money(r.costs),
                },
                {
                  label: "Margen",
                  render: (r: (typeof rows)[number]) =>
                    money(r.sales - r.costs),
                },
              ]
            : []),
        ]}
      />
      <Notice>
        La exportación requiere capacidad de gestión simulada. Los valores no
        representan contabilidad ni ventas reales.
      </Notice>
    </Workspace>
  );
}
