import { test } from "node:test";
import assert from "node:assert/strict";
import { remainingMs, isResting, formatRemaining } from "../js/restTimer.js";

test("remainingMs counts down toward the target timestamp", () => {
  const now = 1000;
  assert.equal(remainingMs(now + 5000, now), 5000);
});

test("remainingMs never goes negative once the timer has elapsed", () => {
  const now = 10000;
  assert.equal(remainingMs(now - 5000, now), 0);
});

test("remainingMs is 0 when there's no target timestamp (not resting)", () => {
  assert.equal(remainingMs(null), 0);
  assert.equal(remainingMs(undefined), 0);
});

test("isResting reflects whether time is left", () => {
  const now = 1000;
  assert.equal(isResting(now + 1, now), true);
  assert.equal(isResting(now, now), false);
  assert.equal(isResting(null, now), false);
});

test("formatRemaining pads seconds and rounds up", () => {
  assert.equal(formatRemaining(90000), "1:30");
  assert.equal(formatRemaining(5000), "0:05");
  assert.equal(formatRemaining(500), "0:01"); // rounds up, never flashes 0:00 early
  assert.equal(formatRemaining(0), "0:00");
});
