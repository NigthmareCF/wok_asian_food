import { AppShell } from "@/shared/components/app-shell";
import { CartLink } from "@/modules/cart";
import { ClientSessionProvider } from "@/modules/clients/client-session-provider";
export default function ClientLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClientSessionProvider>
      <AppShell context="client" contextualActions={<CartLink />}>
        {children}
      </AppShell>
    </ClientSessionProvider>
  );
}
