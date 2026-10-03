import { LiveMessaging } from "@/modules/messaging/components/live-messaging";
import { requireContext } from "@/modules/auth/server/auth-session";

export default async function ClientMessagesPage() {
  const user = await requireContext("client");
  return <LiveMessaging key={user.userId} userId={user.userId} />;
}
