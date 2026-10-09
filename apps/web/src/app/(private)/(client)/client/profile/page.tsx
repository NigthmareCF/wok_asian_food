import { requireContext } from "@/modules/auth/server/auth-session";
import { LiveProfile } from "@/modules/clients/components/live-profile";
export default async function ClientProfilePage() {
  const user = await requireContext("client");
  return <LiveProfile key={user.userId} userId={user.userId} />;
}
