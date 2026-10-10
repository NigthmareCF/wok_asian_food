import Link from "next/link";

export function BackendUnavailable({
  title,
  contract,
}: {
  title: string;
  contract: string;
}) {
  return (
    <section className="ops-work-panel">
      <h1>{title}</h1>
      <p role="status">Bloqueado: integración pendiente.</p>
      <p>{contract}</p>
      <p>No hay datos disponibles para esta función.</p>
      <Link className="button button--secondary" href="/">
        Volver al inicio
      </Link>
    </section>
  );
}
