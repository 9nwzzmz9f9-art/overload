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

import { dueCountdownAlert } from "../js/restTimer.js";

test("dueCountdownAlert fires each threshold once as a timer counts down", () => {
  const fired = new Set();
  const seen = [];
  for (let ms = 90000; ms > 0; ms -= 250) {
    const alert = dueCountdownAlert(fired, ms);
    if (alert) seen.push(alert);
  }
  assert.deepEqual(seen, ["warn60", "warn30", "tick", "tick", "tick"]);
});

test("dueCountdownAlert coalesces a late-noticed timer into one most-urgent alert", () => {
  // Screen was off; timer is noticed with 20s left — one 30s alert, not 30s + 60s.
  const fired = new Set();
  assert.equal(dueCountdownAlert(fired, 20000), "warn30");
  assert.equal(dueCountdownAlert(fired, 19750), null);
  // Noticed with 2s left having never fired anything: just the tick.
  const late = new Set();
  assert.equal(dueCountdownAlert(late, 1900), "tick");
  assert.equal(dueCountdownAlert(late, 1700), null);
});

test("dueCountdownAlert never fires at or below zero (the done alert is the caller's)", () => {
  assert.equal(dueCountdownAlert(new Set(), 0), null);
  assert.equal(dueCountdownAlert(new Set(), -500), null);
});
