// Unit tests for js/sessionPlan.js (SPEC.md §8 phase 3).
//
// Run with: node --test tests/
// Uses only Node's built-in test runner (node:test / node:assert) — no
// third-party dependency, per this project's no-npm rule.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSessionPlan } from "../js/sessionPlan.js";

// --- fixtures ---------------------------------------------------------

function makeTarget(exerciseId, setNumber, overrides = {}) {
  return {
    id: `${exerciseId}-set${setNumber}`,
    exerciseId,
    setNumber,
    currentWeight: 100,
    repRangeLow: 4,
    repRangeHigh: 6,
    progressionTriggerReps: 10,
    increment: 10,
    restSeconds: 90,
    ...overrides,
  };
}

function targetsLookup(targetsByExercise) {
  return (exerciseId) => targetsByExercise[exerciseId] ?? [];
}

// --- single blocks ------------------------------------------------------

test("single block with no warmup produces just the working sets, in order", () => {
  const block = {
    orderIndex: 0,
    blockType: "single",
    exercise1Id: "bench",
    exercise2Id: null,
    hasWarmup1: false,
    hasWarmup2: false,
  };
  const getSetTargets = targetsLookup({
    bench: [makeTarget("bench", 1), makeTarget("bench", 2), makeTarget("bench", 3)],
  });

  const plan = buildSessionPlan([block], getSetTargets);

  assert.deepEqual(
    plan.map((item) => [item.kind, item.exerciseId, item.setNumber]),
    [
      ["workingSet", "bench", 1],
      ["workingSet", "bench", 2],
      ["workingSet", "bench", 3],
    ]
  );
});

test("single block with a warmup puts the warmup item first", () => {
  const block = {
    orderIndex: 0,
    blockType: "single",
    exercise1Id: "squat",
    exercise2Id: null,
    hasWarmup1: true,
    hasWarmup2: false,
  };
  const getSetTargets = targetsLookup({ squat: [makeTarget("squat", 1)] });

  const plan = buildSessionPlan([block], getSetTargets);

  assert.equal(plan.length, 2);
  assert.deepEqual(
    { kind: plan[0].kind, exerciseId: plan[0].exerciseId },
    { kind: "warmup", exerciseId: "squat" }
  );
  assert.equal(plan[1].kind, "workingSet");
});

test("a single block's set targets are ordered by setNumber regardless of input order", () => {
  const block = {
    orderIndex: 0,
    blockType: "single",
    exercise1Id: "row",
    exercise2Id: null,
    hasWarmup1: false,
    hasWarmup2: false,
  };
  // Deliberately out of order.
  const getSetTargets = targetsLookup({
    row: [makeTarget("row", 3), makeTarget("row", 1), makeTarget("row", 2)],
  });

  const plan = buildSessionPlan([block], getSetTargets);

  assert.deepEqual(plan.map((item) => item.setNumber), [1, 2, 3]);
});

// --- alternating pairs (SPEC.md §3.3) ------------------------------------

test("alternating pair interleaves set-by-set: A1, B1, A2, B2, A3, B3", () => {
  const block = {
    orderIndex: 0,
    blockType: "alternatingPair",
    exercise1Id: "bench",
    exercise2Id: "row",
    hasWarmup1: false,
    hasWarmup2: false,
  };
  const getSetTargets = targetsLookup({
    bench: [makeTarget("bench", 1), makeTarget("bench", 2), makeTarget("bench", 3)],
    row: [makeTarget("row", 1), makeTarget("row", 2), makeTarget("row", 3)],
  });

  const plan = buildSessionPlan([block], getSetTargets);

  assert.deepEqual(
    plan.map((item) => `${item.exerciseId}${item.setNumber}`),
    ["bench1", "row1", "bench2", "row2", "bench3", "row3"]
  );
});

test("alternating pair warmups (both legs) come before any interleaved working sets", () => {
  const block = {
    orderIndex: 0,
    blockType: "alternatingPair",
    exercise1Id: "bench",
    exercise2Id: "row",
    hasWarmup1: true,
    hasWarmup2: true,
  };
  const getSetTargets = targetsLookup({
    bench: [makeTarget("bench", 1)],
    row: [makeTarget("row", 1)],
  });

  const plan = buildSessionPlan([block], getSetTargets);

  assert.deepEqual(
    plan.map((item) => `${item.kind}:${item.exerciseId}`),
    ["warmup:bench", "warmup:row", "workingSet:bench", "workingSet:row"]
  );
});

