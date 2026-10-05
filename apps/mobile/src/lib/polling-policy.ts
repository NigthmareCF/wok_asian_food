export type ForegroundState = "active" | "background" | "inactive" | "unknown" | "extension";

export function isPollingAllowed(appState: ForegroundState, enabled: boolean) {
  return enabled && appState === "active";
}
