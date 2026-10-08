const assert = require("node:assert/strict");
const { test } = require("node:test");
const jiti = require("jiti")(__filename);
const { canLogin, createMemoryStorage } = jiti("../src/lib/preview-session.ts");
const { createSessionState } = jiti("../src/lib/session-state.ts");

const local = {
  platform: "web",
  development: true,
  pageUrl: "http://localhost:8081/login",
  apiBaseUrl: "http://localhost:8082",
};

test("native login policy stays independent of development and browser configuration", () => {
  for (const platform of ["ios", "android"]) {
    assert.equal(canLogin({ platform, development: false }), true);
  }
});

test("development web login requires a literal loopback page and API origin", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    for (const protocol of ["http", "https"]) {
      assert.equal(
        canLogin({
          ...local,
          pageUrl: `${protocol}://${host}:8081/login?next=profile`,
          apiBaseUrl: `${protocol}://${host}:8082/`,
        }),
        true,
      );
    }
  }
  assert.equal(canLogin({ ...local, development: false }), false);
  assert.equal(canLogin({ ...local, pageUrl: undefined }), false);
  assert.equal(canLogin({ ...local, apiBaseUrl: undefined }), false);
});

test("remote, disguised and malformed origins cannot enable web login", () => {
  for (const origin of [
    "http://example.test",
    "http://192.168.1.20",
    "http://127.1",
    "http://2130706433",
    "http://localhost.evil.test",
    "http://localhost@evil.test",
    "http://evil.test@localhost",
    "http://localhost:99999",
    "file://localhost",
    "http://localhost\\@evil.test",
    " http://localhost",
    "http://localhost/path",
    "http://localhost?x=1",
    "http://localhost#x",
  ]) {
    assert.equal(canLogin({ ...local, apiBaseUrl: origin }), false, origin);
  }
  for (const pageUrl of [
    "http://example.test/login",
    "http://127.1/login",
    "http://user@localhost/login",
    "file://localhost/login",
    "http://localhost.evil.test/login",
    "http://localhost\\evil/login",
  ]) {
    assert.equal(canLogin({ ...local, pageUrl }), false, pageUrl);
  }
});

test("session storage is private to each provider and does not survive recreation", async () => {
  const first = createMemoryStorage();
  const second = createMemoryStorage();
  await first.setItemAsync("token", "private-refresh");
  assert.equal(await first.getItemAsync("token"), "private-refresh");
  assert.equal(await second.getItemAsync("token"), null);
  assert.equal(await createMemoryStorage().getItemAsync("token"), null);
  await first.deleteItemAsync("token");
  assert.equal(await first.getItemAsync("token"), null);
});

test("existing session generations rotate and invalidate memory sessions", async () => {
  const state = createSessionState(createMemoryStorage());
  const version = state.advance();
  await state.save(version, "refresh-before", "cliente@wok.test");
  assert.deepEqual(await state.read(version), {
    refreshToken: "refresh-before",
    email: "cliente@wok.test",
  });
  await state.save(version, "refresh-after", "cliente@wok.test");
  assert.equal((await state.read(version)).refreshToken, "refresh-after");
  const lateRotation = state.save(version, "late-refresh", "cliente@wok.test");
  const logoutVersion = state.advance();
  await assert.rejects(lateRotation);
  await state.clear(logoutVersion);
  assert.deepEqual(await state.read(logoutVersion), {
    refreshToken: null,
    email: null,
  });
  await assert.rejects(state.save(version, "stale-refresh", "stale@wok.test"));
  await assert.rejects(state.read(version));
  assert.deepEqual(await state.read(logoutVersion), {
    refreshToken: null,
    email: null,
  });
});
