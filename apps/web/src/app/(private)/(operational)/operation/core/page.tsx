import {OperationsCore} from "@/modules/consolidated-core/operations-core";
import {requireContext} from "@/modules/auth/server/auth-session";
export default async function Page(){const user=await requireContext("operational");return <OperationsCore userId={user.userId} canOverride={user.roles.includes("ADMIN")}/>;}
