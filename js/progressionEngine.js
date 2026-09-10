// The progression engine (SPEC.md §5, §8 phase 4).
//
// Pure, deterministic logic only — no IndexedDB access, no imports from
// repository.js. Per §5: "Put all of this in a single progressionEngine
// module... No progression logic anywhere else in the codebase." This
// file is the entire rule set; the completion-flow UI (phase 6) calls
// into it and writes whatever it decides — it never re-implements or
// second-guesses these rules itself.
//
// evaluateLoggedSet() runs once per logged working set at workout
// completion and returns a decision describing what happened. It never
// mutates anything. Some decisions are terminal (PROGRESSED / HELD /
// SUBSTITUTED); others are "flagged" and need a resolve*() call once the
// user has picked among the completion screen's inline choices.

export const DECISION = Object.freeze({
  SUBSTITUTED: "substituted", // wasSubstituted — progression skipped entirely
  WEIGHT_BELOW_TARGET: "weightBelowTarget", // held, regardless of reps
  WEIGHT_ABOVE_TARGET: "weightAboveTarget", // flagged: adopt or keep
  PROGRESSED: "progressed", // trigger reached at target weight, applied
  HELD: "held", // in range but below trigger
  BELOW_RANGE: "belowRange", // flagged: deload / hold / custom
  CEILING_BLOCKED: "ceilingBlocked", // would exceed ceiling — flagged instead of applied
});

/**
 * Evaluate one logged working set against its slot's target (§5's table),
 * with weight-override and equipment-ceiling rules layered on top.
 *
 * @param {Object} loggedSet - { weightUsed, reps, wasSubstituted }
 * @param {Object} setTarget - { currentWeight, repRangeLow, repRangeHigh,
 *   progressionTriggerReps, increment }
 * @param {Object} [options]
 * @param {number|null} [options.ceiling] - this exercise's equipment
 *   category ceiling at this location (from plateProfiles), or null/
 *   undefined if none is defined (SPEC.md §4 plateProfiles: "a missing
 *   entry means no ceiling").
 * @returns {Object} a decision — see DECISION for `.kind`. Always carries
 *   `currentWeight` (the slot's weight going into this evaluation).
 */
export function evaluateLoggedSet(loggedSet, setTarget, options = {}) {
  const { weightUsed, reps, wasSubstituted = false } = loggedSet;
  const { currentWeight, repRangeLow, progressionTriggerReps, increment } = setTarget;
  const ceiling = options.ceiling ?? null;

  // Substitutions never progress, regardless of anything else (§5
  // "Substitutions").
  if (wasSubstituted) {
    return { kind: DECISION.SUBSTITUTED, currentWeight };
  }

  // Weight overrides key progression off the weight actually lifted, not
  // the prescribed target (§5 "Weight overrides") — this check comes
  // before the rep-based table and overrides it entirely.
  if (weightUsed < currentWeight) {
    return { kind: DECISION.WEIGHT_BELOW_TARGET, currentWeight, weightUsed, reps };
  }
  if (weightUsed > currentWeight) {
    return {
      kind: DECISION.WEIGHT_ABOVE_TARGET,
      currentWeight,
      weightUsed,
      reps,
      adoptWeight: weightUsed,
      keepWeight: currentWeight,
    };
  }

  // weightUsed === currentWeight: the rep-based table in §5 applies.
  if (reps >= progressionTriggerReps) {
    const newWeight = currentWeight + increment;
    if (ceiling !== null && newWeight > ceiling) {
      return {
        kind: DECISION.CEILING_BLOCKED,
        currentWeight,
        weightUsed,
        reps,
        blockedWeight: newWeight,
        ceiling,
      };
    }
    return {
      kind: DECISION.PROGRESSED,
      currentWeight,
      weightUsed,
      reps,
      newWeight,
      reason: "progressed",
    };
  }

  if (reps >= repRangeLow) {
    return { kind: DECISION.HELD, currentWeight, weightUsed, reps };
  }

  return {
    kind: DECISION.BELOW_RANGE,
    currentWeight,
    weightUsed,
    reps,
    deloadWeight: currentWeight - increment,
    holdWeight: currentWeight,
  };
}

