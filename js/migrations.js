// One-time data migrations that need to run on the user's own device —
// distinct from seed.js (which only ever populates an empty database).
// Each migration is idempotent and guarded by a flag on appSettings so
// it runs at most once per device, no matter how many times the app
// loads.

import { repository } from "./repository.js";
import { LOCATIONS } from "./constants.js";

export async function runMigrations() {
  await migrateTriggerToRepRangeHigh();
  await migrateSetTargetsToRoutines();
}

// User feedback: the same exercise in two routines (Upper and Push) must
// keep independent weights/progression. Set targets used to be shared per
// (exercise, location); they now carry a routineId. Data-driven rather
// than flag-guarded, so it also fixes up an older backup that's imported
// later: every target lacking a routineId goes to the first routine whose
// blocks use that exercise at that location, and every OTHER such routine
// gets its own copy (starting at the same weight, diverging from there).
// Targets no routine uses are left unassigned (harmless, never read).
async function migrateSetTargetsToRoutines() {
  const legacy = (await repository.listAllSetTargets()).filter((t) => !t.routineId);
  if (legacy.length === 0) return;

  const routines = await repository.listRoutines();
  const blocksByRoutineLocation = new Map();
  for (const routine of routines) {
    for (const location of LOCATIONS) {
      blocksByRoutineLocation.set(
        `${routine.id}:${location}`,
        await repository.listBlocksForRoutine(routine.id, location)
      );
    }
  }

  for (const target of legacy) {
    const owners = routines.filter((routine) =>
      (blocksByRoutineLocation.get(`${routine.id}:${target.location}`) ?? []).some(
        (b) => b.exercise1Id === target.exerciseId || b.exercise2Id === target.exerciseId
      )
    );
    if (owners.length === 0) continue;

    const [first, ...rest] = owners;
    for (const routine of rest) {
      const { id, ...copy } = target;
      await repository.createSetTarget({ ...copy, routineId: routine.id });
    }
    await repository.updateSetTarget(target.id, { routineId: first.id });
  }
}

// User feedback: progressionTriggerReps now always mirrors repRangeHigh
// (repository.createSetTarget/updateSetTarget enforce this going
// forward). This backfills every setTarget that predates that change —
// otherwise it would keep using its old, now-invisible trigger value
// forever, silently out of sync with what the editor displays.
async function migrateTriggerToRepRangeHigh() {
  const settings = await repository.getAppSettings();
  if (settings.triggerMatchesRepRangeHighMigrated) return;

  const allTargets = await repository.listAllSetTargets();
  for (const target of allTargets) {
    if (target.progressionTriggerReps !== target.repRangeHigh) {
      await repository.updateSetTarget(target.id, { repRangeHigh: target.repRangeHigh });
    }
  }

  await repository.updateAppSettings({ triggerMatchesRepRangeHighMigrated: true });
}
