// Unit tests for js/progressionEngine.js (SPEC.md §5, §8 phase 4).
//
// Run with: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DECISION,
  evaluateLoggedSet,
  manualProgress,
  resolveBelowRange,
  resolveWeightAboveTarget,
  resolveCeilingBlocked,
} from "../js/progressionEngine.js";

function makeTarget(overrides = {}) {
  return {
    currentWeight: 100,
    repRangeLow: 4,
    repRangeHigh: 6,
    progressionTriggerReps: 10,
    increment: 10,
    ...overrides,
  };
}

function makeLoggedSet(overrides = {}) {
  return {
    weightUsed: 100,
    reps: 5,
    wasSubstituted: false,
    ...overrides,
  };
}

// --- the core table (§5) -------------------------------------------------

test("reps >= trigger progresses by the slot's increment", () => {
  const target = makeTarget({ currentWeight: 100, increment: 10, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ weightUsed: 100, reps: 10 }), target);
  assert.equal(decision.kind, DECISION.PROGRESSED);
  assert.equal(decision.newWeight, 110);
  assert.equal(decision.reason, "progressed");
});

test("repRangeLow <= reps < trigger holds", () => {
  const target = makeTarget({ repRangeLow: 4, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ weightUsed: 100, reps: 6 }), target);
  assert.equal(decision.kind, DECISION.HELD);
});

test("reps < repRangeLow flags for a below-range decision, not an automatic change", () => {
  const target = makeTarget({ currentWeight: 100, increment: 10, repRangeLow: 4 });
  const decision = evaluateLoggedSet(makeLoggedSet({ weightUsed: 100, reps: 3 }), target);
  assert.equal(decision.kind, DECISION.BELOW_RANGE);
  assert.equal(decision.deloadWeight, 90);
  assert.equal(decision.holdWeight, 100);
});

// --- boundary cases (explicitly called out in SPEC.md §8 phase 4) -------

test("boundary: one rep below the trigger holds, not progresses", () => {
  const target = makeTarget({ repRangeLow: 4, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ reps: 9 }), target);
  assert.equal(decision.kind, DECISION.HELD);
});

test("boundary: exactly at the trigger progresses", () => {
  const target = makeTarget({ progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ reps: 10 }), target);
  assert.equal(decision.kind, DECISION.PROGRESSED);
});

test("boundary: exactly at repRangeLow holds", () => {
  const target = makeTarget({ repRangeLow: 4, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ reps: 4 }), target);
  assert.equal(decision.kind, DECISION.HELD);
});

test("boundary: one rep below repRangeLow is flagged below-range", () => {
  const target = makeTarget({ repRangeLow: 4 });
  const decision = evaluateLoggedSet(makeLoggedSet({ reps: 3 }), target);
  assert.equal(decision.kind, DECISION.BELOW_RANGE);
});

test("boundary: a trigger equal to repRangeHigh progresses at the top of the range, not flagged as unusual", () => {
  // SPEC.md §9 seed: high-rep range 6-10, trigger 10 (trigger === repRangeHigh).
  const target = makeTarget({ repRangeLow: 6, repRangeHigh: 10, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ reps: 10 }), target);
  assert.equal(decision.kind, DECISION.PROGRESSED);
});

test("boundary: a trigger above repRangeHigh (earned, not just hit) still progresses at trigger", () => {
  // SPEC.md §9 seed: low-rep range 4-6, trigger 7 (trigger > repRangeHigh).
  const target = makeTarget({ repRangeLow: 4, repRangeHigh: 6, progressionTriggerReps: 7 });
  const held = evaluateLoggedSet(makeLoggedSet({ reps: 6 }), target); // at repRangeHigh, below trigger
  assert.equal(held.kind, DECISION.HELD);
  const progressed = evaluateLoggedSet(makeLoggedSet({ reps: 7 }), target);
  assert.equal(progressed.kind, DECISION.PROGRESSED);
});

test("reps above repRangeHigh are not flagged as out of range — same as any other progress", () => {
  const target = makeTarget({ repRangeLow: 4, repRangeHigh: 6, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ reps: 8 }), target);
  assert.equal(decision.kind, DECISION.HELD);
});

// --- negative weights / weighted bodyweight (§3.5 assistance) -----------

test("negative currentWeight progresses normally (less assistance is progress)", () => {
  const target = makeTarget({ currentWeight: -25, increment: 5, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ weightUsed: -25, reps: 10 }), target);
  assert.equal(decision.kind, DECISION.PROGRESSED);
  assert.equal(decision.newWeight, -20);
});

