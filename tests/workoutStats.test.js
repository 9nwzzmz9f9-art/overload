import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeTotalWeightLifted,
  computeDurationMs,
  formatDuration,
  formatTotalWeight,
} from "../js/workoutStats.js";

test("computeTotalWeightLifted sums weight × reps across sets", () => {
  const total = computeTotalWeightLifted([
    { weightUsed: 100, reps: 5 },
    { weightUsed: 50, reps: 10 },
  ]);
  assert.equal(total, 100 * 5 + 50 * 10);
});

test("computeTotalWeightLifted treats negative (assisted) weight as 0, not subtracted", () => {
  const total = computeTotalWeightLifted([
    { weightUsed: 100, reps: 5 },
    { weightUsed: -25, reps: 8 }, // assisted pull-up: contributes 0, not -200
  ]);
  assert.equal(total, 500);
});

test("computeTotalWeightLifted on an empty workout is 0", () => {
  assert.equal(computeTotalWeightLifted([]), 0);
});

test("computeDurationMs is the gap between createdAt and completedAt", () => {
  const ms = computeDurationMs({ createdAt: 1000, completedAt: 1000 + 45 * 60000 });
  assert.equal(ms, 45 * 60000);
});

test("computeDurationMs is null for a workout that isn't complete yet", () => {
  assert.equal(computeDurationMs({ createdAt: 1000, completedAt: null }), null);
  assert.equal(computeDurationMs({ createdAt: 1000 }), null);
});

test("formatDuration renders minutes-only under an hour", () => {
  assert.equal(formatDuration(45 * 60000), "45m");
});

test("formatDuration renders hours and minutes over an hour", () => {
  assert.equal(formatDuration(90 * 60000), "1h 30m");
});

test("formatDuration passes through null", () => {
  assert.equal(formatDuration(null), null);
});

test("formatTotalWeight rounds and adds thousands separators", () => {
  assert.equal(formatTotalWeight(12345.6), "12,346 lb");
  assert.equal(formatTotalWeight(0), "0 lb");
});
