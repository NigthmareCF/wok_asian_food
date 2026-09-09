export type RealtimeStatus =
  "connected" | "reconnecting" | "disconnected" | "stale";
export type RealtimeEvent = {
  id: string;
  type: string;
  entityId: string;
  version?: number;
};
export type Unsubscribe = () => void;

export interface RealtimeClient {
  getStatus(): RealtimeStatus;
  subscribe(
    type: string,
    listener: (event: RealtimeEvent) => void,
  ): Unsubscribe;
}
