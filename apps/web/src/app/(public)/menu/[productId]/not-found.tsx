import Link from "next/link";

export default function ProductNotFound() {
  return (
    <section className="empty-state">
      <h1>Producto no encontrado</h1>
      <p>Este producto no está en el menú. Explora las opciones disponibles.</p>
      <Link href="/menu" className="button button--secondary">
        Volver al menú
      </Link>
    </section>
  );
}
