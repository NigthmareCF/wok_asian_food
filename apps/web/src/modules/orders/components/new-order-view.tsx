"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChefHat,
  Clock3,
  Minus,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import {
  getOrderTotal,
  orderProducts,
  type OrderChannel,
  type OrderItem,
  type OrderProduct,
} from "@/data/fixtures/orders";
import { operationalTables } from "@/data/fixtures/operation";
import { useTableSession } from "@/modules/tables";
import { useOrderSession } from "../order-session-provider";

const categories = ["Todos", "Entradas", "Woks", "Sushi", "Bebidas"] as const;
type Category = (typeof categories)[number];

const availabilityMeta = {
  available: { label: "Disponible", tone: "success" },
  low: { label: "Pocas unidades", tone: "warning" },
  unavailable: { label: "Agotado", tone: "danger" },
} as const;

export function NewOrderView() {
  const router = useRouter();
  const { createOrder } = useOrderSession();
  const { joinedGroups } = useTableSession();
  const [category, setCategory] = useState<Category>("Todos");
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<OrderChannel>("table");
  const [table, setTable] = useState("Mesa 1");
  const [customer, setCustomer] = useState("");
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [openProduct, setOpenProduct] = useState<OrderProduct | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<
    Record<string, string>
  >({});
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return orderProducts.filter(
      (product) =>
        (category === "Todos" || product.category === category) &&
        (!normalizedQuery ||
          product.name.toLocaleLowerCase("es").includes(normalizedQuery) ||
          product.description
            .toLocaleLowerCase("es")
            .includes(normalizedQuery)),
    );
  }, [category, query]);

  const tableOptions = useMemo(() => {
    const joinedTableIds = new Set(
      joinedGroups.flatMap((group) => group.tableIds),
    );
    const standaloneTables = operationalTables
      .filter((item) => !joinedTableIds.has(item.id))
      .map((item) => ({
        id: item.id,
        label: `Mesa ${item.number}`,
      }));
    const combinedTables = joinedGroups.map((group) => ({
      id: group.id,
      label: `Mesas ${group.numbers.join(" y ")} unidas`,
    }));

    return [...combinedTables, ...standaloneTables];
  }, [joinedGroups]);

  const selectedTable = tableOptions.some((option) => option.label === table)
    ? table
    : (tableOptions[0]?.label ?? "");

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const total = getOrderTotal(cart);
  const source = channel === "table" ? selectedTable : customer.trim();
  const canSend = cart.length > 0 && source.length > 0;

  const addConfiguredProduct = () => {
    if (!openProduct) return;
    const groups = openProduct.modifierGroups ?? [];
    const modifierOptions = groups.flatMap((group) => group.options);
    const selectedOptionIds = groups
      .map((group) => selectedModifiers[group.id])
      .filter(Boolean);
    const selectedOptions = selectedOptionIds
      .map((optionId) =>
        modifierOptions.find((option) => option.id === optionId),
      )
      .filter((option): option is NonNullable<typeof option> =>
        Boolean(option),
      );
    const modifierLabels = selectedOptions.map((option) => option.label);
    const unitPrice =
      openProduct.price +
      selectedOptions.reduce((sum, option) => sum + option.price, 0);
    const itemId = `${openProduct.id}-${selectedOptionIds.join("-") || "base"}-${notes.trim() || "plain"}`;

    setCart((current) => {
      const existing = current.find((item) => item.id === itemId);
      if (existing) {
        return current.map((item) =>
          item.id === itemId ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...current,
        {
          id: itemId,
          productId: openProduct.id,
          name: openProduct.name,
          quantity: 1,
          unitPrice,
          modifiers: modifierLabels,
          notes: notes.trim() || undefined,
        },
      ];
    });
    setOpenProduct(null);
    setSelectedModifiers({});
    setNotes("");
  };

  const chooseProduct = (product: OrderProduct) => {
    if (product.availability === "unavailable") return;
    setOpenProduct(product);
    setSelectedModifiers({});
    setNotes("");
  };

  const changeQuantity = (itemId: string, amount: number) => {
    setCart((current) =>
      current
        .map((item) =>
          item.id === itemId
            ? { ...item, quantity: Math.max(0, item.quantity + amount) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const confirmOrder = () => {
    if (!canSend) return;
    const formattedSource =
      channel === "table"
        ? selectedTable
        : `${channel === "delivery" ? "Delivery" : "Recoger"} · ${customer.trim()}`;
    const orderId = createOrder({
      channel,
      source: formattedSource,
      items: cart,
    });
    router.push(`/operation/orders/${orderId}`);
  };

  const requiredModifiersReady =
    openProduct?.modifierGroups
      ?.filter((group) => group.required)
      .every((group) => Boolean(selectedModifiers[group.id])) ?? true;

  return (
    <div className="orders-page order-builder">
      <header className="ops-page-header orders-page__header">
        <div>
          <Link className="text-action" href="/operation/orders">
            <ArrowLeft aria-hidden="true" size={16} /> Volver a pedidos
          </Link>
          <span className="ops-kicker">Nueva comanda</span>
          <h1>Nuevo pedido</h1>
          <p>
            Selecciona el origen, agrega productos y confirma antes de cocina.
          </p>
        </div>
        <span className="order-cart-counter">
          <ShoppingCart aria-hidden="true" size={18} /> {cartCount} productos
        </span>
      </header>

      <section className="order-origin" aria-labelledby="order-origin-title">
        <div>
          <h2 id="order-origin-title">Origen del pedido</h2>
          <div className="order-channel-picker" aria-label="Origen del pedido">
            {(
              [
                ["table", "Mesa"],
                ["pickup", "Para recoger"],
                ["delivery", "Delivery"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={channel === value}
                key={value}
                onClick={() => setChannel(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {channel === "table" ? (
          <label className="order-field">
            <span>Mesa</span>
            <select
              onChange={(event) => setTable(event.target.value)}
              value={selectedTable}
            >
              {tableOptions.map((option) => (
                <option key={option.id} value={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="order-field">
            <span>Nombre del cliente</span>
            <input
              onChange={(event) => setCustomer(event.target.value)}
              placeholder="Ej. Andrea López"
              value={customer}
            />
          </label>
        )}
      </section>

      <div className="order-builder__layout">
        <main className="order-catalog">
          <div className="orders-toolbar order-catalog__toolbar">
            <div className="orders-filter" aria-label="Categorías del menú">
              {categories.map((item) => (
                <button
                  aria-pressed={category === item}
                  key={item}
                  onClick={() => setCategory(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            <label className="orders-search">
              <Search aria-hidden="true" size={18} />
              <span className="sr-only">Buscar productos</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar producto"
                type="search"
                value={query}
              />
            </label>
          </div>

          <div className="product-grid">
            {visibleProducts.map((product) => {
              const availability = availabilityMeta[product.availability];
              return (
                <article
                  className={`product-card product-card--${availability.tone}`}
                  key={product.id}
                >
                  <div className="product-card__top">
                    <span>{product.category}</span>
                    <span
                      className={`availability availability--${availability.tone}`}
                    >
                      {availability.label}
                    </span>
                  </div>
                  <div className="product-card__body">
                    <h3>{product.name}</h3>
                    <p>{product.description}</p>
                    {product.remaining ? (
                      <small>
                        <AlertTriangle aria-hidden="true" size={14} /> Quedan{" "}
                        {product.remaining}
                      </small>
                    ) : null}
                  </div>
                  <div className="product-card__footer">
                    <div>
                      <strong>Q {product.price.toFixed(2)}</strong>
                      <span>
                        <Clock3 aria-hidden="true" size={14} /> {product.eta}{" "}
                        min
                      </span>
                    </div>
                    <button
                      aria-label={`Agregar ${product.name}`}
                      className="icon-button product-card__add"
                      disabled={product.availability === "unavailable"}
                      onClick={() => chooseProduct(product)}
                      title={
                        product.availability === "unavailable"
                          ? "Producto agotado"
                          : `Agregar ${product.name}`
                      }
                      type="button"
                    >
                      <Plus aria-hidden="true" size={19} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </main>

        <aside className="order-cart" aria-labelledby="cart-title">
          <div className="order-cart__heading">
            <div>
              <span>Comanda actual</span>
              <h2 id="cart-title">
                {channel === "table" ? selectedTable : "Pedido externo"}
              </h2>
            </div>
            <strong>{cartCount}</strong>
          </div>

          <div className="order-cart__items">
            {cart.map((item) => (
              <div className="cart-item" key={item.id}>
                <div className="cart-item__heading">
                  <div>
                    <strong>{item.name}</strong>
                    {item.modifiers.length > 0 ? (
                      <span>{item.modifiers.join(" · ")}</span>
                    ) : null}
                    {item.notes ? <small>Nota: {item.notes}</small> : null}
                  </div>
                  <button
                    aria-label={`Quitar ${item.name}`}
                    className="icon-button icon-button--quiet"
                    onClick={() =>
                      setCart((current) =>
                        current.filter((entry) => entry.id !== item.id),
                      )
                    }
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={17} />
                  </button>
                </div>
                <div className="cart-item__controls">
                  <div className="quantity-control">
                    <button
                      aria-label={`Restar ${item.name}`}
                      onClick={() => changeQuantity(item.id, -1)}
                      type="button"
                    >
                      <Minus aria-hidden="true" size={15} />
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      aria-label={`Sumar ${item.name}`}
                      onClick={() => changeQuantity(item.id, 1)}
                      type="button"
                    >
                      <Plus aria-hidden="true" size={15} />
                    </button>
                  </div>
                  <strong>
                    Q {(item.unitPrice * item.quantity).toFixed(2)}
                  </strong>
                </div>
              </div>
            ))}
            {cart.length === 0 ? (
              <div className="order-cart__empty">
                <ShoppingCart aria-hidden="true" size={24} />
                <strong>La comanda está vacía</strong>
                <span>Agrega productos desde el menú.</span>
              </div>
            ) : null}
          </div>

          <div className="order-cart__total">
            <span>Total estimado</span>
            <strong>Q {total.toFixed(2)}</strong>
          </div>
          {!source ? (
            <p className="order-cart__hint">Ingresa el nombre del cliente.</p>
          ) : null}
          <button
            className="button button--primary button--full"
            disabled={!canSend}
            onClick={() => setConfirming(true)}
            type="button"
          >
            <Send aria-hidden="true" size={18} /> Revisar y enviar
          </button>
        </aside>
      </div>

      <p className="mock-disclaimer">
        La disponibilidad y el ETA son aproximados hasta integrar cocina e
        inventario.
      </p>

      {openProduct ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="configure-product-title"
            aria-modal="true"
            className="confirm-dialog product-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar configuración"
              className="icon-button confirm-dialog__close"
              onClick={() => setOpenProduct(null)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <ChefHat aria-hidden="true" size={22} />
            </span>
            <h2 id="configure-product-title">{openProduct.name}</h2>
            <p>Configura el producto antes de agregarlo a la comanda.</p>
            <div className="product-dialog__groups">
              {(openProduct.modifierGroups ?? []).map((group) => (
                <fieldset key={group.id}>
                  <legend>
                    {group.label}{" "}
                    {group.required ? <span>Obligatorio</span> : null}
                  </legend>
                  <div className="modifier-options">
                    {group.options.map((option) => (
                      <label key={option.id}>
                        <input
                          checked={selectedModifiers[group.id] === option.id}
                          name={group.id}
                          onChange={() =>
                            setSelectedModifiers((current) => ({
                              ...current,
                              [group.id]: option.id,
                            }))
                          }
                          type="radio"
                        />
                        <span>{option.label}</span>
                        {option.price > 0 ? (
                          <small>+ Q {option.price.toFixed(2)}</small>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <label className="order-field">
                <span>Nota para cocina (opcional)</span>
                <textarea
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Ej. sin cebollín"
                  rows={2}
                  value={notes}
                />
              </label>
            </div>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setOpenProduct(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                disabled={!requiredModifiersReady}
                onClick={addConfiguredProduct}
                type="button"
              >
                <Plus aria-hidden="true" size={17} /> Agregar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {confirming ? (
        <div className="confirm-dialog__backdrop" role="presentation">
          <section
            aria-labelledby="send-order-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <button
              aria-label="Cerrar confirmación"
              className="icon-button confirm-dialog__close"
              onClick={() => setConfirming(false)}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
            <span className="confirm-dialog__icon">
              <Check aria-hidden="true" size={22} />
            </span>
            <h2 id="send-order-title">Enviar pedido a cocina</h2>
            <p>
              Se enviarán {cartCount} productos para {source}. Revisa cualquier
              nota antes de continuar.
            </p>
            <strong className="confirm-dialog__amount">
              Q {total.toFixed(2)}
            </strong>
            <div className="confirm-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setConfirming(false)}
                type="button"
              >
                Volver
              </button>
              <button
                className="button button--primary"
                onClick={confirmOrder}
                type="button"
              >
                <Send aria-hidden="true" size={17} /> Confirmar envío
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
