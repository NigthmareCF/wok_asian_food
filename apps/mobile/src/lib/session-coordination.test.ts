import { describe, expect, it, vi } from "vitest";
import { createAuthAttemptCoordinator, createRefreshTokenCoordinator, createSerializedWriteQueue } from "./session-coordination";

describe("authentication attempt coordination", () => {
  it("allows only one credential exchange to commit at a time", () => {
    const coordinator = createAuthAttemptCoordinator();
    const first = coordinator.begin();

    expect(first).not.toBeNull();
    expect(coordinator.begin()).toBeNull();
    expect(coordinator.isCurrent(first!)).toBe(true);
    expect(coordinator.finish(first!)).toBe(true);

    const next = coordinator.begin();
    expect(next).not.toBe(first);
    expect(coordinator.isCurrent(next!)).toBe(true);
  });

  it("invalidates an in-flight login when logout starts", () => {
    const coordinator = createAuthAttemptCoordinator();
    const pendingLogin = coordinator.begin();

    coordinator.invalidate();

    expect(coordinator.isCurrent(pendingLogin!)).toBe(false);
    const nextLogin = coordinator.begin();
    expect(nextLogin).not.toBeNull();
    expect(coordinator.finish(pendingLogin!)).toBe(false);
    expect(coordinator.isCurrent(nextLogin!)).toBe(true);
  });
});

describe("refresh token coordination", () => {
  it("shares a single rotation only for concurrent use of the same token", async () => {
    let resolveFirst!: (value: string) => void;
    const refresh = vi.fn((token: string) => token === "account-a"
      ? new Promise<string>((resolve) => { resolveFirst = resolve; })
      : Promise.resolve("rotated-b"));
    const coordinator = createRefreshTokenCoordinator(refresh);

    const first = coordinator.rotate("account-a");
    const second = coordinator.rotate("account-a");
    const otherAccount = coordinator.rotate("account-b");
    resolveFirst("rotated-a");

    await expect(first).resolves.toBe("rotated-a");
    await expect(second).resolves.toBe("rotated-a");
    await expect(otherAccount).resolves.toBe("rotated-b");
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a cached rotation after the session is cleared", async () => {
    const refresh = vi.fn(async (token: string) => `${token}-rotated`);
    const coordinator = createRefreshTokenCoordinator(refresh);

    await coordinator.rotate("refresh");
    await coordinator.rotate("refresh");
    coordinator.clear();
    await coordinator.rotate("refresh");

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not share an in-flight rotation with a session started after clear", async () => {
    let resolvePrevious!: (value: string) => void;
    let resolveCurrent!: (value: string) => void;
    const refresh = vi.fn()
      .mockImplementationOnce(() => new Promise<string>((resolve) => { resolvePrevious = resolve; }))
      .mockImplementationOnce(() => new Promise<string>((resolve) => { resolveCurrent = resolve; }));
    const coordinator = createRefreshTokenCoordinator(refresh);

    const previousSessionRotation = coordinator.rotate("same-token");
    coordinator.clear();
    const currentSessionRotation = coordinator.rotate("same-token");

    expect(refresh).toHaveBeenCalledTimes(2);
    resolvePrevious("previous-session-token");
    await expect(previousSessionRotation).resolves.toBe("previous-session-token");

    resolveCurrent("current-session-token");
    await expect(currentSessionRotation).resolves.toBe("current-session-token");
    await expect(coordinator.rotate("same-token")).resolves.toBe("current-session-token");
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe("secure storage write queue", () => {
  it("runs writes in order and continues after a rejected write", async () => {
    const serialize = createSerializedWriteQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const first = serialize(async () => {
      events.push("first:start");
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      events.push("first:end");
    });
    const second = serialize(async () => { events.push("second"); });
    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second"]);

    await expect(serialize(async () => { throw new Error("storage failure"); })).rejects.toThrow("storage failure");
    await expect(serialize(async () => "still works")).resolves.toBe("still works");
  });
});
