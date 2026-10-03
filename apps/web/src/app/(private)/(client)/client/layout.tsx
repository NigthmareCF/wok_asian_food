import { AppShell } from "@/shared/components/app-shell";
import { LiveCartLink } from "@/modules/cart/components/cart-link";
import { ClientSessionProvider } from "@/modules/clients/client-session-provider";
import { requireContext } from "@/modules/auth/server/auth-session";
export default async function ClientLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const currentUser = await requireContext("client");
  return (
    <ClientSessionProvider>
      <AppShell
        context="client"
        currentUser={currentUser}
        contextualActions={<LiveCartLink />}
      >
        {children}
      </AppShell>
    </ClientSessionProvider>
  );
}
