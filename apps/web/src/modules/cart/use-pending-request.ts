"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  pendingRequestFixture,
  type PendingRequestStatus,
} from "@/data/fixtures/pending-request";

export type PendingRequest = {
  status: PendingRequestStatus;
  waiting: boolean;
  noticeRequested: boolean;
};

export function usePendingRequest() {
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(
    null,
  );
  const current = useRef<PendingRequest | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);

  const commit = useCallback((request: PendingRequest | null) => {
    current.current = request;
    setPendingRequest(request);
  }, []);

  const stopRetry = useCallback(() => {
    generation.current += 1;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const cancelPendingRequest = useCallback(() => {
    stopRetry();
    commit(null);
  }, [commit, stopRetry]);

  const beginPendingRequest = useCallback(
    (status: PendingRequestStatus = pendingRequestFixture.initialStatus) => {
      // One local request at a time; repeated clicks resume the same request.
      if (current.current) return;
      commit({
        status: navigator.onLine ? status : "offline",
        waiting: false,
        noticeRequested: false,
      });
    },
    [commit],
  );

  const waitForPendingRequest = useCallback(() => {
    const request = current.current;
    if (!request || request.waiting) return;
    stopRetry();
    const requestGeneration = generation.current;
    commit({
      ...request,
      waiting: true,
      status: request.status === "offline" ? "reconnecting" : request.status,
    });
    timer.current = setTimeout(() => {
      if (requestGeneration !== generation.current || !current.current) return;
      timer.current = null;
      commit({
        ...current.current,
        waiting: false,
        status: navigator.onLine
          ? pendingRequestFixture.retryResult
          : "offline",
      });
    }, pendingRequestFixture.retryDelayMs);
  }, [commit, stopRetry]);

  const requestPendingNotice = useCallback(() => {
    if (current.current) commit({ ...current.current, noticeRequested: true });
  }, [commit]);

  useEffect(() => {
    function onOffline() {
      if (!current.current) return;
      stopRetry();
      commit({ ...current.current, status: "offline", waiting: false });
    }
    // Reconnection never sends or confirms anything; the user explicitly retries.
    window.addEventListener("offline", onOffline);
    return () => {
      stopRetry();
      window.removeEventListener("offline", onOffline);
    };
  }, [commit, stopRetry]);

  return {
    pendingRequest,
    beginPendingRequest,
    cancelPendingRequest,
    waitForPendingRequest,
    requestPendingNotice,
  };
}
