import { redirect } from "next/navigation";
import { LoginForm } from "@/modules/auth";
import { postLoginDestination } from "@/modules/auth/auth-policy";
import { currentSession } from "@/modules/auth/server/auth-session";
import { RestoreSession } from "@/modules/auth/components/restore-session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const user = await currentSession();
  if (user) {
    const next = (await searchParams).next;
    redirect(
      postLoginDestination(typeof next === "string" ? next : null, user.roles),
    );
  }
  return (
    <RestoreSession>
      <LoginForm />
    </RestoreSession>
  );
}
