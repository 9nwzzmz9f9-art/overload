// One-time data migrations that need to run on the user's own device —
// distinct from seed.js (which only ever populates an empty database).
// Each migration is idempotent and guarded by a flag on appSettings so
// it runs at most once per device, no matter how many times the app
// loads.

import { repository } from "./repository.js";

export async function runMigrations() {
  await migrateTriggerToRepRangeHigh();
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
