const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const jiti = require("jiti")(__filename);
const { createApiRequest, ApiError } = jiti(
  path.resolve(__dirname, "../src/lib/api-client.ts"),
);

test("missing BFF configuration fails without transport and exposes only friendly copy", async () => {
  let calls = 0;
  const request = createApiRequest(undefined, false, async () => {
    calls++;
  });
  await assert.rejects(request("/api/v1/public/menu"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, "No pudimos cargar el menú, intenta de nuevo.");
    assert.doesNotMatch(error.message, /EXPO_PUBLIC|BFF|https?:/);
    return true;
  });
  assert.equal(calls, 0);
});

test("invalid BFF configuration never exposes origin details or sends a request", async () => {
  let calls = 0;
  const request = createApiRequest(
    "https://user:private@invalid.example",
    false,
    async () => {
      calls++;
    },
  );
  await assert.rejects(request("/api/v1/public/menu"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.doesNotMatch(error.message, /private|invalid.example|BFF|HTTPS/);
    return true;
  });
  assert.equal(calls, 0);
});
