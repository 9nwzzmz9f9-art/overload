// Resume-position logic for the Active Workout screen (SPEC.md §6).
// Pure function — given the flat session plan (sessionPlan.js) and this
// workout's recorded progress, finds the next item to show. This is what
// makes the screen safely resumable after a reload or a killed tab: there
// is no separate "current step" counter to get out of sync, it's always
// re-derived from what's actually been logged.

/**
 * @param {import("./sessionPlan.js").PlanItem[]} plan
 * @param {Object} progress
 * @param {Array<{exerciseId: string, setNumber: number}>} [progress.loggedSets]
 *   - this workout's loggedSets records. A workingSet item counts as done
 *   once a loggedSet exists for its (exerciseId, setNumber) pair — the
 *   Active Workout screen only ever logs one set per slot per workout.
 * @param {string[]} [progress.skippedExerciseIds] - exercises the lifter
 *   chose to skip entirely for this workout (SPEC.md §6 "tap to skip a
 *   set or exercise"); every remaining item for these is passed over.
 * @param {string[]} [progress.skippedSetKeys] - `${exerciseId}:${setNumber}`
 *   keys for individual working sets skipped one at a time, without
 *   skipping the rest of that exercise.
 * @param {string[]} [progress.deferredSetKeys] - `${exerciseId}:${setNumber}`
 *   keys for sets marked "do this later" (user feedback — e.g. the
 *   equipment is occupied). Unlike a skip, these come back: they're
 *   passed over on a first pass through the plan, then revisited on a
 *   second pass once nothing else remains — so they show up "later,"
 *   never disappear.
 * @param {string[]} [progress.completedWarmupKeys] - `${exerciseId}:${blockIndex}:${legIndex}`
 *   keys for warmups already acknowledged. Warmups are never logged as
 *   data (SPEC.md §3.4), so this is the only record of "already shown."
 * @returns {number} index into `plan` of the next item to show, or
 *   `plan.length` when everything is done.
 */
export function findResumeIndex(plan, progress = {}) {
  const {
    loggedSets = [],
    skippedExerciseIds = [],
    skippedSetKeys = [],
    deferredSetKeys = [],
    completedWarmupKeys = [],
  } = progress;

  const loggedKeys = new Set(loggedSets.map((s) => `${s.exerciseId}:${s.setNumber}`));
  const skippedSets = new Set(skippedSetKeys);
  const deferredSets = new Set(deferredSetKeys);
  const warmupDone = new Set(completedWarmupKeys);
  const skippedExercises = new Set(skippedExerciseIds);

  // Pass 1: the next item that isn't done, isn't skipped, and hasn't
  // been deferred.
  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    if (skippedExercises.has(item.exerciseId)) continue;

    if (item.kind === "workingSet") {
      const key = `${item.exerciseId}:${item.setNumber}`;
      if (loggedKeys.has(key) || skippedSets.has(key) || deferredSets.has(key)) continue;
      return i;
    } else if (item.kind === "warmup") {
      if (!warmupDone.has(warmupKey(item))) return i;
    }
  }

  // Pass 2: nothing left except deferred items (or truly done) — surface
  // them now, in their original order.
  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    if (item.kind !== "workingSet") continue;
    if (skippedExercises.has(item.exerciseId)) continue;
    const key = `${item.exerciseId}:${item.setNumber}`;
    if (loggedKeys.has(key) || skippedSets.has(key)) continue;
    return i; // must be a deferred, not-yet-logged set — pass 1 already ruled out everything else
  }

  return plan.length;
}

export function warmupKey(item) {
  return `${item.exerciseId}:${item.blockIndex}:${item.legIndex}`;
}
