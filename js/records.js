// Personal-record detection (user feedback: celebrate PRs). Pure — takes
// plain logged-set objects, no IndexedDB — so the rules get real tests.
//
// A PR is scoped to one (routine, exercise, location) "slot family" —
// the same exercise in Upper and in Push has independent records, matching
// per-routine set targets (SPEC.md §10). Within a family, in the order the
// sets were logged, a set is a PR when it strictly beats everything
// logged before it by either:
//   - doing more reps at the exact same weight, or
//   - using a heavier weight than any earlier set (a new heaviest).
// The very first set ever logged for a family has nothing to beat, so it
// is never a PR. Because the comparison includes earlier sets from the
// same workout, a run of equal sets earns one PR, not one per set.
// Callers pass only real working sets: no drop sets, no substituted logs.

/**
 * @param {Array<{id: string, key: string, weightUsed: number, reps: number,
 *   completedAt: number}>} sets - `key` identifies the family
 * @returns {Set<string>} ids of the sets that were personal records
 */
export function findPersonalRecords(sets) {
  const ordered = [...sets].sort(
    (a, b) => a.completedAt - b.completedAt || String(a.id).localeCompare(String(b.id))
  );
  const familyState = new Map();
  const prIds = new Set();

  for (const set of ordered) {
    let state = familyState.get(set.key);
    if (!state) {
      state = { maxWeight: -Infinity, bestRepsByWeight: new Map(), seen: false };
      familyState.set(set.key, state);
    }
    if (state.seen) {
      const bestAtWeight = state.bestRepsByWeight.get(set.weightUsed);
      const beatsReps = bestAtWeight !== undefined && set.reps > bestAtWeight;
      const heaviest = set.weightUsed > state.maxWeight;
      if (beatsReps || heaviest) prIds.add(set.id);
    }
    state.seen = true;
    state.maxWeight = Math.max(state.maxWeight, set.weightUsed);
    state.bestRepsByWeight.set(
      set.weightUsed,
      Math.max(state.bestRepsByWeight.get(set.weightUsed) ?? 0, set.reps)
    );
  }
  return prIds;
}

/**
 * The reps to beat at a given weight: the most reps previously logged at
 * exactly that weight, or null if that weight hasn't been used yet.
 * @param {Array<{weightUsed: number, reps: number}>} familySets
 * @returns {number|null}
 */
export function bestRepsAtWeight(familySets, weight) {
  let best = null;
  for (const s of familySets) {
    if (s.weightUsed === weight && (best === null || s.reps > best)) best = s.reps;
  }
  return best;
}
