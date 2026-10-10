const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const jiti = require("jiti")(__filename);
const slots = () => jiti(path.join(__dirname, "../src/lib/slot-time.ts"));

test("Guatemala civil time round trips without the device timezone", () => {
  const { restaurantInstant, restaurantLocal } = slots();
  for (const zone of ["UTC", "America/Guatemala", "Asia/Tokyo"]) {
    const previous = process.env.TZ;
    process.env.TZ = zone;
    try {
      assert.equal(
        restaurantInstant("2026-10-07T18:30"),
        "2026-10-08T00:30:00.000Z",
      );
      assert.equal(
        restaurantLocal(new Date("2026-10-08T05:59:00Z")),
        "2026-10-07T23:59",
      );
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  }
});

test("civil dates reject normalization, incomplete dates and out of range times", () => {
  const { restaurantInstant, addRestaurantDays } = slots();
  for (const input of [
    "2026-02-29T18:00",
    "2026-04-31T18:00",
    "2026-10-07T24:00",
    "2026-10-07T18:60",
    "2026-10-07T",
    "2026-10-07T18:00Z",
    "bad",
  ]) {
    assert.equal(restaurantInstant(input), null, input);
  }
  assert.equal(
    restaurantInstant("2028-02-29T18:00"),
    "2028-03-01T00:00:00.000Z",
  );
  assert.equal(addRestaurantDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addRestaurantDays("2026-12-31", 1), "2027-01-01");
});

test("request policy uses the real wire field and inclusive table boundaries", () => {
  const { reservationPolicySchema, reservationTimeError } = slots();
  const policy = reservationPolicySchema.parse({
    timeZone: "America/Guatemala",
    minimumNoticeHours: 2,
    minimumNoticeMinutes: 120,
    baseGuests: 4,
    additionalGuestGroupSize: 2,
    additionalNoticeMinutes: 15,
    completePreorderAt: "21:15:00",
    outsideHoursRequiresReview: true,
    firstRequestTime: "00:00:00",
    lastRequestTime: "21:15:00",
    preorderRecommendedAfter: "20:30:00",
    preorderItemsSupported: true,
    asOf: "2026-10-07T15:00:00Z",
  });
  const now = Date.parse("2026-10-07T15:00:00Z");
  assert.equal(reservationTimeError("2026-10-07T14:00", now, policy), null);
  assert.equal(reservationTimeError("2026-10-07T21:15", now, policy), null);
  assert.equal(reservationTimeError("2026-10-07T13:59", now, policy),null);
  assert.ok(reservationTimeError("2026-10-07T21:16", now, policy));
  assert.equal(
    reservationTimeError(
      "2026-10-07T14:00",
      Date.parse("2026-10-07T18:00:00Z"),
      policy,
    ),
    null,
  );
  assert.ok(
    reservationTimeError(
      "2026-10-07T14:00",
      Date.parse("2026-10-07T18:00:01Z"),
      policy,
    ),
  );
  for (const [guests,minutes] of [[4,120],[5,135],[6,135],[7,150],[50,465]]) {
    const target=Date.parse("2026-10-07T20:00:00Z");
    assert.equal(reservationTimeError("2026-10-07T14:00",target-minutes*60000,policy,guests),null);
    assert.ok(reservationTimeError("2026-10-07T14:00",target-minutes*60000+1,policy,guests));
  }
  assert.equal(
    reservationPolicySchema.safeParse({
      ...policy,
      minimumNoticeHours: undefined,
      minNoticeHours: 3,
    }).success,
    false,
  );
});

test("pickup suggestions use fresh time, preparation and the conservative buffer", () => {
  const { suggestPickup, pickupTimeError, restaurantInstant } = slots();
  const now = Date.parse("2026-10-07T18:00:30Z");
  assert.equal(
    suggestPickup(now, 300, "2026-10-01T00:00:00Z"),
    "2026-10-07T12:16",
  );
  assert.equal(suggestPickup(now, 1800), "2026-10-07T12:32");
  assert.ok(pickupTimeError("2026-10-07T12:05", now, 300));
  assert.equal(pickupTimeError("2026-10-07T12:06", now, 300), null);
  assert.ok(pickupTimeError("2026-10-08T12:00", now, 86401));
  const existing = {
    key: "old-key",
    body: { requestedFor: "2026-10-01T00:00:00.000Z" },
  };
  const selected = "2026-10-07T12:06";
  const attempt = existing ?? {
    body: { requestedFor: restaurantInstant(selected) },
  };
  assert.equal(attempt, existing);
  assert.equal(attempt.body.requestedFor, "2026-10-01T00:00:00.000Z");
});
