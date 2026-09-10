// Small pure aggregations for the Home screen's recent-workouts list
// (user feedback — not in the original spec).

/**
 * Total weight moved across a workout's logged sets. Assisted
 * weighted-bodyweight reps (negative weightUsed) count as 0 rather than
 * subtracting — assistance isn't "weight lifted" (user feedback).
 */
export function computeTotalWeightLifted(loggedSets) {
  return loggedSets.reduce((sum, s) => sum + Math.max(s.weightUsed, 0) * s.reps, 0);
}

/** ms between a workout's start and its completion, or null if either is missing. */
export function computeDurationMs(workout) {
  if (!workout.completedAt || !workout.createdAt) return null;
  return Math.max(0, workout.completedAt - workout.createdAt);
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return null;
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function formatTotalWeight(lb) {
  return `${Math.round(lb).toLocaleString()} lb`;
}
