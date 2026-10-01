"use client";
import { useState } from "react";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  FormField,
  Metrics,
  SearchFilter,
  Workspace,
  expectedCash,
  money,
  styles,
  useAdminFilter,
  useAdminWorkspace,
  useList,
  type CashClosing,
} from "@/modules/admin-workspace";
function status(c: CashClosing) {
  return !c.reviewed
    ? "Revisión pendiente"
    : expectedCash(c) === c.counted
      ? "Correcto"
      : "Con diferencia";
}
export function CashClosingsView() {
  const { state } = useAdminWorkspace();
  const [detail, setDetail] = useState<CashClosing | null>(null);
  const [date, setDate] = useAdminFilter("closings.date");
  const rows = useList(
    "closings",
    state.closings,
    (c) => `${c.date} ${c.id} ${c.actor}`,
    status,
  ).filter((c) => !date || c.date === date);
  return (
    <Workspace
      id="A-11"
      title="Cierres de caja históricos"
      description="Consulta el desglose y las diferencias de cierres registrados."
    >
      <Metrics
        items={[
          { label: "Cierres", value: state.closings.length },
          {
            label: "Pendientes de revisión",
            value: state.closings.filter((c) => !c.reviewed).length,
          },
          {
            label: "Diferencia acumulada",
            value: money(
              state.closings.reduce(
                (sum, c) => sum + c.counted - expectedCash(c),
                0,
              ),
            ),
          },
        ]}
      />
      <SearchFilter
        id="closings"
        statuses={["Correcto", "Con diferencia", "Revisión pendiente"]}
      />
      <div className={styles.toolbar}>
        <FormField
          id="closing-date"
          label="Fecha de cierre"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Button variant="secondary" onClick={() => setDate("")}>
          Todas las fechas
        </Button>
      </div>
      <DataTable
        id="closings"
        rows={rows}
        columns={[
          {
            label: "Cierre",
            render: (c) => (
              <>
                <strong>{c.id}</strong>
                <small>{c.date}</small>
              </>
            ),
          },
          { label: "Responsable", render: (c) => c.actor },
          { label: "Esperado", render: (c) => money(expectedCash(c)) },
          { label: "Contado", render: (c) => money(c.counted) },
          {
            label: "Diferencia",
            render: (c) => money(c.counted - expectedCash(c)),
          },
          { label: "Estado", render: (c) => <Badge>{status(c)}</Badge> },
          {
            label: "Acciones",
            render: (c) => (
              <Button variant="secondary" onClick={() => setDetail(c)}>
                Abrir desglose
              </Button>
            ),
          },
        ]}
      />
      {detail && (
        <Dialog title={`Desglose ${detail.id}`} onClose={() => setDetail(null)}>
          <Badge>{status(detail)}</Badge>
          <dl>
            {[
              ["Apertura", detail.opening],
              ["Ventas en efectivo", detail.sales],
              ["Otros ingresos", detail.income],
              ["Gastos", -detail.expenses],
              ["Retiros", -detail.withdrawals],
              ["Efectivo esperado", expectedCash(detail)],
              ["Efectivo contado", detail.counted],
              ["Diferencia", detail.counted - expectedCash(detail)],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "contents" }}>
                <dt>{label}</dt>
                <dd>{money(Number(value))}</dd>
              </div>
            ))}
          </dl>
          <p>{detail.note}</p>
          <p>Consulta histórica. Este panel no reabre ni modifica cierres.</p>
        </Dialog>
      )}
    </Workspace>
  );
}
