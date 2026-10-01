import { PublicHeader } from "@/shared/components/public-header";
import styles from "@/modules/menu/components/menu-catalog.module.css";

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`public-page ${styles.page}`}>
      <PublicHeader />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
