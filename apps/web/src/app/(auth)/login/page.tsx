import { connection } from "next/server";
import { LoginForm } from "@/modules/auth";
import { getWokApiBaseUrl } from "@/shared/server/wok-backend";
export default async function LoginPage() {
  await connection();
  return <LoginForm backendEnabled={Boolean(getWokApiBaseUrl())} />;
}
