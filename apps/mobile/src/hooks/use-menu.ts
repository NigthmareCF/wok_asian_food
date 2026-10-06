import { QueryClient, useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api";
import { menuSchema } from "@/lib/catalog";

const menuClient = new QueryClient();

export function useMenu() {
  return useQuery({
    queryKey: ["public-menu"],
    async queryFn({ signal }) {
      const result = menuSchema.safeParse(await apiRequest<unknown>("/api/v1/public/menu", { signal }));
      if (!result.success) throw new ApiError("No pudimos validar el menú oficial.", 503);
      return result.data;
    },
    staleTime: 0, retry: false, refetchOnMount: "always",
    refetchOnReconnect: false, refetchOnWindowFocus: false,
  }, menuClient);
}
