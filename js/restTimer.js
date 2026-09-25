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

/**
 * Which countdown alert (if any) should sound right now. `fired` is the
 * caller's per-timer Set, mutated so each threshold fires at most once.
 *
 * Every threshold already crossed is marked fired, but only the single
 * most urgent one is returned — so a timer noticed late (the tab was
 * throttled or the screen was off) plays one alert instead of a burst of
 * stale ones. Priority: 3-2-1 tick > 30s > 1 minute. The final "done"
 * alert is not handled here (it belongs to the caller's ms <= 0 branch,
 * where the timer's state transition also happens).
 *
 * @returns {"tick"|"warn30"|"warn60"|null}
 */
export function dueCountdownAlert(fired, ms) {
  if (ms <= 0) return null;
  const seconds = Math.ceil(ms / 1000);
  const crossed = [];
  if (seconds <= 3 && !fired.has(`t${seconds}`)) {
    fired.add(`t${seconds}`);
    crossed.push("tick");
  }
  if (ms <= 30000 && !fired.has("t30")) {
    fired.add("t30");
    crossed.push("warn30");
  }
  if (ms <= 60000 && !fired.has("t60")) {
    fired.add("t60");
    crossed.push("warn60");
  }
  return crossed.find((k) => k === "tick") ?? crossed.find((k) => k === "warn30") ?? crossed[0] ?? null;
}
