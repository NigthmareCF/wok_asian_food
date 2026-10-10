export type NavigationProviderState = "available" | "pending";
export type LocationPermissionState = "denied" | "not-requested";

export type LocationSnapshot = {
  address?: string;
  navigationProviderState: NavigationProviderState;
  navigationUrl?: string;
  permissionState: LocationPermissionState;
  schedule?: string;
};

export const locationFixture: LocationSnapshot = {
  navigationProviderState: "available",
  navigationUrl: "https://maps.app.goo.gl/R3Rbp29S6RZkE257A",
  permissionState: "not-requested",
};

export const locationPermissionDeniedFixture: LocationSnapshot = {
  navigationProviderState: "pending",
  permissionState: "denied",
};
