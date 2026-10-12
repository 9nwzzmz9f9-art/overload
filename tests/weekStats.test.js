import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weekStart, addDays, summarizeWeek, weeklyVolumes, percentChange, localDateString,
} from "../js/weekStats.js";

test("weekStart gives the Monday on or before any date", () => {
  assert.equal(weekStart("2026-10-12"), "2026-10-12"); // a Monday
  assert.equal(weekStart("2026-10-18"), "2026-10-12"); // Sunday
  assert.equal(weekStart("2026-10-14"), "2026-10-12"); // Wednesday
  assert.equal(weekStart("2026-01-01"), "2025-12-29"); // across a year boundary
});

test("addDays crosses month ends", () => {
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

const w = (id, date, status = "complete") => ({ id, date, status, routineId: "r" });

test("summarizeWeek buckets by day and totals count and volume", () => {
  const workouts = [w("a", "2026-10-12"), w("b", "2026-10-14"), w("c", "2026-10-20")];
  const vol = new Map([["a", 5000], ["b", 4000], ["c", 9999]]);
  const s = summarizeWeek(workouts, vol, "2026-10-12");
  assert.equal(s.count, 2);
  assert.equal(s.volume, 9000);
  assert.equal(s.days[0].workouts.length, 1);
  assert.equal(s.days[2].workouts.length, 1);
  assert.equal(s.days[1].workouts.length, 0);
});

test("only finished workouts count (not in progress or abandoned)", () => {
  const workouts = [w("a", "2026-10-12", "inProgress"), w("b", "2026-10-13", "abandoned"), w("c", "2026-10-14", "awaitingProgression")];
  assert.equal(summarizeWeek(workouts, new Map(), "2026-10-12").count, 1);
});

test("weeklyVolumes returns oldest-first volumes ending at the current week", () => {
  const workouts = [w("a", "2026-10-05"), w("b", "2026-10-12")];
  const vol = new Map([["a", 100], ["b", 300]]);
  assert.deepEqual(weeklyVolumes(workouts, vol, "2026-10-12", 3), [0, 100, 300]);
});

test("percentChange rounds and is null with nothing to compare", () => {
  assert.equal(percentChange(108, 100), 8);
  assert.equal(percentChange(50, 100), -50);
  assert.equal(percentChange(10, 0), null);
});

test("localDateString uses the local calendar date", () => {
  assert.equal(localDateString(new Date(2026, 9, 11, 23, 30)), "2026-10-11");
});
