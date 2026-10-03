import { isPublicMenu } from "../public-menu";

export async function loadPublicMenu() {
  const base = (
    process.env.WOK_API_BASE_URL ?? "http://localhost:8080"
  ).replace(/\/$/, "");
  const response = await fetch(`${base}/api/v1/public/menu`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Menu unavailable");
  const data: unknown = await response.json();
  if (!isPublicMenu(data)) throw new Error("Invalid menu response");
  return data;
}
