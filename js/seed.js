// Minimal seed data — see SPEC.md §9. Only runs once, when the database
// is empty. The real program gets entered through the Program Editor.

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

  const upper = await repository.createRoutine({ name: "Upper", rotationIndex: 0 });
  await repository.createRoutine({ name: "Lower", rotationIndex: 1 });
  await repository.createRoutine({ name: "Push", rotationIndex: 2 });
  await repository.createRoutine({ name: "Pull", rotationIndex: 3 });

  const bench = await repository.createExercise({
    name: "Incline DB Bench Press",
    equipmentCategory: "dumbbell",
    defaultIncrement: 5,
    notes: "",
  });
  const row = await repository.createExercise({
    name: "Seated Cable Row",
    equipmentCategory: "cable",
    defaultIncrement: 5,
    notes: "",
  });
  const pullup = await repository.createExercise({
    name: "Weighted Pull-up",
    equipmentCategory: "weightedBodyweight",
    defaultIncrement: 5,
    notes: "",
  });

  await repository.createRoutineBlock({
    routineId: upper.id,
    location: "home",
    orderIndex: 0,
    blockType: "alternatingPair",
    exercise1Id: bench.id,
    exercise2Id: row.id,
    hasWarmup1: true,
    hasWarmup2: true,
  });

  await repository.createRoutineBlock({
    routineId: upper.id,
    location: "home",
    orderIndex: 1,
    blockType: "single",
    exercise1Id: pullup.id,
    exercise2Id: null,
    hasWarmup1: false,
    hasWarmup2: false,
  });

  // Low-rep range (4-6). progressionTriggerReps is derived from
  // repRangeHigh by repository.createSetTarget — no need to set it here.
  for (const [setNumber, currentWeight] of [[1, 70], [2, 65], [3, 60]]) {
    await repository.createSetTarget({
      exerciseId: bench.id,
      location: "home",
      setNumber,
      currentWeight,
      repRangeLow: 4,
      repRangeHigh: 6,
      increment: 5,
      restSeconds: 90,
    });
  }

  // High-rep range (6-10).
  for (const [setNumber, currentWeight] of [[1, 120], [2, 110], [3, 100]]) {
    await repository.createSetTarget({
      exerciseId: row.id,
      location: "home",
      setNumber,
      currentWeight,
      repRangeLow: 6,
      repRangeHigh: 10,
      increment: 5,
      restSeconds: 90,
    });
  }

  // Negative starting weight proves assistance handling.
  for (const [setNumber, currentWeight] of [[1, -25], [2, -30]]) {
    await repository.createSetTarget({
      exerciseId: pullup.id,
      location: "home",
      setNumber,
      currentWeight,
      repRangeLow: 4,
      repRangeHigh: 6,
      increment: 5,
      restSeconds: 120,
    });
  }

  console.log("Seeded minimal data", { upper, homePlates });
}