test("alternating pair with unequal set counts: the shorter side drops out", () => {
  const block = {
    orderIndex: 0,
    blockType: "alternatingPair",
    exercise1Id: "bench",
    exercise2Id: "row",
    hasWarmup1: false,
    hasWarmup2: false,
  };
  const getSetTargets = targetsLookup({
    bench: [makeTarget("bench", 1), makeTarget("bench", 2), makeTarget("bench", 3)],
    row: [makeTarget("row", 1)],
  });

  const plan = buildSessionPlan([block], getSetTargets);

  assert.deepEqual(
    plan.map((item) => `${item.exerciseId}${item.setNumber}`),
    ["bench1", "row1", "bench2", "bench3"]
  );
});

test("alternating pair rests after every leg (restAfter is always true)", () => {
  const block = {
    orderIndex: 0,
    blockType: "alternatingPair",
    exercise1Id: "bench",
    exercise2Id: "row",
    hasWarmup1: false,
    hasWarmup2: false,
  };
  const getSetTargets = targetsLookup({
    bench: [makeTarget("bench", 1)],
    row: [makeTarget("row", 1)],
  });

  const plan = buildSessionPlan([block], getSetTargets);

  assert.deepEqual(plan.map((item) => item.restAfter), [true, true]);
});

// --- supersets (user feedback — not in the original spec) ----------------

test("superset interleaves set-by-set, same as an alternating pair", () => {
  const block = {
    orderIndex: 0,
    blockType: "superset",
    exercise1Id: "bench",
    exercise2Id: "row",
    hasWarmup1: false,
    hasWarmup2: false,
  };
  const getSetTargets = targetsLookup({
    bench: [makeTarget("bench", 1), makeTarget("bench", 2)],
    row: [makeTarget("row", 1), makeTarget("row", 2)],
  });

  const plan = buildSessionPlan([block], getSetTargets);

  assert.deepEqual(
    plan.map((item) => `${item.exerciseId}${item.setNumber}`),
    ["bench1", "row1", "bench2", "row2"]
  );
});

test("superset has no rest after the first exercise's leg, but does after the second's", () => {
  const block = {
    orderIndex: 0,
    blockType: "superset",
    exercise1Id: "bench",
    exercise2Id: "row",
    hasWarmup1: false,
    hasWarmup2: false,
  };
  const getSetTargets = targetsLookup({
    bench: [makeTarget("bench", 1), makeTarget("bench", 2)],
    row: [makeTarget("row", 1), makeTarget("row", 2)],
  });

  const plan = buildSessionPlan([block], getSetTargets);

  assert.deepEqual(
    plan.map((item) => [item.exerciseId, item.restAfter]),
    [
      ["bench", false],
      ["row", true],
      ["bench", false],
      ["row", true],
    ]
  );
});

test("a superset's leftover leg rests normally once its partner has run out", () => {
  const block = {
    orderIndex: 0,
    blockType: "superset",
    exercise1Id: "bench",
    exercise2Id: "row",
    hasWarmup1: false,
    hasWarmup2: false,
  };
  const getSetTargets = targetsLookup({
    bench: [makeTarget("bench", 1), makeTarget("bench", 2)],
    row: [makeTarget("row", 1)], // shorter — drops out after round 1
  });

  const plan = buildSessionPlan([block], getSetTargets);

  assert.deepEqual(
    plan.map((item) => [item.exerciseId, item.setNumber, item.restAfter]),
    [
      ["bench", 1, false], // row1 is right there — no rest
      ["row", 1, true],
      ["bench", 2, true], // row has nothing left — rests normally
    ]
  );
});

test("a single block always rests after its one working set", () => {
  const block = {
    orderIndex: 0,
    blockType: "single",
    exercise1Id: "bench",
    exercise2Id: null,
    hasWarmup1: false,
    hasWarmup2: false,
  };
  const getSetTargets = targetsLookup({ bench: [makeTarget("bench", 1)] });

  const plan = buildSessionPlan([block], getSetTargets);

  assert.deepEqual(plan.map((item) => item.restAfter), [true]);
});

