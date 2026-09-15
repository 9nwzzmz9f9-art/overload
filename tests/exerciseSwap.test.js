import { test } from "node:test";
import assert from "node:assert/strict";
import { swapExercisePositions, applyPositionSwaps } from "../js/exerciseSwap.js";

function workingSet(exerciseId, setNumber, overrides = {}) {
  return {
    kind: "workingSet",
    exerciseId,
    setNumber,
    setTargetId: `${exerciseId}-${setNumber}`,
    blockIndex: 0,
    blockType: "single",
    legIndex: 0,
    restAfter: true,
    ...overrides,
  };
}

function warmup(exerciseId) {
  return { kind: "warmup", exerciseId, blockIndex: 0, blockType: "single", legIndex: 0, restAfter: true };
}

test("swaps two exercises' remaining sets pairwise, in order", () => {
  const plan = [workingSet("A", 1), workingSet("A", 2), workingSet("B", 1), workingSet("B", 2)];
  const result = swapExercisePositions(plan, "A", "B");

  assert.deepEqual(
    result.map((i) => `${i.exerciseId}${i.setNumber}`),
    ["B1", "B2", "A1", "A2"]
  );
});

test("each position keeps its own structural facts, not the swapped-in content's", () => {
  const plan = [
    workingSet("A", 1, { restAfter: false, blockIndex: 3, legIndex: 0 }),
    workingSet("B", 1, { restAfter: true, blockIndex: 7, legIndex: 1 }),
  ];
  const result = swapExercisePositions(plan, "A", "B");

  // Position 0 now shows B's content, but keeps position 0's own restAfter/blockIndex/legIndex.
  assert.equal(result[0].exerciseId, "B");
  assert.equal(result[0].restAfter, false);
  assert.equal(result[0].blockIndex, 3);
  assert.equal(result[0].legIndex, 0);

  assert.equal(result[1].exerciseId, "A");
  assert.equal(result[1].restAfter, true);
  assert.equal(result[1].blockIndex, 7);
  assert.equal(result[1].legIndex, 1);
});

test("setTargetId travels with the content it belongs to", () => {
  const plan = [workingSet("A", 1), workingSet("B", 1)];
  const result = swapExercisePositions(plan, "A", "B");
  assert.equal(result[0].setTargetId, "B-1");
  assert.equal(result[1].setTargetId, "A-1");
});

test("unequal remaining counts: only the shorter side's worth get traded", () => {
  const plan = [workingSet("A", 1), workingSet("A", 2), workingSet("A", 3), workingSet("B", 1)];
  const result = swapExercisePositions(plan, "A", "B");

  assert.deepEqual(
    result.map((i) => `${i.exerciseId}${i.setNumber}`),
    ["B1", "A2", "A3", "A1"] // only the first pair (A1<->B1) traded; A2/A3 untouched
  );
});

test("already-done sets are excluded from swapping on either side", () => {
  const plan = [workingSet("A", 1), workingSet("A", 2), workingSet("B", 1), workingSet("B", 2)];
  const doneKeys = new Set(["A:1"]); // A1 already logged
  const result = swapExercisePositions(plan, "A", "B", doneKeys);

  // A1 stays put (done); A2 trades with B1 (the first *remaining* pair).
  assert.deepEqual(
    result.map((i) => `${i.exerciseId}${i.setNumber}`),
    ["A1", "B1", "A2", "B2"]
  );
});

test("warmup items are never touched", () => {
  const plan = [warmup("A"), workingSet("A", 1), warmup("B"), workingSet("B", 1)];
  const result = swapExercisePositions(plan, "A", "B");

  assert.equal(result[0].exerciseId, "A"); // warmup untouched
  assert.equal(result[0].kind, "warmup");
  assert.equal(result[2].exerciseId, "B"); // warmup untouched
  assert.equal(result[2].kind, "warmup");
  // Only the working sets traded.
  assert.equal(result[1].exerciseId, "B");
  assert.equal(result[3].exerciseId, "A");
});

test("swapping an exercise with itself is a no-op", () => {
  const plan = [workingSet("A", 1), workingSet("A", 2)];
  const result = swapExercisePositions(plan, "A", "A");
  assert.deepEqual(result, plan);
});

test("swapping the same pair twice cancels out", () => {
  const plan = [workingSet("A", 1), workingSet("B", 1)];
  const once = swapExercisePositions(plan, "A", "B");
  const twice = swapExercisePositions(once, "A", "B");
  assert.deepEqual(
    twice.map((i) => `${i.exerciseId}${i.setNumber}`),
    ["A1", "B1"]
  );
});

test("the original plan array is never mutated", () => {
  const plan = [workingSet("A", 1), workingSet("B", 1)];
  const snapshot = JSON.parse(JSON.stringify(plan));
  swapExercisePositions(plan, "A", "B");
  assert.deepEqual(plan, snapshot);
});

test("applyPositionSwaps applies multiple independent pairs", () => {
  const plan = [workingSet("A", 1), workingSet("B", 1), workingSet("C", 1), workingSet("D", 1)];
  const result = applyPositionSwaps(plan, [
    ["A", "B"],
    ["C", "D"],
  ]);
  assert.deepEqual(
    result.map((i) => i.exerciseId),
    ["B", "A", "D", "C"]
  );
});

test("applyPositionSwaps with no pairs returns the plan unchanged", () => {
  const plan = [workingSet("A", 1)];
  assert.deepEqual(applyPositionSwaps(plan, []), plan);
  assert.deepEqual(applyPositionSwaps(plan, undefined), plan);
});
