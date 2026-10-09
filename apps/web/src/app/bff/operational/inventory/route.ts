import { NextRequest } from "next/server";
import { endpoint } from "@/modules/client-workflows/server/endpoint";
import { isInventoryList } from "@/modules/inventory/live-contract";

export const GET = (request: NextRequest) => {
  const params = new URLSearchParams();
  for (const key of ["search", "status"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return endpoint(request, {
    path: `operational/inventory/items${query ? `?${query}` : ""}`,
    method: "GET",
    validate: isInventoryList,
  });
};
