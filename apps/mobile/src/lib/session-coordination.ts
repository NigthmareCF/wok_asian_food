export function createRefreshTokenCoordinator<T>(
  refresh: (refreshToken: string) => Promise<T>,
  cacheTtlMs = 30_000,
  now: () => number = Date.now,
) {
  const inFlight = new Map<string, Promise<T>>();
  let recent: { refreshToken: string; value: T; expiresAt: number } | null = null;
  let generation = 0;

  return {
    rotate(refreshToken: string) {
      if (recent?.refreshToken === refreshToken && recent.expiresAt > now()) {
        return Promise.resolve(recent.value);
      }
      const existing = inFlight.get(refreshToken);
      if (existing) return existing;

      const requestGeneration = generation;
      let request: Promise<T>;
      request = refresh(refreshToken).then((value) => {
        if (requestGeneration === generation) {
          recent = { refreshToken, value, expiresAt: now() + cacheTtlMs };
        }
        return value;
      }).finally(() => {
        if (inFlight.get(refreshToken) === request) inFlight.delete(refreshToken);
      });
      inFlight.set(refreshToken, request);
      return request;
    },
    clear() {
      generation += 1;
      recent = null;
      inFlight.clear();
    },
  };
}

export function createSerializedWriteQueue() {
  let tail = Promise.resolve();
  return function serialize<T>(write: () => Promise<T>) {
    const result = tail.then(write, write);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

export function createAuthAttemptCoordinator() {
  let generation = 0;
  let active = false;

  return {
    begin() {
      if (active) return null;
      active = true;
      generation += 1;
      return generation;
    },
    isCurrent(attempt: number) {
      return active && generation === attempt;
    },
    finish(attempt: number) {
      if (!this.isCurrent(attempt)) return false;
      active = false;
      return true;
    },
    invalidate() {
      generation += 1;
      active = false;
    },
  };
}
