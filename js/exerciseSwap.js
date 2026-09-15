// Position-swap for two exercises' remaining sets within a workout
// (user feedback: "the equipment for exercise 2 is occupied, let me do
// exercise 4 now, and get exercise 2 back around where 4 would have come
// up" — not deferred all the way to the end of the workout).
//
// Pure — trades CONTENT (exerciseId/setNumber/setTargetId) between two
// exercises' not-yet-done working-set positions in the flat session plan
// (sessionPlan.js), matched in order: A's 1st remaining occurrence trades
// with B's 1st remaining, 2nd with 2nd, and so on. Each position's own
// structural facts — `restAfter`, `blockIndex`, `legIndex` — stay with
// the position, since those describe the original block layout (e.g.
// "this is a superset's first leg, no rest after it"), not whichever
// exercise now occupies it. If the two have different remaining counts,
// the extra items on the longer side are left where they are — nothing
// left to trade with.
//
// Warmup items are never touched — they're a different, non-setNumber
// mechanism (workoutProgress.js's completedWarmupKeys), and swapping
// them adds real complexity for a narrow edge case.

/**
 * @param {import("./sessionPlan.js").PlanItem[]} plan
 * @param {string} exerciseIdA
 * @param {string} exerciseIdB
 * @param {Set<string>} [doneKeys] - `${exerciseId}:${setNumber}` keys
 *   already logged/skipped — excluded from swapping so it never rewrites
 *   something that already happened.
 * @returns {import("./sessionPlan.js").PlanItem[]} a new array; `plan` is untouched
 */
export function swapExercisePositions(plan, exerciseIdA, exerciseIdB, doneKeys = new Set()) {
  if (exerciseIdA === exerciseIdB) return [...plan];

  const indicesA = [];
  const indicesB = [];
  plan.forEach((item, index) => {
    if (item.kind !== "workingSet") return;
    if (doneKeys.has(`${item.exerciseId}:${item.setNumber}`)) return;
    if (item.exerciseId === exerciseIdA) indicesA.push(index);
    else if (item.exerciseId === exerciseIdB) indicesB.push(index);
  });

  const result = [...plan];
  const pairCount = Math.min(indicesA.length, indicesB.length);
  for (let k = 0; k < pairCount; k++) {
    const posA = indicesA[k];
    const posB = indicesB[k];
    const contentA = plan[posA];
    const contentB = plan[posB];
    result[posA] = {
      ...contentA,
      exerciseId: contentB.exerciseId,
      setNumber: contentB.setNumber,
      setTargetId: contentB.setTargetId,
    };
    result[posB] = {
      ...contentB,
      exerciseId: contentA.exerciseId,
      setNumber: contentA.setNumber,
      setTargetId: contentA.setTargetId,
    };
  }
  return result;
}

/**
 * Applies a workout's whole list of requested swap pairs, in order.
 * Swapping the same pair twice cancels out — each call re-matches by
 * current remaining-occurrence order, so a second identical swap trades
 * everything right back.
 * @param {import("./sessionPlan.js").PlanItem[]} plan
 * @param {Array<[string, string]>} swapPairs
 * @param {Set<string>} [doneKeys]
 */
export function applyPositionSwaps(plan, swapPairs, doneKeys = new Set()) {
  return (swapPairs ?? []).reduce(
    (currentPlan, [a, b]) => swapExercisePositions(currentPlan, a, b, doneKeys),
    plan
  );
}
