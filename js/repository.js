// Domain-level persistence API. UI code calls these functions, never
// db.js directly, and never touches IndexedDB transactions itself.

import { db, newId } from "./db.js";
import { buildSessionPlan } from "./sessionPlan.js";

// "other" (user feedback — a logging-only location, see
// constants.js's LOGGING_LOCATIONS) has no program data of its own: it
// always reads and writes against "home"'s blocks/setTargets/plate
// profile, so a workout logged at "other" always reflects whatever
// Home currently prescribes. Centralized here so every read that's
// keyed by location resolves consistently, no matter which screen calls
// it — listBlocksForRoutine, listSetTargetsForExercise, and
// getPlateProfileForLocation all alias through this.
function resolveDataLocation(location) {
  return location === "other" ? "home" : location;
}

// Every object store, in a stable order — used by the export/import
// round trip (§7.3) so a backup captures and restores the whole database.
const ALL_STORE_NAMES = [
  "exercises",
  "routines",
  "programs",
  "routineBlocks",
  "setTargets",
  "appSettings",
  "scheduledWorkouts",
  "workouts",
  "loggedSets",
  "progressionEvents",
  "plateProfiles",
];

export const repository = {
  // --- exercises ---------------------------------------------------
  async listExercises({ includeArchived = false } = {}) {
    const all = await db.getAll("exercises");
    return includeArchived ? all : all.filter((e) => !e.isArchived);
  },
  async getExercise(id) {
    return db.get("exercises", id);
  },
  async createExercise(exercise) {
    const record = { id: newId(), isArchived: false, notes: "", ...exercise };
    await db.put("exercises", record);
    return record;
  },
  async updateExercise(id, changes) {
    const existing = await db.get("exercises", id);
    if (!existing) throw new Error(`Exercise ${id} not found`);
    const updated = { ...existing, ...changes };
    await db.put("exercises", updated);
    return updated;
  },
  async archiveExercise(id) {
    return repository.updateExercise(id, { isArchived: true });
  },

  // --- routines ------------------------------------------------------
  async listRoutines() {
    const all = await db.getAll("routines");
    return all.sort((a, b) => a.rotationIndex - b.rotationIndex);
  },
  async getRoutine(id) {
    return db.get("routines", id);
  },
  async createRoutine(routine) {
    const record = { id: newId(), ...routine };
    await db.put("routines", record);
    return record;
  },
  async updateRoutine(id, changes) {
    const existing = await db.get("routines", id);
    if (!existing) throw new Error(`Routine ${id} not found`);
    const updated = { ...existing, ...changes };
    await db.put("routines", updated);
    return updated;
  },
  async deleteRoutine(id) {
    const blocks = await db.getAllByIndex("routineBlocks", "routineId", id);
    for (const block of blocks) {
      await repository.deleteRoutineBlock(block.id);
    }
    await db.delete("routines", id);
  },
  async reorderRoutines(orderedIds) {
    for (let i = 0; i < orderedIds.length; i++) {
      await repository.updateRoutine(orderedIds[i], { rotationIndex: i });
    }
  },

  // --- routine blocks --------------------------------------------------
  async listBlocksForRoutine(routineId, location) {
    const dataLocation = resolveDataLocation(location);
    const all = await db.getAllByIndex("routineBlocks", "routineId", routineId);
    return all
      .filter((b) => b.location === dataLocation)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  },
  async getRoutineBlock(id) {
    return db.get("routineBlocks", id);
  },
  async createRoutineBlock(block) {
    const record = { id: newId(), ...block };
    await db.put("routineBlocks", record);
    return record;
  },
  async updateRoutineBlock(id, changes) {
    const existing = await db.get("routineBlocks", id);
    if (!existing) throw new Error(`Block ${id} not found`);
    const updated = { ...existing, ...changes };
    await db.put("routineBlocks", updated);
    return updated;
  },
  // Removing a block only ever affects this (routine, location) pair —
  // it never touches the Exercise record, other locations, or history.
  // No confirmation dialog by design (SPEC.md §6): this is meant to be
  // frictionless when adapting a routine to different equipment.
  async deleteRoutineBlock(id) {
    await db.delete("routineBlocks", id);
  },
  async reorderBlocks(orderedIds) {
    for (let i = 0; i < orderedIds.length; i++) {
      await repository.updateRoutineBlock(orderedIds[i], { orderIndex: i });
    }
  },

  // --- set targets ---------------------------------------------------
  async listSetTargetsForExercise(exerciseId, location) {
    const dataLocation = resolveDataLocation(location);
    const all = await db.getAllByIndex("setTargets", "exerciseId", exerciseId);
    return all
      .filter((t) => t.location === dataLocation)
      .sort((a, b) => a.setNumber - b.setNumber);
  },
  // progressionTriggerReps always mirrors repRangeHigh (user feedback:
  // the independent trigger was confusing and repRangeHigh otherwise did
  // nothing) — enforced centrally here so no caller can drift the two
  // apart. progressionEngine.js still reads `progressionTriggerReps`
  // unchanged; this just guarantees it's always equal to repRangeHigh.
  async createSetTarget(target) {
    const record = { id: newId(), ...target };
    record.progressionTriggerReps = record.repRangeHigh;
    await db.put("setTargets", record);
    return record;
  },
  async updateSetTarget(id, changes) {
    const existing = await db.get("setTargets", id);
    if (!existing) throw new Error(`Set target ${id} not found`);
    const updated = { ...existing, ...changes };
    updated.progressionTriggerReps = updated.repRangeHigh;
    await db.put("setTargets", updated);
    return updated;
  },
  async deleteSetTarget(id) {
    await db.delete("setTargets", id);
  },
  async getSetTarget(id) {
    return db.get("setTargets", id);
  },
  async listAllSetTargets() {
    return db.getAll("setTargets");
  },

  // --- app settings ----------------------------------------------------
  async getAppSettings() {
    const existing = await db.get("appSettings", "default");
    if (existing) return existing;
    const fallback = {
      id: "default",
      defaultProgressionTriggerReps: 10,
      defaultIncrementBarbell: 10,
      defaultIncrementDumbbell: 5,
      defaultIncrementMachine: 5,
      defaultIncrementCable: 5,
      defaultRestSeconds: 180,
      activeProgramId: null,
      // Display-only relabeling of the three real locations (user
      // feedback) — the underlying ids ("home"/"beach"/"florida") never
      // change, so this never touches setTargets/routineBlocks/workouts
      // or any query keyed by location. See locationLabels.js.
      locationNames: { home: "Home", beach: "Beach", florida: "Florida" },
    };
    await db.put("appSettings", fallback);
    return fallback;
  },
  async updateAppSettings(changes) {
    const existing = await repository.getAppSettings();
    const updated = { ...existing, ...changes };
    await db.put("appSettings", updated);
    return updated;
  },

  // --- programs --------------------------------------------------------
  // An ordered grouping of existing routines (user feedback — not in the
  // original spec), e.g. "Winter Bulk" containing Upper/Lower/Push/Pull.
  // A program owns only membership + order (`routineIds`); it never owns
  // or cascades into the routines themselves — deleting a program never
  // deletes a routine, and a routine can belong to more than one program.
  async listPrograms() {
    return db.getAll("programs");
  },
  async getProgram(id) {
    return db.get("programs", id);
  },
  async createProgram(data) {
    const record = { id: newId(), routineIds: [], ...data };
    await db.put("programs", record);
    return record;
  },
  async updateProgram(id, changes) {
    const existing = await db.get("programs", id);
    if (!existing) throw new Error(`Program ${id} not found`);
    const updated = { ...existing, ...changes };
    await db.put("programs", updated);
    return updated;
  },
  // Deletes the program only — its routines are untouched. If it was the
  // active program, clears that setting (rotation falls back to the
  // global routine list, same as before any program existed).
  async deleteProgram(id) {
    await db.delete("programs", id);
    const settings = await repository.getAppSettings();
    if (settings.activeProgramId === id) {
      await repository.updateAppSettings({ activeProgramId: null });
    }
  },
  async addRoutineToProgram(programId, routineId) {
    const program = await repository.getProgram(programId);
    if (!program) throw new Error(`Program ${programId} not found`);
    if (program.routineIds.includes(routineId)) return program;
    return repository.updateProgram(programId, { routineIds: [...program.routineIds, routineId] });
  },
  async removeRoutineFromProgram(programId, routineId) {
    const program = await repository.getProgram(programId);
    if (!program) throw new Error(`Program ${programId} not found`);
    return repository.updateProgram(programId, {
      routineIds: program.routineIds.filter((id) => id !== routineId),
    });
  },
  async reorderProgramRoutines(programId, orderedRoutineIds) {
    return repository.updateProgram(programId, { routineIds: orderedRoutineIds });
  },
  async setActiveProgram(programId) {
    return repository.updateAppSettings({ activeProgramId: programId });
  },
  async getActiveProgram() {
    const settings = await repository.getAppSettings();
    if (!settings.activeProgramId) return null;
    return repository.getProgram(settings.activeProgramId);
  },

  // --- plate profiles --------------------------------------------------
  async listPlateProfiles() {
    return db.getAll("plateProfiles");
  },
  async getPlateProfileForLocation(location) {
    const all = await db.getAllByIndex("plateProfiles", "location", resolveDataLocation(location));
    return all[0] ?? null;
  },
  async createPlateProfile(profile) {
    const record = { id: newId(), ...profile };
    await db.put("plateProfiles", record);
    return record;
  },
  async updatePlateProfile(id, changes) {
    const existing = await db.get("plateProfiles", id);
    if (!existing) throw new Error(`Plate profile ${id} not found`);
    const updated = { ...existing, ...changes };
    await db.put("plateProfiles", updated);
    return updated;
  },

  // Every store, dumped whole — for the data exporter (§7.3). This and
  // replaceAllData are the only sanctioned "whole database" paths.
  async dumpAllStores() {
    const dump = {};
    for (const name of ALL_STORE_NAMES) dump[name] = await db.getAll(name);
    return dump;
  },

  // Wipe every store and repopulate from a dump (the shape dumpAllStores
  // produces) — a full restore, not a merge. Stores absent from the dump
  // are still cleared. The importer confirms with the user first.
  async replaceAllData(dump) {
    for (const name of ALL_STORE_NAMES) {
      await db.clear(name);
      for (const record of dump[name] ?? []) {
        await db.put(name, record);
      }
    }
  },

  // --- progression events ------------------------------------------------
  // Append-only audit log (§4) written by the completion flow once every
  // flagged decision for a workout is resolved. Never written anywhere
  // else — see progressionEngine.js.
  async createProgressionEvent(data) {
    const record = { id: newId(), timestamp: Date.now(), ...data };
    await db.put("progressionEvents", record);
    return record;
  },
  async listProgressionEventsForExercise(exerciseId) {
    const all = await db.getAllByIndex("progressionEvents", "exerciseId", exerciseId);
    return all.sort((a, b) => a.timestamp - b.timestamp);
  },

  // --- higher-level operations -----------------------------------------

  // "Duplicate this routine to <location>" (SPEC.md §6): copies block
  // structure and weights as a starting point. Does not touch the
  // source location or any logged history.
  async duplicateRoutineToLocation(routineId, fromLocation, toLocation) {
    const sourceBlocks = await repository.listBlocksForRoutine(routineId, fromLocation);

    for (const block of sourceBlocks) {
      const newBlock = await repository.createRoutineBlock({
        routineId,
        location: toLocation,
        orderIndex: block.orderIndex,
        blockType: block.blockType,
        exercise1Id: block.exercise1Id,
        exercise2Id: block.exercise2Id,
        hasWarmup1: block.hasWarmup1,
        hasWarmup2: block.hasWarmup2,
      });

      for (const exerciseId of [block.exercise1Id, block.exercise2Id].filter(Boolean)) {
        const sourceTargets = await repository.listSetTargetsForExercise(
          exerciseId,
          fromLocation
        );
        for (const target of sourceTargets) {
          await repository.createSetTarget({
            exerciseId,
            location: toLocation,
            setNumber: target.setNumber,
            currentWeight: target.currentWeight,
            repRangeLow: target.repRangeLow,
            repRangeHigh: target.repRangeHigh, // createSetTarget derives progressionTriggerReps from this
            increment: target.increment,
            restSeconds: target.restSeconds,
          });
        }
      }

      void newBlock;
    }
  },

  async isEmpty() {
    const count = await db.count("routines");
    return count === 0;
  },

  // --- workouts ----------------------------------------------------------
  async createWorkout(data) {
    const record = {
      id: newId(),
      status: "inProgress",
      notes: "",
      // Not in SPEC.md §4's field list, but needed to make the Active
      // Workout screen (§6) resumable and orderable without extra joins:
      // restTimerEndsAt survives backgrounding (§6.1 — a stored target
      // timestamp, never an in-memory counter); skippedExerciseIds,
      // skippedSetKeys, and completedWarmupKeys are this workout's "tap to
      // skip" / warmup-acknowledged state (warmups are never logged as
      // data per §3.4, so there's nowhere else to remember one was
      // shown); createdAt is a stable sort key since `date` alone can't
      // order same-day workouts.
      restTimerEndsAt: null,
      skippedExerciseIds: [],
      skippedSetKeys: [],
      // "Do this later" (user feedback — e.g. the equipment is occupied):
      // unlike a skip, a deferred set resurfaces once everything else in
      // the plan is done. See workoutProgress.js's two-pass findResumeIndex.
      deferredSetKeys: [],
      // "Swap this exercise entirely" (user feedback): unlike the
      // per-set substitution toggle, this applies to every remaining set
      // of that exercise without re-prompting each time. Keyed by
      // exerciseId → substitute name.
      substitutedExercises: {},
      // "Switch with another exercise in this workout" (user feedback):
      // pairs of exercise ids whose remaining sets trade positions — see
      // exerciseSwap.js. Applied in order each render, so re-swapping the
      // same pair cancels out.
      positionSwaps: [],
      completedWarmupKeys: [],
      // A 5-minute cardio warm-up offered at the start of every workout
      // (user feedback, not in the original spec) — same
      // stored-end-timestamp shape as restTimerEndsAt.
      cardioWarmupDone: false,
      cardioWarmupEndsAt: null,
      createdAt: Date.now(),
      ...data,
    };
    await db.put("workouts", record);
    return record;
  },
  async getWorkout(id) {
    return db.get("workouts", id);
  },
  async updateWorkout(id, changes) {
    const existing = await db.get("workouts", id);
    if (!existing) throw new Error(`Workout ${id} not found`);
    const updated = { ...existing, ...changes };
    await db.put("workouts", updated);
    return updated;
  },
  async listRecentWorkouts(limit = 5) {
    const all = await db.getAll("workouts");
    return all.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, limit);
  },
  // Reverts a completed workout's progression writes: each affected
  // slot's weight goes back to what the progressionEvent recorded, and
  // the events themselves are deleted (the one place this repository
  // breaks progressionEvents' otherwise append-only rule — see
  // reopenWorkout). Does NOT undo a rep-trigger raised via the ceiling
  // flow's "raise trigger instead" — the prior trigger value was never
  // part of the audit log, so that edge case has no way back.
  async revertProgressionForWorkout(workout) {
    const events = await db.getAllByIndex("progressionEvents", "workoutId", workout.id);
    for (const event of events) {
      const targets = await repository.listSetTargetsForExercise(event.exerciseId, event.location);
      const target = targets.find((t) => t.setNumber === event.setNumber);
      if (target) {
        await repository.updateSetTarget(target.id, { currentWeight: event.oldWeight });
      }
      await db.delete("progressionEvents", event.id);
    }
  },
  // Undoes a completed workout's progression writes and puts it back
  // into review. Safest for the *most recently* completed workout —
  // reopening an older one after newer workouts have already built on
  // top of it can leave a weight that no longer matches what actually
  // happened since (see isMostRecentCompletedWorkout, used by the UI to
  // warn before calling this).
  async reopenWorkout(workoutId) {
    const workout = await repository.getWorkout(workoutId);
    if (!workout) throw new Error(`Workout ${workoutId} not found`);
    if (workout.status !== "complete") return workout; // nothing to undo
    await repository.revertProgressionForWorkout(workout);
    return repository.updateWorkout(workoutId, { status: "awaitingProgression", completedAt: null });
  },
  async isMostRecentCompletedWorkout(workoutId) {
    const all = await db.getAll("workouts");
    const completed = all
      .filter((w) => w.status === "complete")
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return completed.length > 0 && completed[0].id === workoutId;
  },
  // Permanently removes a workout and its logged sets. If it was already
  // complete, its progression writes are reverted first — same caveats
  // as reopenWorkout.
  async deleteWorkout(workoutId) {
    const workout = await repository.getWorkout(workoutId);
    if (!workout) return;
    if (workout.status === "complete") {
      await repository.revertProgressionForWorkout(workout);
    }
    const logged = await repository.listLoggedSetsForWorkout(workoutId);
    for (const loggedSet of logged) await repository.deleteLoggedSet(loggedSet.id);
    await db.delete("workouts", workoutId);
  },
  // The workout currently being logged or awaiting its progression
  // review, if any — the Home screen (§6) surfaces Resume for this
  // instead of Start.
  async getActiveWorkout() {
    const all = await db.getAll("workouts");
    const active = all.filter((w) => w.status === "inProgress" || w.status === "awaitingProgression");
    active.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return active[0] ?? null;
  },
  // SPEC.md §5.1: the rotation is the single source of truth for what's
  // next, driven by what actually happened (not what was scheduled).
  // "What happened" is the most recent non-abandoned workout; an
  // abandoned one never occurred as far as the rotation is concerned.
  // If a program is active, the rotation walks THAT program's ordered
  // routine list; otherwise it falls back to the global routines list
  // ordered by rotationIndex (unchanged behavior from before programs
  // existed, so anyone who never sets one up sees no difference).
  async getNextRoutineInRotation() {
    const allRoutines = await repository.listRoutines();
    if (allRoutines.length === 0) return null;
    const byId = new Map(allRoutines.map((r) => [r.id, r]));

    const activeProgram = await repository.getActiveProgram();
    const routines =
      activeProgram && activeProgram.routineIds.length > 0
        ? activeProgram.routineIds.map((id) => byId.get(id)).filter(Boolean)
        : allRoutines;
    if (routines.length === 0) return allRoutines[0]; // active program's routines were all deleted

    const allWorkouts = await db.getAll("workouts");
    const counted = allWorkouts
      .filter((w) => w.status !== "abandoned")
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    if (counted.length === 0) return routines[0];

    const lastIndex = routines.findIndex((r) => r.id === counted[0].routineId);
    if (lastIndex === -1) return routines[0]; // last workout's routine isn't in this rotation
    return routines[(lastIndex + 1) % routines.length];
  },

  // --- logged sets ---------------------------------------------------------
  // `dropOf` (user feedback, added post-launch): null for a normal/primary
  // set, or the id of that slot's primary loggedSet for a drop-set
  // extension (immediately reduce weight, no rest, log again). Drops are
  // real reps — they count toward total weight lifted (workoutStats.js) —
  // but they're never evaluated for progression (completionScreen.js
  // only evaluates dropOf === null rows) and never count as "last
  // session's performance" (getLastLoggedSetForSlot below excludes them).
  async createLoggedSet(data) {
    const record = {
      id: newId(),
      wasSubstituted: false,
      substitutedExerciseName: null,
      dropOf: null,
      notes: "",
      completedAt: Date.now(),
      ...data,
    };
    await db.put("loggedSets", record);
    return record;
  },
  async listLoggedSetsForWorkout(workoutId) {
    return db.getAllByIndex("loggedSets", "workoutId", workoutId);
  },
  async deleteLoggedSet(id) {
    await db.delete("loggedSets", id);
  },
  // "What I did on this exact set slot last session" (§6). loggedSets
  // don't carry location directly (§4) — it lives on the workout — so
  // this joins in application code: gather this slot's logs elsewhere,
  // then keep whichever most-recent one belongs to a workout at the same
  // location. Drops are excluded — they're not "the set," just an
  // extension of it.
  async getLastLoggedSetForSlot(exerciseId, setNumber, location, excludeWorkoutId) {
    // "home" and "other" are the same data family (see
    // resolveDataLocation) — a workout at either counts as "last session"
    // for the other, since they always share the same setTargets.
    const family = resolveDataLocation(location);
    const all = await db.getAllByIndex("loggedSets", "exerciseId", exerciseId);
    const candidates = all.filter(
      (s) => s.setNumber === setNumber && s.workoutId !== excludeWorkoutId && !s.dropOf
    );

    let best = null;
    for (const loggedSet of candidates) {
      const workout = await db.get("workouts", loggedSet.workoutId);
      if (!workout || resolveDataLocation(workout.location) !== family) continue;
      if (!best || (workout.createdAt ?? 0) > (best.workout.createdAt ?? 0)) {
        best = { loggedSet, workout };
      }
    }
    return best;
  },

  // The flat, ordered set sequence for one (routine, location) — see
  // sessionPlan.js for the actual interleaving logic (kept free of
  // IndexedDB so it has real unit tests, per SPEC.md §8 phase 3). This is
  // the async shell: fetch everything the pure function needs, then hand
  // it a synchronous lookup.
  async getSessionPlan(routineId, location) {
    const blocks = await repository.listBlocksForRoutine(routineId, location);

    const exerciseIds = new Set();
    for (const block of blocks) {
      if (block.exercise1Id) exerciseIds.add(block.exercise1Id);
      if (block.exercise2Id) exerciseIds.add(block.exercise2Id);
    }

    const targetsByExercise = new Map();
    for (const exerciseId of exerciseIds) {
      targetsByExercise.set(
        exerciseId,
        await repository.listSetTargetsForExercise(exerciseId, location)
      );
    }

    return buildSessionPlan(blocks, (exerciseId) => targetsByExercise.get(exerciseId) ?? []);
  },
};
