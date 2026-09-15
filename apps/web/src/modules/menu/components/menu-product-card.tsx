import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import {
  menuCategoryIcons,
  menuAvailabilityLabels,
} from "../lib/product-presentation";
import { menuCategories, type MenuProduct } from "@/data/fixtures/menu";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import styles from "./menu-catalog.module.css";

export function MenuProductCard({ product }: { product: MenuProduct }) {
  const Icon = menuCategoryIcons[product.categoryId];
  const category = menuCategories.find(
    (entry) => entry.id === product.categoryId,
  );
  const hasOptions = Boolean(product.options?.length);

  return (
    <article
      className={`panel ${styles.card}`}
      aria-labelledby={`product-${product.id}`}
    >
      <div className={styles.cardContext}>
        <span className={styles.categoryIcon}>
          <Icon aria-hidden="true" size={22} />
        </span>
        <span>{category?.name}</span>
      </div>
      <div className={styles.cardTitle}>
        <h3 id={`product-${product.id}`}>{product.name}</h3>
        <strong>Q{product.price}</strong>
      </div>
      {product.description ? (
        <p className={styles.description}>{product.description}</p>
      ) : null}
      {hasOptions ? (
        <p className={styles.options}>
          <SlidersHorizontal aria-hidden="true" size={15} />
          Opciones disponibles
        </p>
      ) : null}
      <div className={styles.cardFooter}>
        <StatusBadge
          label={menuAvailabilityLabels[product.availability]}
          tone={product.availability === "available" ? "success" : "warning"}
        />
        <Link
          className={styles.detailLink}
          href={`/menu/${product.id}`}
          aria-label={`Ver detalle de ${product.name}`}
        >
          Ver detalle <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </div>
    </article>
  );
}
