export default function Loading() {
  return (
    <main className="centered-state" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>Cargando contenido...</p>
    </main>
  );
}
