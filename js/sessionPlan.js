// Session plan generation (SPEC.md §3.3, §8 phase 3).
//
// Pure logic only — no IndexedDB access, no imports from repository.js.
// Turns a routine's ordered blocks (already filtered to one location) plus
// each exercise's set targets into a flat, ordered sequence of plan items
// ready for the Active Workout screen to walk one item at a time. This is
// what makes alternating-pair interleaving (§3.3) invisible to the UI: the
// UI just advances through the array.
//
// Warmups (§3.4) appear in the sequence as reminder items — never logged,
// never counted toward progression — so the Active Workout screen can
// render them as a "tap when ready" prompt without special-casing them.

/**
 * @typedef {Object} PlanItem
 * @property {"warmup"|"workingSet"} kind
 * @property {string} exerciseId
 * @property {number} [setNumber] - working sets only; matches setTargets.setNumber
 * @property {string} [setTargetId] - working sets only
 * @property {number} blockIndex - source block's orderIndex, for grouping/UI
 * @property {"single"|"alternatingPair"|"superset"} blockType
 * @property {number} legIndex - 0 for a single block or a pair's exercise1,
 *   1 for a pair's exercise2
 * @property {boolean} restAfter - whether the Active Workout screen should
 *   start the rest timer after logging this item. False only for a
 *   superset's first leg (user feedback: back-to-back, no rest between the
 *   two exercises — only after the pair completes).
 */

/**
 * Build the flat ordered session plan for one (routine, location).
 *
 * @param {Array} blocks - routineBlocks already scoped to the routine and
 *   location (e.g. via repository.listBlocksForRoutine). Order is derived
 *   from each block's `orderIndex` — callers do not need to pre-sort.
 * @param {(exerciseId: string) => Array} getSetTargets - synchronous lookup
 *   returning that exercise's working-set targets for this location, in any
 *   order; this function sorts them by `setNumber` itself.
 * @returns {PlanItem[]}
 */
export function buildSessionPlan(blocks, getSetTargets) {
  const orderedBlocks = [...blocks].sort((a, b) => a.orderIndex - b.orderIndex);
  const plan = [];

  for (const block of orderedBlocks) {
    if (block.blockType === "single") {
      plan.push(...planSingleBlock(block, getSetTargets));
    } else if (block.blockType === "alternatingPair") {
      // SPEC.md §3.3: full rest after every leg, not a back-to-back superset.
      plan.push(...planPairedBlock(block, getSetTargets, { restAfterLeg0: true }));
    } else if (block.blockType === "superset") {
      // User feedback: zero rest between the two exercises — only after
      // the pair completes.
      plan.push(...planPairedBlock(block, getSetTargets, { restAfterLeg0: false }));
    } else {
      throw new Error(`Unknown blockType: ${block.blockType}`);
    }
  }

  return plan;
}

function planSingleBlock(block, getSetTargets) {
  const items = [];
  if (block.hasWarmup1) items.push(warmupItem(block, block.exercise1Id, 0));
  for (const target of sortedTargets(block.exercise1Id, getSetTargets)) {
    items.push(workingSetItem(block, block.exercise1Id, 0, target, true));
  }
  return items;
}

// Shared by alternatingPair and superset — both interleave two exercises
// set-by-set ("Bench S1 → Row S1 → Bench S2 → Row S2 → ..."); they only
// differ in whether a rest timer follows the first leg. Any warmups for
// either exercise come first (a warmup for exercise1, then one for
// exercise2), then the working sets interleave. If the two exercises have
// different set counts, the shorter one simply drops out once exhausted
// rather than blocking the longer one.
function planPairedBlock(block, getSetTargets, { restAfterLeg0 }) {
  const items = [];
  const targetsA = sortedTargets(block.exercise1Id, getSetTargets);
  const targetsB = sortedTargets(block.exercise2Id, getSetTargets);

  if (block.hasWarmup1) items.push(warmupItem(block, block.exercise1Id, 0));
  if (block.hasWarmup2) items.push(warmupItem(block, block.exercise2Id, 1));

  const legCount = Math.max(targetsA.length, targetsB.length);
  for (let i = 0; i < legCount; i++) {
    // restAfterLeg0 (no rest, straight into leg1) only makes sense while
    // there's actually a leg1 at this round to jump straight into — once
    // the shorter side has dropped out, a leftover leg0 rests normally.
    const hasPartner = Boolean(targetsA[i]) && Boolean(targetsB[i]);
    if (targetsA[i]) {
      items.push(workingSetItem(block, block.exercise1Id, 0, targetsA[i], hasPartner ? restAfterLeg0 : true));
    }
    if (targetsB[i]) items.push(workingSetItem(block, block.exercise2Id, 1, targetsB[i], true));
  }
  return items;
}

function sortedTargets(exerciseId, getSetTargets) {
  if (!exerciseId) return [];
  return [...getSetTargets(exerciseId)].sort((a, b) => a.setNumber - b.setNumber);
}

function warmupItem(block, exerciseId, legIndex) {
  return {
    kind: "warmup",
    exerciseId,
    blockIndex: block.orderIndex,
    blockType: block.blockType,
    legIndex,
    restAfter: true,
  };
}

function workingSetItem(block, exerciseId, legIndex, target, restAfter) {
  return {
    kind: "workingSet",
    exerciseId,
    setNumber: target.setNumber,
    setTargetId: target.id,
    blockIndex: block.orderIndex,
    blockType: block.blockType,
    legIndex,
    restAfter,
  };
}