test("negative currentWeight crossing exactly to zero", () => {
  const target = makeTarget({ currentWeight: -5, increment: 5, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ weightUsed: -5, reps: 10 }), target);
  assert.equal(decision.newWeight, 0);
});

test("negative currentWeight crossing from assisted to added weight", () => {
  const target = makeTarget({ currentWeight: -5, increment: 10, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ weightUsed: -5, reps: 10 }), target);
  assert.equal(decision.newWeight, 5);
});

test("negative currentWeight below range still flags rather than auto-changing", () => {
  const target = makeTarget({ currentWeight: -25, increment: 5, repRangeLow: 4 });
  const decision = evaluateLoggedSet(makeLoggedSet({ weightUsed: -25, reps: 2 }), target);
  assert.equal(decision.kind, DECISION.BELOW_RANGE);
  assert.equal(decision.deloadWeight, -30);
});

// --- substitutions --------------------------------------------------------

test("a substituted set never progresses, even with trigger-hitting reps", () => {
  const target = makeTarget({ currentWeight: 100, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(
    makeLoggedSet({ weightUsed: 100, reps: 12, wasSubstituted: true }),
    target
  );
  assert.equal(decision.kind, DECISION.SUBSTITUTED);
});

// --- weight overrides (§5 "Weight overrides") -----------------------------

test("lifting below target holds regardless of reps hitting the trigger", () => {
  const target = makeTarget({ currentWeight: 100, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ weightUsed: 90, reps: 12 }), target);
  assert.equal(decision.kind, DECISION.WEIGHT_BELOW_TARGET);
});

test("lifting below target holds even with very few reps (still not an automatic change)", () => {
  const target = makeTarget({ currentWeight: 100 });
  const decision = evaluateLoggedSet(makeLoggedSet({ weightUsed: 80, reps: 1 }), target);
  assert.equal(decision.kind, DECISION.WEIGHT_BELOW_TARGET);
});

test("lifting above target flags for adopt/keep instead of auto-progressing", () => {
  const target = makeTarget({ currentWeight: 100, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ weightUsed: 110, reps: 5 }), target);
  assert.equal(decision.kind, DECISION.WEIGHT_ABOVE_TARGET);
  assert.equal(decision.adoptWeight, 110);
  assert.equal(decision.keepWeight, 100);
});

test("resolveWeightAboveTarget: adopt sets the new target and logs manualEdit", () => {
  const decision = evaluateLoggedSet(
    makeLoggedSet({ weightUsed: 110, reps: 5 }),
    makeTarget({ currentWeight: 100 })
  );
  const result = resolveWeightAboveTarget(decision, "adopt");
  assert.deepEqual(result, { newWeight: 110, reason: "manualEdit" });
});

test("resolveWeightAboveTarget: keep is a one-off deviation, currentWeight unchanged", () => {
  const decision = evaluateLoggedSet(
    makeLoggedSet({ weightUsed: 110, reps: 5 }),
    makeTarget({ currentWeight: 100 })
  );
  const result = resolveWeightAboveTarget(decision, "keep");
  assert.deepEqual(result, { newWeight: 100, reason: "held" });
});

test("resolveWeightAboveTarget rejects an unknown choice", () => {
  const decision = evaluateLoggedSet(
    makeLoggedSet({ weightUsed: 110, reps: 5 }),
    makeTarget({ currentWeight: 100 })
  );
  assert.throws(() => resolveWeightAboveTarget(decision, "nope"), /unknown choice/);
});

test("resolveWeightAboveTarget rejects a decision of the wrong kind", () => {
  const heldDecision = evaluateLoggedSet(makeLoggedSet({ weightUsed: 100, reps: 5 }), makeTarget());
  assert.throws(() => resolveWeightAboveTarget(heldDecision, "adopt"), /expected "weightAboveTarget"/);
});

// --- below-range resolution -----------------------------------------------

test("resolveBelowRange: deload subtracts the increment", () => {
  const decision = evaluateLoggedSet(
    makeLoggedSet({ weightUsed: 100, reps: 2 }),
    makeTarget({ currentWeight: 100, increment: 10 })
  );
  assert.deepEqual(resolveBelowRange(decision, "deload"), { newWeight: 90, reason: "deloaded" });
});

test("resolveBelowRange: hold keeps the current weight", () => {
  const decision = evaluateLoggedSet(
    makeLoggedSet({ weightUsed: 100, reps: 2 }),
    makeTarget({ currentWeight: 100, increment: 10 })
  );
  assert.deepEqual(resolveBelowRange(decision, "hold"), { newWeight: 100, reason: "held" });
});

