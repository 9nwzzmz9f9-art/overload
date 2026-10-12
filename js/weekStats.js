// Week-at-a-glance math for the Home screen (user feedback). Pure — works
// on 'YYYY-MM-DD' date strings (the format workouts store) so there's no
// timezone drift from Date parsing, and takes plain workout objects.

const DAY_MS = 86400000;

function parse(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function format(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today's date in the device's local timezone as 'YYYY-MM-DD'. */
export function localDateString(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr, days) {
  return format(parse(dateStr) + days * DAY_MS);
}

/** The Monday on or before the given date. */
export function weekStart(dateStr) {
  const dow = new Date(parse(dateStr)).getUTCDay(); // 0 = Sunday
  return addDays(dateStr, -((dow + 6) % 7));
}

const COUNTED = new Set(["complete", "awaitingProgression"]);

/**
 * @param {Array<{id: string, date: string, status: string, routineId: string}>} workouts
 * @param {Map<string, number>} volumeByWorkoutId
 * @param {string} start - a Monday, 'YYYY-MM-DD'
 */
export function summarizeWeek(workouts, volumeByWorkoutId, start) {
  const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(start, i), workouts: [] }));
  let volume = 0;
  let count = 0;
  for (const w of workouts) {
    if (!COUNTED.has(w.status)) continue;
    const day = days.find((d) => d.date === w.date);
    if (!day) continue;
    day.workouts.push(w);
    count++;
    volume += volumeByWorkoutId.get(w.id) ?? 0;
  }
  return { days, count, volume };
}

/** Volume per week for `weeks` weeks ending at (and including) `start`, oldest first. */
export function weeklyVolumes(workouts, volumeByWorkoutId, start, weeks = 6) {
  return Array.from({ length: weeks }, (_, i) => {
    const s = addDays(start, -7 * (weeks - 1 - i));
    return summarizeWeek(workouts, volumeByWorkoutId, s).volume;
  });
}

/** Percent change from previous to current, rounded; null when there is no previous to compare. */
export function percentChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}