// --- multiple blocks / ordering -------------------------------------------

test("multiple blocks are walked in orderIndex order, not input array order", () => {
  const blockB = {
    orderIndex: 1,
    blockType: "single",
    exercise1Id: "curl",
    exercise2Id: null,
    hasWarmup1: false,
    hasWarmup2: false,
  };
  const blockA = {
    orderIndex: 0,
    blockType: "single",
    exercise1Id: "squat",
    exercise2Id: null,
    hasWarmup1: false,
    hasWarmup2: false,
  };
  const getSetTargets = targetsLookup({
    squat: [makeTarget("squat", 1)],
    curl: [makeTarget("curl", 1)],
  });

  // Passed in "wrong" order on purpose.
  const plan = buildSessionPlan([blockB, blockA], getSetTargets);

  assert.deepEqual(
    plan.map((item) => item.exerciseId),
    ["squat", "curl"]
  );
});

test("an empty block list produces an empty plan (empty routine at a location)", () => {
  const plan = buildSessionPlan([], () => {
    throw new Error("should never be called with no blocks");
  });
  assert.deepEqual(plan, []);
});

test("an exercise with no set targets yet contributes nothing but doesn't throw", () => {
  const block = {
    orderIndex: 0,
    blockType: "single",
    exercise1Id: "new-exercise",
    exercise2Id: null,
    hasWarmup1: false,
    hasWarmup2: false,
  };
  const plan = buildSessionPlan([block], targetsLookup({}));
  assert.deepEqual(plan, []);
});

test("an unrecognized blockType throws rather than silently skipping the block", () => {
  const block = {
    orderIndex: 0,
    blockType: "circuit", // not a real blockType — should fail loudly
    exercise1Id: "bench",
    exercise2Id: "row",
    hasWarmup1: false,
    hasWarmup2: false,
  };
  assert.throws(() => buildSessionPlan([block], targetsLookup({})), /Unknown blockType/);
});

// --- realistic mixed routine (seed-data shape, SPEC.md §9) -----------------

test("a routine mixing an alternating pair and a single block plans start-to-finish", () => {
  const pairBlock = {
    orderIndex: 0,
    blockType: "alternatingPair",
    exercise1Id: "inclineDbBench",
    exercise2Id: "cableRow",
    hasWarmup1: true,
    hasWarmup2: false,
  };
  const singleBlock = {
    orderIndex: 1,
    blockType: "single",
    exercise1Id: "weightedPullup",
    exercise2Id: null,
    hasWarmup1: false,
    hasWarmup2: false,
  };
  const getSetTargets = targetsLookup({
    inclineDbBench: [
      makeTarget("inclineDbBench", 1, { currentWeight: 70 }),
      makeTarget("inclineDbBench", 2, { currentWeight: 65 }),
      makeTarget("inclineDbBench", 3, { currentWeight: 60 }),
    ],
    cableRow: [
      makeTarget("cableRow", 1),
      makeTarget("cableRow", 2),
      makeTarget("cableRow", 3),
    ],
    weightedPullup: [
      makeTarget("weightedPullup", 1, { currentWeight: -25 }),
      makeTarget("weightedPullup", 2, { currentWeight: -25 }),
    ],
  });

  const plan = buildSessionPlan([pairBlock, singleBlock], getSetTargets);

  assert.deepEqual(
    plan.map((item) =>
      item.kind === "warmup" ? `warmup:${item.exerciseId}` : `${item.exerciseId}${item.setNumber}`
    ),
    [
      "warmup:inclineDbBench",
      "inclineDbBench1",
      "cableRow1",
      "inclineDbBench2",
      "cableRow2",
      "inclineDbBench3",
      "cableRow3",
      "weightedPullup1",
      "weightedPullup2",
    ]
  );

  // Negative weight (assistance) for weighted bodyweight must survive untouched.
  const pullupItems = plan.filter((item) => item.exerciseId === "weightedPullup");
  assert.equal(pullupItems.length, 2);
});
