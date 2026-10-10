import { LiveMenuCatalog } from "@/modules/menu/components/live-menu-catalog";
import styles from "@/modules/menu/components/menu-catalog.module.css";

export default function ClientMenuPage() {
  return (
    <div className={styles.content}>
      <header className={styles.heading}>
        <div>
          <span className="eyebrow">WOK ASIAN FOOD</span>
          <h1>Menú</h1>
          <p>Del sushi al wok. Encuentra algo para cada antojo.</p>
        </div>
      </header>
      <LiveMenuCatalog />
    </div>
  );
}
