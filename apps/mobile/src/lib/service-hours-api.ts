import { ApiError, apiRequest, PublicServiceDay } from "./api";

type LegacyServiceWindow = {
  weekday: number;
  opensAt: string;
  closesAt: string;
  timezone: string;
};

type ApiRequester = <T>(path: string) => Promise<T>;

/** Reads the canonical date-range contract and adapts the integrated legacy path contract when needed. */
export async function fetchPublicServiceDay(
  serviceType: PublicServiceDay["serviceType"],
  serviceDate: string,
  request: ApiRequester = apiRequest,
): Promise<PublicServiceDay | null> {
  const query = new URLSearchParams({ serviceType, from: serviceDate, to: serviceDate });
  try {
    const days = await request<PublicServiceDay[]>(`/api/v1/public/service-hours?${query.toString()}`);
    return days.find((day) => day.serviceDate === serviceDate) ?? null;
  } catch (cause) {
    // The active integrated deployment still returns 500 for an unknown route through its legacy handler.
    if (!(cause instanceof ApiError) || (cause.status !== 404 && cause.status !== 500)) throw cause;

    let windows: LegacyServiceWindow[];
    try {
      windows = await request<LegacyServiceWindow[]>(
        `/api/v1/public/service-hours/${encodeURIComponent(serviceType)}/${encodeURIComponent(serviceDate)}`,
      );
    } catch {
      throw cause;
    }
    const weekday = new Date(`${serviceDate}T00:00:00Z`).getUTCDay() || 7;
    const window = windows.find((candidate) => candidate.weekday === weekday) ?? windows[0];
    return {
      serviceType,
      serviceDate,
      open: Boolean(window),
      opensAt: window?.opensAt ?? null,
      closesAt: window?.closesAt ?? null,
      timezoneName: window?.timezone ?? "America/Guatemala",
      source: window ? "COMPATIBILITY" : "CLOSED",
    };
  }
}
