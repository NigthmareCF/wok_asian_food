import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, PublicServiceDay } from "./api";
import { selectedServiceDate } from "./service-hours";
import { fetchPublicServiceDay } from "./service-hours-api";
import { useFocusedPolling } from "./use-focused-polling";

export function useServiceHours(serviceType: "PICKUP" | "DELIVERY", localDateTime: string) {
  const serviceDate = selectedServiceDate(localDateTime);
  const [day, setDay] = useState<PublicServiceDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);

  const refresh = useCallback(async () => {
    const currentRevision = ++revision.current;
    if (!serviceDate) {
      setDay(null);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchPublicServiceDay(serviceType, serviceDate);
      if (revision.current === currentRevision) {
        setDay(result);
        setError("");
      }
    } catch (cause) {
      if (revision.current === currentRevision) {
        setDay(null);
        setError(cause instanceof ApiError ? cause.message : "No pudimos consultar el horario publicado.");
      }
    } finally {
      if (revision.current === currentRevision) setLoading(false);
    }
  }, [serviceDate, serviceType]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) return refresh(); });
    return () => { active = false; revision.current += 1; };
  }, [refresh]);

  useFocusedPolling(refresh, 60_000, Boolean(serviceDate));
  return { day, loading, error, refresh };
}
