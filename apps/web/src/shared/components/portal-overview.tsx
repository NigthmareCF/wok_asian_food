import Link from "next/link";
import { ArrowRight, MapPin, UtensilsCrossed } from "lucide-react";
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
  const isClient = context === "client";
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
      {isClient ? (
        <section className="client-overview" aria-label="Accesos del cliente">
          <div className="client-overview__heading">
            <div>
              <span className="eyebrow">EXPERIENCIA DEMOSTRATIVA</span>
              <h2>¿Qué te gustaría hacer?</h2>
              <p>Consulta el menú o encuentra la ubicación del restaurante.</p>
            </div>
          </div>
          <div className="client-overview__actions">
            <Link className="client-action-card" href="/menu">
              <UtensilsCrossed aria-hidden="true" size={26} />
              <div>
                <strong>Explorar menú</strong>
                <span>Revisa platillos y disponibilidad.</span>
              </div>
              <ArrowRight aria-hidden="true" size={20} />
            </Link>
            <Link className="client-action-card" href="/location">
              <MapPin aria-hidden="true" size={26} />
              <div>
                <strong>Ver ubicación</strong>
                <span>Consulta cómo llegar a WOK Asian Food.</span>
              </div>
              <ArrowRight aria-hidden="true" size={20} />
            </Link>
          </div>
          <p className="client-overview__notice">
            Los datos y acciones de esta pantalla son demostrativos; no
            representan una orden confirmada.
          </p>
        </section>
      ) : null}
    </>
  );
}
