"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { clientIdentityStore } from "./client-identity-store";

const noSubscription = () => () => {};
export function useClientIdentity(expectedUserId?: string, enabled = true) {
  const identity = useSyncExternalStore(
    enabled ? clientIdentityStore.subscribe : noSubscription,
    clientIdentityStore.getSnapshot,
    clientIdentityStore.getServerSnapshot,
  );
  const previous = useRef(expectedUserId);
  useEffect(() => {
    if (!enabled) return;
    const current = clientIdentityStore.getSnapshot();
    if (
      previous.current !== expectedUserId ||
      current.status === "unverified" ||
      (expectedUserId &&
        current.status === "verified" &&
        current.ownerId !== expectedUserId)
    ) {
      previous.current = expectedUserId;
      void clientIdentityStore.refresh();
    }
  }, [expectedUserId, enabled]);
  return {
    identity,
    verified:
      identity.status === "verified" &&
      (!expectedUserId || expectedUserId === identity.ownerId),
    refresh: clientIdentityStore.refresh,
  };
}
