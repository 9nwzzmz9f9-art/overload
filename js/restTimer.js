// Rest timer timestamp math (SPEC.md §6.1). Pure functions only — the
// timer's actual state of record lives on the workout record as a target
// end timestamp (`restTimerEndsAt`), never a ticking in-memory counter,
// so it's correct after backgrounding, a tab switch, or a reload: whoever
// re-renders just calls remainingMs(endsAt) again against the current
// clock.

/**
 * @param {number|null} endsAt - epoch ms, or null/undefined when not resting
 * @param {number} [now] - epoch ms, defaults to Date.now()
 */
export function remainingMs(endsAt, now = Date.now()) {
  if (!endsAt) return 0;
  return Math.max(0, endsAt - now);
}

export function isResting(endsAt, now = Date.now()) {
  return remainingMs(endsAt, now) > 0;
}

/** "M:SS", rounding up so the display never flashes 0:00 a tick early. */
export function formatRemaining(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
