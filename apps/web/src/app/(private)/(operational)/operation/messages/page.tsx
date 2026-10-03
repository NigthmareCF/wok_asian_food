import { LiveMessaging } from "@/modules/messaging/components/live-messaging";
import { requireContext } from "@/modules/auth/server/auth-session";

export default async function MessagesPage() {
  const user = await requireContext("operational");
  return <LiveMessaging key={user.userId} userId={user.userId} staff />;
}
