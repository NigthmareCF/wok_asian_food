"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Minus, Plus } from "lucide-react";
import type { MenuProduct } from "@/data/fixtures/menu";
import { Button } from "@/shared/components/ui/button";
import { useCart } from "@/modules/cart/cart-provider";
import {
  configureProduct,
  type ProductSelections,
} from "../lib/configure-product";
import { formatMenuPrice } from "../lib/product-presentation";
import styles from "./product-detail.module.css";

export function ProductConfigurator({ product }: { product: MenuProduct }) {
  const { addItem } = useCart();
  const [selections, setSelections] = useState<ProductSelections>({});
  const [quantity, setQuantity] = useState(1);
  const [confirmation, setConfirmation] = useState("");
  const configuration = configureProduct(product, selections, quantity);
  const unavailable = product.availability === "unavailable";
  const options = product.options ?? [];

  function selectChoice(groupId: string, choiceId: string) {
    setSelections((current) => ({ ...current, [groupId]: choiceId }));
    setConfirmation("");
  }

  function changeQuantity(next: number) {
    if (next < 1 || !Number.isSafeInteger(next)) return;
    setQuantity(next);
    setConfirmation("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configuration.canAdd) return;
    addItem({ productId: product.id, quantity, selectedOptions: selections });
    setConfirmation(
      `${quantity} × ${product.name} agregado a tu pedido local. No reserva disponibilidad ni envía un pedido al restaurante.`,
    );
  }

  return (
    <form className={styles.configuration} onSubmit={submit}>
      <section
        className={styles.controls}
        aria-labelledby="configuration-heading"
      >
        <h2 id="configuration-heading">
          {options.length ? "Prepáralo a tu gusto" : "Elige la cantidad"}
        </h2>
        {options.map((group) => (
          <fieldset
            key={group.id}
            className={styles.optionGroup}
            disabled={unavailable}
          >
            <legend>
              {group.name}{" "}
              <span>
                {group.required
                  ? "Elige una opción · obligatorio"
                  : "Opcional · elige una opción"}
              </span>
            </legend>
            {!group.required ? (
              <label className={styles.choice}>
                <input
                  type="radio"
                  name={group.id}
                  value=""
                  checked={!selections[group.id]}
                  onChange={() => selectChoice(group.id, "")}
                />
                <span>Sin suplemento</span>
                <small>+Q0</small>
              </label>
            ) : null}
            {group.choices.map((choice) => (
              <label className={styles.choice} key={choice.id}>
                <input
                  type="radio"
                  name={group.id}
                  value={choice.id}
                  required={group.required}
                  checked={selections[group.id] === choice.id}
                  onChange={() => selectChoice(group.id, choice.id)}
                />
                <span>{choice.name}</span>
                <small>
                  {choice.priceAdjustment
                    ? `+${formatMenuPrice(choice.priceAdjustment)}`
                    : "Incluida"}
                </small>
              </label>
            ))}
          </fieldset>
        ))}
        <div className={styles.quantityRow}>
          <span id="quantity-label">Cantidad</span>
          <div
            className={styles.stepper}
            role="group"
            aria-labelledby="quantity-label"
          >
            <Button
              variant="secondary"
              type="button"
              aria-label="Reducir cantidad"
              disabled={unavailable || quantity === 1}
              onClick={() => changeQuantity(quantity - 1)}
            >
              <Minus aria-hidden="true" size={18} />
            </Button>
            <output aria-label="Cantidad seleccionada">{quantity}</output>
            <Button
              variant="secondary"
              type="button"
              aria-label="Aumentar cantidad"
              disabled={
                unavailable ||
                !Number.isSafeInteger(
                  Math.round(configuration.unitPrice * (quantity + 1) * 100),
                )
              }
              onClick={() => changeQuantity(quantity + 1)}
            >
              <Plus aria-hidden="true" size={18} />
            </Button>
          </div>
        </div>
      </section>
      <aside className={styles.summary} aria-labelledby="summary-heading">
        <h2 id="summary-heading">Tu selección</h2>
        <dl>
          <div>
            <dt>Precio base</dt>
            <dd>{formatMenuPrice(product.price)}</dd>
          </div>
          {configuration.choices.map((choice, index) => (
            <div key={`${choice.id}-${index}`}>
              <dt>{choice.name}</dt>
              <dd>
                {choice.priceAdjustment
                  ? `+${formatMenuPrice(choice.priceAdjustment)}`
                  : "Incluida"}
              </dd>
            </div>
          ))}
          <div>
            <dt>Por unidad</dt>
            <dd>{formatMenuPrice(configuration.unitPrice)}</dd>
          </div>
          <div>
            <dt>Cantidad</dt>
            <dd>{quantity}</dd>
          </div>
        </dl>
        <div className={styles.total}>
          <span>Total</span>
          <output aria-label="Total del producto" aria-live="polite">
            {formatMenuPrice(configuration.total)}
          </output>
        </div>
        <p id="configuration-help" className={styles.help}>
          {unavailable
            ? "Este producto no está disponible. No se puede agregar al pedido."
            : !configuration.complete
              ? "Selecciona las opciones obligatorias para continuar."
              : "Se agrega solo en esta sesión. Al recargar se vacía; no reserva disponibilidad."}
        </p>
        <Button
          fullWidth
          type="submit"
          disabled={!configuration.canAdd}
          aria-describedby="configuration-help"
        >
          Agregar al pedido · {formatMenuPrice(configuration.total)}
        </Button>
        {confirmation ? (
          <p className={styles.confirmation} role="status">
            <CheckCircle2 aria-hidden="true" size={20} />
            {confirmation}
          </p>
        ) : null}
      </aside>
    </form>
  );
}
