import Link from "next/link";
import { ArrowLeft, ArrowRight, DatabaseZap } from "lucide-react";

export function OperationalPlaceholder({
  description,
  nextSteps,
  title,
}: {
  description: string;
  nextSteps: string[];
  title: string;
}) {
  return (
    <div className="ops-placeholder">
      <Link className="text-action" href="/operation">
        <ArrowLeft aria-hidden="true" size={16} /> Volver a operación
      </Link>
      <header>
        <span className="ops-kicker">Módulo operativo</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <section
        className="ops-placeholder__workspace"
        aria-labelledby="next-steps-title"
      >
        <div className="ops-placeholder__notice">
          <DatabaseZap aria-hidden="true" size={21} />
          <div>
            <strong>Preparado para datos simulados</strong>
            <span>
              Esta ruta ya está conectada al shell y será desarrollada en el
              siguiente bloque.
            </span>
          </div>
        </div>
        <div>
          <h2 id="next-steps-title">Alcance previsto</h2>
          <ul>
            {nextSteps.map((step) => (
              <li key={step}>
                <ArrowRight aria-hidden="true" size={15} /> {step}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <p className="mock-disclaimer">
        Ruta provisional. No representa una vista terminada ni una integración
        con backend.
      </p>
    </div>
  );
}
