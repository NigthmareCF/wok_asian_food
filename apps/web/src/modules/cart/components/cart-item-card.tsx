import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/ui/status-badge";
import {
  formatMenuPrice,
  menuAvailabilityLabels,
} from "@/modules/menu/lib/product-presentation";
import type { CartRow } from "../lib/cart";
import styles from "./cart.module.css";

export function CartItemCard({
  row,
  busy,
  onQuantity,
  onRemove,
}: {
  row: CartRow;
  busy: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const name = row.product?.name ?? "Producto fuera del menú";
  return (
    <article className={`panel ${styles.item}`} aria-label={name}>
      <div className={styles.itemHeading}>
        <h2>{name}</h2>
        <StatusBadge
          label={
            row.product
              ? menuAvailabilityLabels[row.product.availability]
              : "No disponible"
          }
          tone={
            row.product?.availability === "available" ? "success" : "warning"
          }
        />
      </div>
      {row.product ? (
        <p className={styles.basePrice}>
          Precio base: {formatMenuPrice(row.product.price)}
        </p>
      ) : null}
      {row.product?.options?.some((group) => row.selectedOptions[group.id]) ? (
        <ul className={styles.modifiers}>
          {row.product.options.flatMap((group) => {
            const choice = group.choices.find(
              (entry) => entry.id === row.selectedOptions[group.id],
            );
            return choice
              ? [
                  <li key={group.id}>
                    {group.name}: {choice.name}
                    {choice.priceAdjustment
                      ? ` +${formatMenuPrice(choice.priceAdjustment)}`
                      : " · incluida"}
                  </li>,
                ]
              : [];
          })}
        </ul>
      ) : null}
      <p className={styles.unitPrice}>
        Por unidad: <strong>{formatMenuPrice(row.unitPrice)}</strong>
      </p>
      {row.conflict ? (
        <p className={styles.conflict}>
          No se puede continuar con este artículo: su disponibilidad o
          configuración cambió. Elimínalo y vuelve al menú.
        </p>
      ) : null}
      <div className={styles.itemControls}>
        <div
          className={styles.stepper}
          role="group"
          aria-label={`Cantidad de ${name}`}
        >
          <Button
            variant="secondary"
            type="button"
            aria-label={`Reducir cantidad de ${name}`}
            disabled={busy || row.quantity === 1}
            onClick={() => onQuantity(row.quantity - 1)}
          >
            <Minus aria-hidden="true" size={18} />
          </Button>
          <output aria-label={`Cantidad de ${name}`}>{row.quantity}</output>
          <Button
            variant="secondary"
            type="button"
            aria-label={`Aumentar cantidad de ${name}`}
            disabled={
              busy ||
              row.conflict ||
              !Number.isSafeInteger(
                Math.round(row.unitPrice * (row.quantity + 1) * 100),
              )
            }
            onClick={() => onQuantity(row.quantity + 1)}
          >
            <Plus aria-hidden="true" size={18} />
          </Button>
        </div>
        <Button
          variant="secondary"
          type="button"
          aria-label={`Eliminar ${name}`}
          disabled={busy}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" size={16} />
          Eliminar
        </Button>
      </div>
      <div className={styles.itemSubtotal}>
        <span>Subtotal del artículo</span>
        <strong>{formatMenuPrice(row.subtotal)}</strong>
      </div>
    </article>
  );
}
