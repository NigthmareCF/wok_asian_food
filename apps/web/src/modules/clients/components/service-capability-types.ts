export type ServiceCapability = {
  code: string;
  status: "ENABLED" | "MANUAL_APPROVAL" | "PAUSED" | "DISABLED";
};
