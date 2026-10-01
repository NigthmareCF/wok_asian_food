import { AppShell } from "@/shared/components/app-shell";
import { CartLink } from "@/modules/cart";
export default function ClientLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppShell context="client" contextualActions={<CartLink />}>
      {children}
    </AppShell>
  );
}
