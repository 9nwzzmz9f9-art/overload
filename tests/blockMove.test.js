import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moveBlockBefore,
  applyBlockMoves,
  isBlockUnstarted,
  switchableBlocks,
} from "../js/blockMove.js";

const ws = (blockId, exerciseId, setNumber) => ({
  kind: "workingSet",
  blockId,
  exerciseId,
  setNumber,
  blockIndex: 0,
  legIndex: 0,
  blockType: "single",
});
const label = (plan) => plan.map((i) => `${i.exerciseId}${i.setNumber}`);

// Block A: press x2. Block B: alternating incline/shoulder x2. Block C: curl x1.
const plan = [
  ws("A", "press", 1),
  ws("A", "press", 2),
  ws("B", "incline", 1),
  ws("B", "shoulder", 1),
  ws("B", "incline", 2),
  ws("B", "shoulder", 2),
  ws("C", "curl", 1),
];

test("moves the whole block, in its planned order, ahead of the current block", () => {
  assert.deepEqual(label(moveBlockBefore(plan, "B", "A")), [
    "incline1", "shoulder1", "incline2", "shoulder2", "press1", "press2", "curl1",
  ]);
});

test("a non-adjacent block jumps ahead and the current block resumes right after it", () => {
  assert.deepEqual(label(moveBlockBefore(plan, "C", "A")), [
    "curl1", "press1", "press2", "incline1", "shoulder1", "incline2", "shoulder2",
  ]);
});

test("already-done sets of the moved block stay put and are not moved", () => {
  const doneKeys = new Set(["incline:1"]);
  const result = moveBlockBefore(plan, "B", "A", { doneKeys });
  assert.deepEqual(label(result).slice(0, 3), ["shoulder1", "incline2", "shoulder2"]);
});

test("no-ops: same block, unknown block, or nothing left to move", () => {
  assert.deepEqual(label(moveBlockBefore(plan, "A", "A")), label(plan));
  assert.deepEqual(label(moveBlockBefore(plan, "Z", "A")), label(plan));
  assert.deepEqual(label(moveBlockBefore(plan, "B", "Z")), label(plan));
});

test("input plan is not mutated", () => {
  const copy = [...plan];
  moveBlockBefore(plan, "B", "A");
  assert.deepEqual(plan, copy);
});

test("stacked moves apply in order", () => {
  const result = applyBlockMoves(plan, [["B", "A"], ["C", "B"]]);
  assert.deepEqual(label(result), [
    "curl1", "incline1", "shoulder1", "incline2", "shoulder2", "press1", "press2",
  ]);
  assert.deepEqual(label(applyBlockMoves(plan, [])), label(plan));
  assert.deepEqual(label(applyBlockMoves(plan, undefined)), label(plan));
});

test("completed warmups are not moved", () => {
  const warm = { kind: "warmup", blockId: "B", exerciseId: "incline", blockIndex: 1, legIndex: 0 };
  const withWarm = [ws("A", "press", 1), warm, ws("B", "incline", 1)];
  const done = moveBlockBefore(withWarm, "B", "A", {
    completedWarmupKeys: new Set(["incline:1:0"]),
  });
  assert.equal(done[0].kind, "workingSet");
  assert.equal(done[0].blockId, "B");
});

test("isBlockUnstarted is false once any working set of the block is logged", () => {
  assert.equal(isBlockUnstarted(plan, "B"), true);
  assert.equal(isBlockUnstarted(plan, "B", { doneKeys: new Set(["shoulder:1"]) }), false);
});

test("switchableBlocks lists other blocks with sets left, exercises in leg order", () => {
  const options = switchableBlocks(plan, "A");
  assert.deepEqual(options.map((o) => o.blockId), ["B", "C"]);
  assert.deepEqual(options[0].exerciseIds, ["incline", "shoulder"]);
  const finished = switchableBlocks(plan, "A", { doneKeys: new Set(["curl:1"]) });
  assert.deepEqual(finished.map((o) => o.blockId), ["B"]);
});
