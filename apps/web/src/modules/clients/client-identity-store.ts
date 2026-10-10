export type ClientIdentity = {
  status: "unverified" | "verified" | "guest";
  ownerId: string | null;
  generation: number;
};

const initial: ClientIdentity = {
  status: "unverified",
  ownerId: null,
  generation: 0,
};

export function createClientIdentityStore() {
  let snapshot = initial;
  let sequence = 0;
  let controller: AbortController | null = null;
  let pending: Promise<ClientIdentity> | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: ClientIdentity) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  function invalidate() {
    sequence++;
    controller?.abort();
    pending = null;
    publish({
      status: "unverified",
      ownerId: null,
      generation: snapshot.generation + 1,
    });
  }
  function matches(scope: ClientIdentity) {
    return (
      scope.status !== "unverified" &&
      snapshot.status === scope.status &&
      snapshot.ownerId === scope.ownerId &&
      snapshot.generation === scope.generation
    );
  }
  function verify(): Promise<ClientIdentity> {
    if (pending) return pending;
    const ticket = ++sequence;
    const check = new AbortController();
    controller = check;
    const task = (async () => {
      try {
        const response = await fetch("/bff/auth/session", {
          cache: "no-store",
          signal: AbortSignal.any([check.signal, AbortSignal.timeout(15_000)]),
        });
        if (ticket !== sequence || check.signal.aborted) return snapshot;
        const body: unknown =
          response.status === 401 ? null : await response.json();
        if (ticket !== sequence || check.signal.aborted) return snapshot;
        const user =
          body && typeof body === "object" && "user" in body ? body.user : null;
        const ownerId =
          user &&
          typeof user === "object" &&
          "userId" in user &&
          typeof user.userId === "string" &&
          user.userId.length > 0
            ? user.userId
            : null;
        if (
          (!response.ok && response.status !== 401) ||
          (response.ok && !ownerId)
        )
          throw new Error("Invalid session");
        const status = ownerId ? "verified" : "guest";
        if (snapshot.status !== status || snapshot.ownerId !== ownerId) {
          publish({ status, ownerId, generation: snapshot.generation + 1 });
        }
      } catch {
        if (ticket === sequence && !check.signal.aborted) invalidate();
      }
      return snapshot;
    })();
    pending = task;
    void task.finally(() => {
      if (pending === task) pending = null;
    });
    return task;
  }
  function refresh() {
    invalidate();
    return verify();
  }
  const focus = () => {
    void refresh();
  };
  const visibility = () => {
    if (document.visibilityState === "visible") void refresh();
  };
  const logout = () => invalidate();
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    matches,
    invalidate,
    refresh,
    async confirm(scope: ClientIdentity) {
      if (!matches(scope) || scope.status !== "verified") return false;
      await verify();
      return matches(scope);
    },
    subscribe(listener: () => void) {
      let subscribed = true;
      const first = listeners.size === 0;
      listeners.add(listener);
      if (first && typeof window !== "undefined") {
        window.addEventListener("focus", focus);
        window.addEventListener("wok:logout", logout);
        document.addEventListener("visibilitychange", visibility);
        void verify();
      }
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
        if (!listeners.size && typeof window !== "undefined") {
          window.removeEventListener("focus", focus);
          window.removeEventListener("wok:logout", logout);
          document.removeEventListener("visibilitychange", visibility);
          invalidate();
        }
      };
    },
  };
}

export const clientIdentityStore = createClientIdentityStore();

/** Aborting is an optimization; validity also rejects mocks/transports ignoring abort. */
export function createClientOperation(scope: ClientIdentity) {
  const controller = new AbortController();
  let disposed = false;
  const valid = () =>
    !disposed &&
    !controller.signal.aborted &&
    clientIdentityStore.matches(scope);
  const unsubscribe = clientIdentityStore.subscribe(() => {
    if (!valid()) controller.abort();
  });
  return {
    valid,
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
    async confirm() {
      return valid() && (await clientIdentityStore.confirm(scope)) && valid();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      unsubscribe();
    },
  };
}
