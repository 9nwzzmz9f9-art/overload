// Per-side plate-loading math for the Active Workout plate calculator
// (SPEC.md §6). Pure function — no DOM, no repository access — so the
// greedy-loading algorithm gets real unit tests.
//
// Only meaningful for plate-loaded barbell work: given a target weight,
// the location's bar weight, and the plates actually on hand (each
// denomination plus how many the lifter owns), returns how many of each
// plate go on ONE side of the bar.

/**
 * @param {number} targetWeight - the full weight on the bar (bar + both sides)
 * @param {number} barWeight
 * @param {Array<{weight: number, count: number}>} denominations - `count`
 *   is the total number of that plate the lifter owns (both sides combined,
 *   e.g. count: 2 means one matched pair)
 * @returns {{ perSide: Array<{weight: number, count: number}>,
 *             remainderPerSide: number, exact: boolean }}
 *   `remainderPerSide` is how much (if any) of the needed per-side weight
 *   couldn't be matched with plates on hand — 0 when `exact` is true.
 */
export function calculatePlateLoading(targetWeight, barWeight, denominations) {
  const EPSILON = 1e-9;
  // Clamps a below-bar target to "load nothing" rather than a negative
  // requirement — barbell targets should never be lighter than the empty
  // bar, but this keeps the function total instead of throwing on it.
  const perSideNeeded = Math.max(0, (targetWeight - barWeight) / 2);

  const sorted = [...denominations].sort((a, b) => b.weight - a.weight);
  let remaining = perSideNeeded;
  const perSide = [];

  for (const { weight, count } of sorted) {
    if (weight <= 0) continue;
    const availablePerSide = Math.floor(count / 2);
    let used = 0;
    while (used < availablePerSide && remaining - weight >= -EPSILON) {
      remaining -= weight;
      used++;
    }
    if (used > 0) perSide.push({ weight, count: used });
  }

  const remainderPerSide = Math.max(0, remaining);
  return { perSide, remainderPerSide, exact: remainderPerSide < EPSILON };
}
