"use client";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useLiveCart } from "../live-cart-provider";
import { useCart } from "../cart-provider";
import styles from "./cart.module.css";

export function CartLink() {
  const { items } = useCart();
  return (
    <CartCountLink
      count={items.reduce((sum, item) => sum + item.quantity, 0)}
    />
  );
}

export function LiveCartLink() {
  const { items } = useLiveCart();
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  return <CartCountLink count={count} />;
}

function CartCountLink({ count }: { count: number }) {
  return (
    <Link
      href="/client/cart"
      className={styles.cartLink}
      aria-label={`Tu pedido, ${count} artículos`}
    >
      <ShoppingBag aria-hidden="true" size={18} />
      Tu pedido <span>{count}</span>
    </Link>
  );
}
