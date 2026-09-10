// Data export (SPEC.md §7.3). All data lives only in this device's
// IndexedDB — this is the sole backup path. Two formats:
//   - JSON: a complete, lossless dump of every store, timestamped and
//     versioned so a future import can restore it.
//   - CSV: a flat log of every working set (and drop), for spreadsheets.
//
// Pure formatting only — the read goes through repository.dumpAllStores.

import { repository } from "./repository.js";

export async function buildJsonExport() {
  const data = await repository.dumpAllStores();
  return JSON.stringify(
    { format: "overload-export", version: 1, exportedAt: new Date().toISOString(), data },
    null,
    2
  );
}

export async function buildLoggedSetsCsv() {
  const data = await repository.dumpAllStores();
  const workoutById = new Map(data.workouts.map((w) => [w.id, w]));
  const routineById = new Map(data.routines.map((r) => [r.id, r]));
  const exerciseById = new Map(data.exercises.map((e) => [e.id, e]));

  const header = [
    "date",
    "location",
    "routine",
    "exercise",
    "setNumber",
    "weightUsed",
    "reps",
    "isDrop",
    "wasSubstituted",
    "substitutedExerciseName",
    "completedAt",
    "notes",
  ];
  const rows = [header];

  const sorted = [...data.loggedSets].sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
  for (const s of sorted) {
    const workout = workoutById.get(s.workoutId);
    rows.push([
      workout?.date ?? "",
      workout?.location ?? "",
      routineById.get(workout?.routineId)?.name ?? "",
      exerciseById.get(s.exerciseId)?.name ?? "",
      s.setNumber,
      s.weightUsed,
      s.reps,
      s.dropOf ? "yes" : "",
      s.wasSubstituted ? "yes" : "",
      s.substitutedExerciseName ?? "",
      s.completedAt ? new Date(s.completedAt).toISOString() : "",
      s.notes ?? "",
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