test("resolveBelowRange: custom requires an explicit numeric weight", () => {
  const decision = evaluateLoggedSet(
    makeLoggedSet({ weightUsed: 100, reps: 2 }),
    makeTarget({ currentWeight: 100, increment: 10 })
  );
  assert.deepEqual(resolveBelowRange(decision, "custom", 85), { newWeight: 85, reason: "manualEdit" });
  assert.throws(() => resolveBelowRange(decision, "custom"), /customWeight is required/);
});

// --- equipment ceilings (§5 "Equipment ceilings") -------------------------

test("progression that would exceed the ceiling is blocked, not silently capped", () => {
  const target = makeTarget({ currentWeight: 70, increment: 10, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ weightUsed: 70, reps: 10 }), target, {
    ceiling: 75,
  });
  assert.equal(decision.kind, DECISION.CEILING_BLOCKED);
  assert.equal(decision.blockedWeight, 80);
  assert.equal(decision.ceiling, 75);
});

test("progression landing exactly on the ceiling is not blocked", () => {
  const target = makeTarget({ currentWeight: 65, increment: 10, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ weightUsed: 65, reps: 10 }), target, {
    ceiling: 75,
  });
  assert.equal(decision.kind, DECISION.PROGRESSED);
  assert.equal(decision.newWeight, 75);
});

test("no ceiling entry means no ceiling — progression applies freely", () => {
  const target = makeTarget({ currentWeight: 70, increment: 10, progressionTriggerReps: 10 });
  const decision = evaluateLoggedSet(makeLoggedSet({ weightUsed: 70, reps: 10 }), target);
  assert.equal(decision.kind, DECISION.PROGRESSED);
});

test("resolveCeilingBlocked: holdAtCeiling caps the weight at the ceiling", () => {
  const decision = evaluateLoggedSet(
    makeLoggedSet({ weightUsed: 70, reps: 10 }),
    makeTarget({ currentWeight: 70, increment: 10 }),
    { ceiling: 75 }
  );
  assert.deepEqual(resolveCeilingBlocked(decision, "holdAtCeiling"), { newWeight: 75, reason: "held" });
});

test("resolveCeilingBlocked: raiseTrigger keeps the weight but raises the trigger", () => {
  const decision = evaluateLoggedSet(
    makeLoggedSet({ weightUsed: 70, reps: 10 }),
    makeTarget({ currentWeight: 70, increment: 10 }),
    { ceiling: 75 }
  );
  const result = resolveCeilingBlocked(decision, "raiseTrigger", 12);
  assert.deepEqual(result, { newWeight: 70, newProgressionTriggerReps: 12, reason: "held" });
});

test("resolveCeilingBlocked: raiseTrigger requires a numeric raisedTrigger", () => {
  const decision = evaluateLoggedSet(
    makeLoggedSet({ weightUsed: 70, reps: 10 }),
    makeTarget({ currentWeight: 70, increment: 10 }),
    { ceiling: 75 }
  );
  assert.throws(() => resolveCeilingBlocked(decision, "raiseTrigger"), /raisedTrigger is required/);
});

test("resolveCeilingBlocked: swapExercise leaves this slot's weight untouched", () => {
  const decision = evaluateLoggedSet(
    makeLoggedSet({ weightUsed: 70, reps: 10 }),
    makeTarget({ currentWeight: 70, increment: 10 }),
    { ceiling: 75 }
  );
  assert.deepEqual(resolveCeilingBlocked(decision, "swapExercise"), { newWeight: 70, reason: "held" });
});

// --- manual early progression (§5 "Manual early progression") ------------

test("manualProgress applies the increment even though the trigger wasn't reached", () => {
  const target = makeTarget({ currentWeight: 100, increment: 10 });
  const decision = manualProgress(target);
  assert.equal(decision.kind, DECISION.PROGRESSED);
  assert.equal(decision.newWeight, 110);
  assert.equal(decision.reason, "manualEdit");
});

test("manualProgress still respects the equipment ceiling", () => {
  const target = makeTarget({ currentWeight: 70, increment: 10 });
  const decision = manualProgress(target, { ceiling: 75 });
  assert.equal(decision.kind, DECISION.CEILING_BLOCKED);
  assert.equal(decision.blockedWeight, 80);
});

test("manualProgress works on negative (assisted) weights too", () => {
  const target = makeTarget({ currentWeight: -25, increment: 5 });
  const decision = manualProgress(target);
  assert.equal(decision.newWeight, -20);
});
