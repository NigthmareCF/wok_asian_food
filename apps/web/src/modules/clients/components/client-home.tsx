"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChefHat,
  ChevronDown,
  Clock3,
  MapPin,
  MessagesSquare,
  RefreshCw,
  UtensilsCrossed,
} from "lucide-react";
import { usePublicMenu } from "@/modules/menu/use-public-menu";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import styles from "./client-home.module.css";
import { MenuProductImage } from "@/modules/menu/components/menu-product-image";

export function ServiceSummary() {
  return (
    <aside className={styles.service} aria-label="Estado del servicio">
      <div className={styles.serviceHeading}>
        <StatusBadge label="Estado no verificado" tone="info" />
      </div>
      <p>
        <Clock3 size={18} aria-hidden="true" />
        Sin estimación de preparación
      </p>
      <small>No hay información confirmada sobre apertura ni horarios.</small>
    </aside>
  );
}

export function ClientHome() {
  const { menu, error, reload } = usePublicMenu();
  const selection =
    menu?.categories
      .flatMap((category) =>
        category.items.map((item) => ({
          ...item,
          categoryName: category.name,
        })),
      )
      .slice(0, 6) ?? [];
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
          <p>Encuentra tu próximo antojo en nuestro menú.</p>
          <Link className="button button--primary" href="/client/menu">
            Ver menú <ArrowRight aria-hidden="true" size={19} />
          </Link>
        </div>
        <ServiceSummary />
      </header>

      <section aria-label="Acciones rápidas" className={styles.actions}>
        <Link href="/client/menu" className={styles.primaryAction}>
          <UtensilsCrossed aria-hidden="true" />
          <strong>Menú / Pedir</strong>
          <span>Explora los platillos</span>
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
        <Link href="/client/reservations/new" className={styles.action}>
          <CalendarDays aria-hidden="true" />
          <strong>Reservar</strong>
          <span>Fecha y personas</span>
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
        <Link href="/location" className={styles.action}>
          <MapPin aria-hidden="true" />
          <strong>Ubicación</strong>
          <span>Datos del restaurante</span>
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
        <Link href="/client/messages" className={styles.action}>
          <MessagesSquare aria-hidden="true" />
          <strong>Mensajes</strong>
          <span>Abrir conversaciones</span>
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </section>

      {error ? (
        <div>
          <p role="alert">No fue posible cargar el menú. Intenta nuevamente.</p>
          <Button onClick={reload}>
            <RefreshCw aria-hidden="true" size={18} /> Reintentar
          </Button>
        </div>
      ) : !menu ? (
        <p role="status">Cargando menú…</p>
      ) : (
        <>
          <section aria-labelledby="home-categories">
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">A TU GUSTO</span>
                <h2 id="home-categories">Explora el menú</h2>
              </div>
              <p>Conoce nuestras categorías.</p>
            </div>
            <div className={styles.categories}>
              {menu.categories.map((category) => {
                return (
                  <details key={category.id} className={styles.category}>
                    <summary>
                      <UtensilsCrossed aria-hidden="true" size={28} />
                      <strong>{category.name}</strong>
                      <ChevronDown aria-hidden="true" size={16} />
                    </summary>
                    <Link href="/client/menu" className={styles.textLink}>
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
              <Link className={styles.textLink} href="/client/menu">
                Ver menú completo <ArrowRight aria-hidden="true" size={18} />
              </Link>
            </div>
            {selection.length === 0 ? (
              <div>
                <p role="status">El menú aún no tiene productos.</p>
                <Button onClick={reload}>
                  <RefreshCw aria-hidden="true" size={18} /> Reintentar
                </Button>
              </div>
            ) : (
              <div className={styles.products}>
                {selection.map((product) => {
                  return (
                    <article className={styles.product} key={product.id}>
                      <MenuProductImage
                        name={product.name}
                        imageReference={product.imageReference}
                        className={styles.productImage}
                        placeholderLabel="Sin fotografía"
                      />
                      <div className={styles.productBody}>
                        <small>{product.categoryName}</small>
                        <div>
                          <h3>{product.name}</h3>
                          <strong>
                            {new Intl.NumberFormat("es-GT", {
                              style: "currency",
                              currency: product.currency,
                            }).format(product.price)}
                          </strong>
                        </div>
                        {product.description ? (
                          <p>{product.description}</p>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
      <footer className={styles.note}>
        <ChefHat size={18} aria-hidden="true" />
        <p>
          Consulta el menú para explorar; los pedidos y reservas no se procesan
          desde este inicio.
        </p>
      </footer>
    </div>
  );
}
