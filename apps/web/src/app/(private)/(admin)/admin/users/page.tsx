import { connection } from "next/server";
import { UserManagementView } from "@/modules/users";
import { getWokApiBaseUrl } from "@/shared/server/wok-backend";

export default async function AdminUsersPage() {
  await connection();
  return <UserManagementView backendEnabled={Boolean(getWokApiBaseUrl())} />;
}
