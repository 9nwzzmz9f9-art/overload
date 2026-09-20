// Minimal seed data — see SPEC.md §9. Only runs once, when the database
// is empty. Deliberately seeds NO exercises, blocks or set targets: the
// real program gets entered through the Exercises tab and Program Editor.

import { repository } from "./repository.js";

export async function seedIfNeeded() {
  const empty = await repository.isEmpty();
  if (!empty) return;

  await repository.getAppSettings();

  const homePlates = await repository.createPlateProfile({
    location: "home",
    barWeight: 45,
    dumbbellCeiling: 75,
    barbellCeiling: null,
    machineCeiling: null,
    plateLoadedCeiling: null,
    cableCeiling: null,
    plateDenominations: [
      { weight: 45, count: 2 },
      { weight: 35, count: 2 },
      { weight: 25, count: 2 },
      { weight: 10, count: 2 },
      { weight: 5, count: 2 },
      { weight: 2.5, count: 2 },
    ],
  });

  await repository.createRoutine({ name: "Upper", rotationIndex: 0 });
  await repository.createRoutine({ name: "Lower", rotationIndex: 1 });
  await repository.createRoutine({ name: "Push", rotationIndex: 2 });
  await repository.createRoutine({ name: "Pull", rotationIndex: 3 });

  console.log("Seeded minimal data", { homePlates });
}
