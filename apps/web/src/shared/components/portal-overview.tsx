import { StatusBadge } from "@/shared/components/ui/status-badge";

const content = {
  client: {
    title: "Hola",
    description: "Revisa el menu y el estado de tus pedidos.",
    status: ["ABIERTO", "success"],
    metrics: [
      ["Tiempo estimado", "25-35 min"],
      ["Categorias", "6"],
      ["Pedido activo", "Ninguno"],
      ["Mensajes", "0"],
    ],
  },
  operational: {
    title: "Operacion",
    description: "Resumen del servicio en curso.",
    status: ["SERVICIO ABIERTO", "success"],
    metrics: [
      ["Mesas activas", "8/12"],
      ["Pedidos", "11"],
      ["Reservas proximas", "3"],
      ["Carga cocina", "74%"],
    ],
  },
  admin: {
    title: "Administracion",
    description: "Indicadores y configuracion del restaurante.",
    status: ["DATOS MOCK", "info"],
    metrics: [
      ["Ventas del dia", "Q 4,820"],
      ["Alertas", "4"],
      ["Productos criticos", "3"],
      ["Personal activo", "9"],
    ],
  },
} as const;

export function PortalOverview({ context }: { context: keyof typeof content }) {
  const page = content[context];
  return (
    <>
      <header className="page-header">
        <div>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
        </div>
        <StatusBadge label={page.status[0]} tone={page.status[1]} />
      </header>
      <section className="metric-grid" aria-label="Resumen">
        {page.metrics.map(([label, value]) => (
          <article className="panel metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
    </>
  );
}
