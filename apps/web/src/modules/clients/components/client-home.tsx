import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChefHat,
  ChevronDown,
  Clock3,
  Coffee,
  Fish,
  MapPin,
  MessagesSquare,
  Plus,
  Soup,
  UtensilsCrossed,
  Wine,
} from "lucide-react";
import { homeMenuCategories, homeMenuProducts } from "@/data/fixtures/menu";
import {
  clientServiceFixture,
  type ServiceSnapshot,
} from "@/data/fixtures/client-home";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import styles from "./client-home.module.css";

const categoryIcons = {
  sushi: Fish,
  specialties: Soup,
  drinks: Coffee,
  extras: Plus,
  alcohol: Wine,
};

export function ServiceSummary({ service }: { service: ServiceSnapshot }) {
  const isOpen = service.state === "open";
  return (
    <aside
      className={styles.service}
      aria-label="Estado demostrativo del servicio"
    >
      <div className={styles.serviceHeading}>
        <StatusBadge
          label={isOpen ? "Abierto" : "Cerrado"}
          tone={isOpen ? "success" : "warning"}
        />
        <small>Datos demostrativos</small>
      </div>
      <p>
        <Clock3 size={18} aria-hidden="true" />
        {isOpen && service.preparationMinutes
          ? `Preparación estimada: ${service.preparationMinutes[0]}–${service.preparationMinutes[1]} min`
          : "Sin estimación de preparación"}
      </p>
      <small>
        {isOpen ? service.availability : "Servicio no disponible"} · No incluye
        traslado.
      </small>
    </aside>
  );
}

export function ClientHome() {
  const selection = homeMenuProducts.filter((product) => product.homePreview);
  return (
    <div className={styles.home}>
      <header className={styles.hero}>
        <div>
          <span className="eyebrow">WOK ASIAN FOOD</span>
          <h1>
            ¿Qué se te
            <br />
            antoja hoy?
          </h1>
          <p>
            Sushi, especialidades y algo para acompañar.
            <br />
            Encuentra tu próximo antojo en nuestro menú.
          </p>
          <Link className="button button--primary" href="/menu">
            Ver menú <ArrowRight aria-hidden="true" size={19} />
          </Link>
        </div>
        <ServiceSummary service={clientServiceFixture} />
      </header>

      <section aria-label="Acciones rápidas" className={styles.actions}>
        <Link href="/menu" className={styles.primaryAction}>
          <UtensilsCrossed aria-hidden="true" />
          <strong>Menú / Pedir</strong>
          <span>Explora los platillos</span>
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
        <details className={styles.action}>
          <summary>
            <CalendarDays aria-hidden="true" />
            <strong>Reservar</strong>
            <span>Demostrativo</span>
            <ChevronDown aria-hidden="true" size={18} />
          </summary>
          <p>
            Elige fecha, hora y personas para preparar una reserva demostrativa.
          </p>
          <Link href="/client/reservations/new" className={styles.textLink}>Crear reserva <ArrowRight aria-hidden="true" size={16} /></Link>
        </details>
        <details className={styles.action}>
          <summary>
            <MapPin aria-hidden="true" />
            <strong>Ubicación</strong>
            <span>Por confirmar</span>
            <ChevronDown aria-hidden="true" size={18} />
          </summary>
          <p>
            La dirección oficial y las indicaciones para llegar están pendientes
            de confirmar.
          </p>
          <Link href="/location" className={styles.textLink}>Ver ubicación <ArrowRight aria-hidden="true" size={16} /></Link>
        </details>
        <details className={styles.action}>
          <summary>
            <MessagesSquare aria-hidden="true" />
            <strong>Mensajes</strong>
            <span>Demostrativo</span>
            <ChevronDown aria-hidden="true" size={18} />
          </summary>
          <p>
            Comunícate con el restaurante mediante el buzón demostrativo.
          </p>
          <Link href="/client/messages" className={styles.textLink}>Abrir mensajes <ArrowRight aria-hidden="true" size={16} /></Link>
        </details>
      </section>

      <section aria-labelledby="home-categories">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">A TU GUSTO</span>
            <h2 id="home-categories">Explora el menú</h2>
          </div>
          <p>Conoce nuestras categorías.</p>
        </div>
        <div className={styles.categories}>
          {homeMenuCategories.map((category) => {
            const Icon = categoryIcons[category.id];
            return (
              <details key={category.id} className={styles.category}>
                <summary>
                  <Icon aria-hidden="true" size={28} />
                  <strong>{category.name}</strong>
                  <ChevronDown aria-hidden="true" size={16} />
                </summary>
                <p>{category.description}</p>
                <Link href="/menu" className={styles.textLink}>
                  Ver menú <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </details>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="home-discover">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">UN VISTAZO</span>
            <h2 id="home-discover">Descubre el menú</h2>
          </div>
          <Link className={styles.textLink} href="/menu">
            Ver menú completo <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
        <div className={styles.products}>
          {selection.map((product) => {
            const category = homeMenuCategories.find(
              (entry) => entry.id === product.categoryId,
            );
            const Icon = categoryIcons[product.categoryId];
            return (
              <article className={styles.product} key={product.id}>
                <div className={styles.placeholder}>
                  <Icon aria-hidden="true" size={44} strokeWidth={1} />
                  <span>Fotografía pendiente</span>
                </div>
                <div className={styles.productBody}>
                  <small>{category?.name}</small>
                  <div>
                    <h3>{product.name}</h3>
                    <strong>Q{product.price}</strong>
                  </div>
                  {product.note ? <p>{product.note}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <footer className={styles.note}>
        <ChefHat size={18} aria-hidden="true" />
        <p>
          Vista demostrativa. Consulta el menú para explorar; los pedidos y
          reservas no se procesan desde este inicio.
        </p>
      </footer>
    </div>
  );
}
