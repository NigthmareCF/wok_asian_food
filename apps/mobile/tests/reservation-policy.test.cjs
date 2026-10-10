const assert = require("node:assert/strict");
const { test } = require("node:test");
const jiti = require("jiti")(__filename);
const { reservationInstant, reservationPolicySchema, reservationPolicyError } = jiti("../src/lib/reservation-policy.ts");
const policy = reservationPolicySchema.parse({ timeZone: "America/Guatemala", minimumNoticeMinutes: 120,
  additionalPairMinutes: 15, firstRequestTime: "14:00:00", lastRequestTime: "21:15:00", asOf: "2026-10-09T22:00:00Z" });
test("reservation civil time is independent of device timezone and rejects normalized invalid dates", () => {
  for (const zone of ["UTC", "Asia/Tokyo", "America/Guatemala"]) {
    const previous = process.env.TZ;
    process.env.TZ = zone;
    try { assert.equal(reservationInstant("2026-10-09T18:00"), "2026-10-10T00:00:00.000Z"); }
    finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  }
  assert.equal(reservationInstant("2026-02-29T18:00"), null);
});
test("configured minute policy accepts exact boundary and adds group notice only same day", () => {
  const now = Date.parse(policy.asOf);
  assert.equal(reservationPolicyError("2026-10-09T18:00", 4, now, policy), null);
  assert.ok(reservationPolicyError("2026-10-09T18:00", 6, now, policy));
  assert.equal(reservationPolicyError("2026-10-09T18:15", 6, now, policy), null);
  assert.ok(reservationPolicyError("2026-10-10T21:16", 4, now, policy));
  assert.equal(reservationPolicySchema.safeParse({ ...policy, minimumNoticeMinutes: undefined }).success, false);
});
