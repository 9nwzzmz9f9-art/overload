import { test } from "node:test";
import assert from "node:assert/strict";
import { findResumeIndex, warmupKey } from "../js/workoutProgress.js";
import { buildSessionPlan } from "../js/sessionPlan.js";

function makeTarget(exerciseId, setNumber) {
  return { id: `${exerciseId}-${setNumber}`, exerciseId, setNumber };
}

const pairBlock = {
  orderIndex: 0,
  blockType: "alternatingPair",
  exercise1Id: "bench",
  exercise2Id: "row",
  hasWarmup1: true,
  hasWarmup2: false,
};
const singleBlock = {
  orderIndex: 1,
  blockType: "single",
  exercise1Id: "pullup",
  exercise2Id: null,
  hasWarmup1: false,
  hasWarmup2: false,
};

function plan() {
  const targets = {
    bench: [makeTarget("bench", 1), makeTarget("bench", 2)],
    row: [makeTarget("row", 1), makeTarget("row", 2)],
    pullup: [makeTarget("pullup", 1)],
  };
  return buildSessionPlan([pairBlock, singleBlock], (id) => targets[id] ?? []);
}

test("a fresh workout resumes at index 0", () => {
  assert.equal(findResumeIndex(plan(), {}), 0);
});

test("resumes right after the warmup once it's acknowledged", () => {
  const items = plan();
  const idx = findResumeIndex(items, { completedWarmupKeys: [warmupKey(items[0])] });
  assert.equal(idx, 1);
  assert.equal(items[1].kind, "workingSet");
});

test("resumes after the last logged working set, skipping ones already done", () => {
  const items = plan();
  const idx = findResumeIndex(items, {
    completedWarmupKeys: [warmupKey(items[0])],
    loggedSets: [
      { exerciseId: "bench", setNumber: 1 },
      { exerciseId: "row", setNumber: 1 },
    ],
  });
  // Next after bench1, row1 is bench2.
  assert.equal(items[idx].exerciseId, "bench");
  assert.equal(items[idx].setNumber, 2);
});

test("a skipped exercise is passed over entirely, including its warmup", () => {
  const items = plan();
  const idx = findResumeIndex(items, { skippedExerciseIds: ["bench"] });
  // bench's warmup and both working sets are skipped; row1 is next.
  assert.equal(items[idx].exerciseId, "row");
  assert.equal(items[idx].setNumber, 1);
});

test("a skipped individual set is passed over without affecting the rest of that exercise", () => {
  const items = plan();
  const idx = findResumeIndex(items, {
    completedWarmupKeys: [warmupKey(items[0])],
    skippedSetKeys: ["bench:1"],
  });
  // bench1 is skipped, so the interleave moves to row1 next (bench2 is
  // still untouched and will come up later).
  assert.equal(items[idx].exerciseId, "row");
  assert.equal(items[idx].setNumber, 1);
});

test("a deferred set is passed over on the first pass, like a skip", () => {
  const items = plan();
  const idx = findResumeIndex(items, {
    completedWarmupKeys: [warmupKey(items[0])],
    deferredSetKeys: ["bench:1"],
  });
  // bench1 is deferred, so row1 comes up next — same as a skip so far.
  assert.equal(items[idx].exerciseId, "row");
  assert.equal(items[idx].setNumber, 1);
});

test("a deferred set comes back once everything else is done — unlike a skip", () => {
  const items = plan();
  // Log everything except bench1, which was deferred.
  const loggedSets = items
    .filter((i) => i.kind === "workingSet" && !(i.exerciseId === "bench" && i.setNumber === 1))
    .map((i) => ({ exerciseId: i.exerciseId, setNumber: i.setNumber }));
  const completedWarmupKeys = items.filter((i) => i.kind === "warmup").map(warmupKey);

  const idx = findResumeIndex(items, {
    loggedSets,
    completedWarmupKeys,
    deferredSetKeys: ["bench:1"],
  });

  assert.equal(items[idx].exerciseId, "bench");
  assert.equal(items[idx].setNumber, 1);
});

test("a deferred-then-logged set doesn't resurface", () => {
  const items = plan();
  const idx = findResumeIndex(items, {
    completedWarmupKeys: [warmupKey(items[0])],
    deferredSetKeys: ["bench:1"],
    loggedSets: [{ exerciseId: "bench", setNumber: 1 }], // logged it after all
  });
  // bench1 is both deferred and logged — logged wins, it's done.
  assert.equal(items[idx].exerciseId, "row");
  assert.equal(items[idx].setNumber, 1);
});

test("once everything is logged, the resume index is past the end of the plan", () => {
  const items = plan();
  const loggedSets = items
    .filter((i) => i.kind === "workingSet")
    .map((i) => ({ exerciseId: i.exerciseId, setNumber: i.setNumber }));
  const completedWarmupKeys = items.filter((i) => i.kind === "warmup").map(warmupKey);
  const idx = findResumeIndex(items, { loggedSets, completedWarmupKeys });
  assert.equal(idx, items.length);
});

test("an empty plan resumes at index 0, which already equals its length", () => {
  assert.equal(findResumeIndex([], {}), 0);
});