/**
 * "Progress anyway" (§5 "Manual early progression"): a one-tap action
 * available on every logged slot at completion, applying the increment
 * even though the trigger wasn't reached. Still respects the equipment
 * ceiling — the weight has to physically exist regardless of why the
 * slot is moving up.
 *
 * @param {Object} setTarget - { currentWeight, increment }
 * @param {Object} [options]
 * @param {number|null} [options.ceiling]
 */
export function manualProgress(setTarget, options = {}) {
  const { currentWeight, increment } = setTarget;
  const ceiling = options.ceiling ?? null;
  const newWeight = currentWeight + increment;
  if (ceiling !== null && newWeight > ceiling) {
    return { kind: DECISION.CEILING_BLOCKED, currentWeight, blockedWeight: newWeight, ceiling };
  }
  return { kind: DECISION.PROGRESSED, currentWeight, newWeight, reason: "manualEdit" };
}

/**
 * Resolve a BELOW_RANGE decision into a concrete weight change, per the
 * completion screen's inline choice (§5 "Below-range flow").
 *
 * @param {Object} decision - a BELOW_RANGE decision from evaluateLoggedSet
 * @param {"deload"|"hold"|"custom"} choice
 * @param {number} [customWeight] - required when choice === "custom"
 */
export function resolveBelowRange(decision, choice, customWeight) {
  requireKind(decision, DECISION.BELOW_RANGE, "resolveBelowRange");
  if (choice === "deload") return { newWeight: decision.deloadWeight, reason: "deloaded" };
  if (choice === "hold") return { newWeight: decision.holdWeight, reason: "held" };
  if (choice === "custom") {
    if (typeof customWeight !== "number") {
      throw new Error('resolveBelowRange: customWeight is required for choice "custom"');
    }
    return { newWeight: customWeight, reason: "manualEdit" };
  }
  throw new Error(`resolveBelowRange: unknown choice "${choice}"`);
}

/**
 * Resolve a WEIGHT_ABOVE_TARGET decision (§5 "Weight overrides"):
 * *Adopt <weight> as the new target* / *Keep <currentWeight>*. Overrides
 * are one-off by default — "keep" is what happens if the user does
 * nothing, so callers may use it as a safe default.
 *
 * @param {Object} decision - a WEIGHT_ABOVE_TARGET decision
 * @param {"adopt"|"keep"} choice
 */
export function resolveWeightAboveTarget(decision, choice) {
  requireKind(decision, DECISION.WEIGHT_ABOVE_TARGET, "resolveWeightAboveTarget");
  if (choice === "adopt") return { newWeight: decision.adoptWeight, reason: "manualEdit" };
  if (choice === "keep") return { newWeight: decision.keepWeight, reason: "held" };
  throw new Error(`resolveWeightAboveTarget: unknown choice "${choice}"`);
}

/**
 * Resolve a CEILING_BLOCKED decision (§5 "Equipment ceilings"):
 * *Hold at <ceiling>* / *Raise the rep trigger instead* / *Swap
 * exercise*. "swapExercise" is a program-editor action — the engine just
 * confirms this slot's weight holds; picking a new exercise is handled
 * by the UI/repository, not this module.
 *
 * @param {Object} decision - a CEILING_BLOCKED decision
 * @param {"holdAtCeiling"|"raiseTrigger"|"swapExercise"} choice
 * @param {number} [raisedTrigger] - required when choice === "raiseTrigger"
 */
export function resolveCeilingBlocked(decision, choice, raisedTrigger) {
  requireKind(decision, DECISION.CEILING_BLOCKED, "resolveCeilingBlocked");
  if (choice === "holdAtCeiling") {
    return { newWeight: decision.ceiling, reason: "held" };
  }
  if (choice === "raiseTrigger") {
    if (typeof raisedTrigger !== "number") {
      throw new Error('resolveCeilingBlocked: raisedTrigger is required for choice "raiseTrigger"');
    }
    return { newWeight: decision.currentWeight, newProgressionTriggerReps: raisedTrigger, reason: "held" };
  }
  if (choice === "swapExercise") {
    return { newWeight: decision.currentWeight, reason: "held" };
  }
  throw new Error(`resolveCeilingBlocked: unknown choice "${choice}"`);
}

function requireKind(decision, expectedKind, fnName) {
  if (decision.kind !== expectedKind) {
    throw new Error(`${fnName} called on a "${decision.kind}" decision, expected "${expectedKind}"`);
  }
}
