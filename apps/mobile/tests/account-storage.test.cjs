const assert = require("node:assert/strict");
const { test } = require("node:test");
const jiti = require("jiti")(__filename);
const { accountStorageKey, normalizeAccountOwner } = jiti("../src/lib/account-storage.ts");

test("account keys normalize owners without collisions or unsafe SecureStore characters", () => {
  assert.equal(normalizeAccountOwner(" A@Example.test "), "a@example.test");
  assert.equal(normalizeAccountOwner(" "), null);
  assert.equal(accountStorageKey("cart", " A@Example.test "), accountStorageKey("cart", "a@example.test"));
  const owners = [null, "guest", "a+b@example.test", "a_b@example.test", "á@example.test", "a@example.test"];
  const keys = owners.map((owner) => accountStorageKey("cart", owner));
  assert.equal(new Set(keys).size, owners.length);
  keys.forEach((key) => assert.match(key, /^[A-Za-z0-9._-]+$/));
  assert.notEqual(accountStorageKey("pending", owners[2]), keys[2]);
});
