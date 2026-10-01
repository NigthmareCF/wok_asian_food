import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { CartLink } from "@/modules/cart/components/cart-link";
import { menuCategories, type MenuProduct } from "@/data/fixtures/menu";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import {
  menuAvailabilityLabels,
  menuCategoryIcons,
  formatMenuPrice,
} from "../lib/product-presentation";
import { ProductConfigurator } from "./product-configurator";
import styles from "./product-detail.module.css";

export function ProductDetail({ product }: { product: MenuProduct }) {
  const category = menuCategories.find(
    (entry) => entry.id === product.categoryId,
  );
  const Icon = menuCategoryIcons[product.categoryId];
  return (
    <div className={styles.detail}>
      <Link className={styles.back} href="/menu">
        <ArrowLeft aria-hidden="true" size={18} />
        Volver al menú
      </Link>
      <CartLink />
      <p className={styles.notice}>
        <Info aria-hidden="true" size={18} />
        La disponibilidad y la acción de agregar son demostrativas. No se envían
        pedidos ni se reserva stock.
      </p>
      <header className={styles.heading}>
        <div className={styles.category}>
          <Icon aria-hidden="true" size={26} />
          <span>{category?.name}</span>
        </div>
        <div className={styles.titleRow}>
          <h1>{product.name}</h1>
          <StatusBadge
            label={menuAvailabilityLabels[product.availability]}
            tone={product.availability === "available" ? "success" : "warning"}
          />
        </div>
        <p className={styles.basePrice}>
          Precio base <strong>{formatMenuPrice(product.price)}</strong>
        </p>
        {product.description ? (
          <p className={styles.description}>{product.description}</p>
        ) : null}
        {product.categoryId === "alcohol" ? (
          <p className={styles.description}>
            Bebida alcohólica para mayores de 18 años.
          </p>
        ) : null}
      </header>
      <ProductConfigurator key={product.id} product={product} />
    </div>
  );
}
