// "Switch exercise -> switch block" (user feedback): before starting a
// block, the lifter can pull another block forward — its remaining items
// run right now, in their planned order, and only then does the block
// they were about to do resume. Everything else keeps its order.
//
// Pure functions over the flat session plan (see sessionPlan.js), applied
// on every render from the workout's stored `blockMoves` list, so resume
// position and "Set N of M" all agree — same approach as exerciseSwap.js.

/**
 * @param {{doneKeys?: Set<string>, completedWarmupKeys?: Set<string>}} progress
 */
function isDone(item, { doneKeys = new Set(), completedWarmupKeys = new Set() }) {
  if (item.kind === "workingSet") return doneKeys.has(`${item.exerciseId}:${item.setNumber}`);
  return completedWarmupKeys.has(`${item.exerciseId}:${item.blockIndex}:${item.legIndex}`);
}

/**
 * Moves every not-yet-done item of `movedBlockId` to sit immediately
 * before the first not-yet-done item of `beforeBlockId`. Items already
 * done stay where they are (they no longer matter for position). Returns
 * a new array; a no-op if either block has nothing left.
 */
export function moveBlockBefore(plan, movedBlockId, beforeBlockId, progress = {}) {
  if (movedBlockId === beforeBlockId) return [...plan];
  const moved = plan.filter((item) => item.blockId === movedBlockId && !isDone(item, progress));
  if (moved.length === 0) return [...plan];
  const movedSet = new Set(moved);
  const rest = plan.filter((item) => !movedSet.has(item));
  const anchor = rest.findIndex((item) => item.blockId === beforeBlockId && !isDone(item, progress));
  if (anchor === -1) return [...plan];
  return [...rest.slice(0, anchor), ...moved, ...rest.slice(anchor)];
}

/** Applies [movedBlockId, beforeBlockId] pairs in order. */
export function applyBlockMoves(plan, moves, progress = {}) {
  return (moves ?? []).reduce(
    (current, [movedId, beforeId]) => moveBlockBefore(current, movedId, beforeId, progress),
    plan
  );
}

/** True while no working set of this block has been logged yet. */
export function isBlockUnstarted(plan, blockId, { doneKeys = new Set() } = {}) {
  return !plan.some(
    (item) =>
      item.blockId === blockId &&
      item.kind === "workingSet" &&
      doneKeys.has(`${item.exerciseId}:${item.setNumber}`)
  );
}

/**
 * Other blocks that still have working sets to do, in plan order, each
 * with its exercises in leg order — what the "switch to…" list offers.
 * @returns {Array<{blockId: string, blockType: string, exerciseIds: string[]}>}
 */
export function switchableBlocks(plan, currentBlockId, { doneKeys = new Set() } = {}) {
  const blocks = new Map();
  for (const item of plan) {
    if (item.kind !== "workingSet" || !item.blockId || item.blockId === currentBlockId) continue;
    if (doneKeys.has(`${item.exerciseId}:${item.setNumber}`)) continue;
    if (!blocks.has(item.blockId)) {
      blocks.set(item.blockId, { blockId: item.blockId, blockType: item.blockType, exerciseIds: [] });
    }
    const entry = blocks.get(item.blockId);
    if (!entry.exerciseIds.includes(item.exerciseId)) entry.exerciseIds.push(item.exerciseId);
  }
  return [...blocks.values()];
}
