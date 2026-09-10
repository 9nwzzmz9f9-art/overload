// The Active Workout screen (SPEC.md §6) — the screen that matters.
// Walks the flat session plan (sessionPlan.js) one item at a time,
// logging working sets and reminding for warmups, with a rest timer and
// an optional plate calculator. No progression math happens here — §5:
// "Evaluated per logged working set at workout completion" — this screen
// only records what happened; the completion flow (phase 6) evaluates it.

import { el, clear, labeledField } from "../dom.js";
import { repository } from "../repository.js";
import { navigate } from "../router.js";
import { pickExerciseName } from "../exercisePicker.js";
import { findResumeIndex, warmupKey } from "../workoutProgress.js";
import { remainingMs, isResting, formatRemaining } from "../restTimer.js";
import { calculatePlateLoading } from "../plateCalculator.js";
import { unlockAudio, playBeep, playDoneChime } from "../audioAlert.js";

const DEFAULT_STARTING_REPS = 6;
const CARDIO_WARMUP_SECONDS = 5 * 60;

// Countdown interval/listener bookkeeping, shared by the cardio warm-up
// and the rest timer — only one is ever showing at a time (the warm-up
// gates the screen before the plan renders at all), so one pair of
// handles is enough. Each call to renderActiveWorkoutScreen fully
// redraws the screen, so whatever the previous render set up must be
// torn down first or it leaks and keeps firing against a detached view.
let timerIntervalId = null;
let visibilityHandler = null;

function clearTimerWatchers() {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    window.removeEventListener("pageshow", visibilityHandler);
    visibilityHandler = null;
  }
}

export async function renderActiveWorkoutScreen(root, workoutId) {
  clearTimerWatchers();
  clear(root);

  const workout = await repository.getWorkout(workoutId);
  if (!workout) {
    root.appendChild(el("p", { text: "Workout not found." }));
    root.appendChild(el("button", { text: "← Home", onclick: () => navigate("/") }));
    return;
  }

  renderHeader(root, workout);

  if (!workout.cardioWarmupDone) {
    renderCardioWarmup(root, workout);
    return;
  }

  const [plan, loggedSets, exercises, plateProfile] = await Promise.all([
    repository.getSessionPlan(workout.routineId, workout.location),
    repository.listLoggedSetsForWorkout(workout.id),
    repository.listExercises({ includeArchived: true }),
    repository.getPlateProfileForLocation(workout.location),
  ]);
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));

  if (plan.length === 0) {
    // "other" mirrors home's structure (§4) — there's nothing to edit
    // for "other" itself, so send the lifter to Home instead.
    const editLocation = workout.location === "other" ? "home" : workout.location;
    root.appendChild(
      el("section", { class: "card" }, [
        el("p", {
          text:
            workout.location === "other"
              ? "This routine has no exercises configured at Home yet — \"other\" always mirrors Home."
              : "This routine has no exercises configured for this location yet.",
        }),
        el("button", {
          text: "Go to Program Editor",
          onclick: () => navigate(`/routines/${editLocation}`),
        }),
      ])
    );
    return;
  }

  const totalSetsByExercise = new Map();
  for (const item of plan) {
    if (item.kind !== "workingSet") continue;
    totalSetsByExercise.set(
      item.exerciseId,
      Math.max(totalSetsByExercise.get(item.exerciseId) ?? 0, item.setNumber)
    );
  }

  const resumeIndex = findResumeIndex(plan, {
    loggedSets,
    skippedExerciseIds: workout.skippedExerciseIds ?? [],
    skippedSetKeys: workout.skippedSetKeys ?? [],
    deferredSetKeys: workout.deferredSetKeys ?? [],
    completedWarmupKeys: workout.completedWarmupKeys ?? [],
  });

  if (resumeIndex >= plan.length) {
    await handleWorkoutComplete(root, workout);
    return;
  }

  const item = plan[resumeIndex];
  if (item.kind === "warmup") {
    renderWarmupCard(root, workout, item, exerciseById);
  } else if (isResting(workout.restTimerEndsAt)) {
    // Rest takes over the screen (user feedback) — the compact "up next"
    // strip is enough until it's actually time to log, at which point
    // the timer's own completion re-renders into the full card below.
    await renderRestingScreen(root, workout, item, exerciseById, totalSetsByExercise);
  } else {
    await renderWorkingSetCard(root, workout, item, exerciseById, totalSetsByExercise, plateProfile);
  }

  renderFooterActions(root, workout, item);
}

function renderHeader(root, workout) {
  root.appendChild(
    el("div", { class: "screen-header" }, [
      el("button", {
        class: "back-link",
        text: "← Exit",
        onclick: () => {
          if (confirm("Exit workout? Your progress is saved — resume it from Home anytime.")) {
            navigate("/");
          }
        },
      }),
      el("span", { class: "badge", text: workout.location }),
    ])
  );
}

// A 5-minute cardio warm-up offered at the start of every workout (user
// feedback — not part of the original SPEC.md §6). Uses the same
// stored-end-timestamp approach as the rest timer so it survives
// backgrounding, and gates the rest of the screen until started-and-
// finished or explicitly skipped.
function renderCardioWarmup(root, workout) {
  if (!workout.cardioWarmupEndsAt) {
    root.appendChild(
      el("section", { class: "card workout-card" }, [
        el("span", { class: "badge", text: "Warm-up" }),
        el("h1", { text: "5-minute cardio" }),
        el("p", { class: "muted", text: "Get the blood moving before working sets." }),
        el("button", {
          class: "start-button",
          text: "Start 5:00 →",
          onclick: async () => {
            unlockAudio();
            await repository.updateWorkout(workout.id, {
              cardioWarmupEndsAt: Date.now() + CARDIO_WARMUP_SECONDS * 1000,
            });
            renderActiveWorkoutScreen(root, workout.id);
          },
        }),
        el("button", {
          class: "secondary-action",
          text: "Skip",
          onclick: async () => {
            unlockAudio();
            await repository.updateWorkout(workout.id, { cardioWarmupDone: true });
            renderActiveWorkoutScreen(root, workout.id);
          },
        }),
      ])
    );
    return;
  }

  const label = el("p", { class: "rest-countdown" });
  const skipBtn = el("button", { class: "secondary-action", text: "Skip remaining" });
  root.appendChild(
    el("section", { class: "card workout-card" }, [
      el("span", { class: "badge", text: "Warm-up" }),
      el("h1", { text: "Cardio warm-up" }),
      label,
      skipBtn,
    ])
  );

  function tick() {
    const ms = remainingMs(workout.cardioWarmupEndsAt);
    if (ms <= 0) {
      clearTimerWatchers();
      fireTimerAlert("Warm-up complete — on to working sets.", { done: true });
      repository
        .updateWorkout(workout.id, { cardioWarmupDone: true })
        .then(() => renderActiveWorkoutScreen(root, workout.id));
      return;
    }
    label.textContent = formatRemaining(ms);
  }
  tick();
  timerIntervalId = setInterval(tick, 250);
  visibilityHandler = () => tick();
  document.addEventListener("visibilitychange", visibilityHandler);
  window.addEventListener("pageshow", visibilityHandler);

  skipBtn.addEventListener("click", async () => {
    unlockAudio();
    clearTimerWatchers();
    await repository.updateWorkout(workout.id, { cardioWarmupDone: true });
    renderActiveWorkoutScreen(root, workout.id);
  });
}

// Rest takes over as the bulk of the screen (user feedback), with a
// small "up next" strip below it — not the full interactive logging
// card, which reappears on its own once the timer completes.
async function renderRestingScreen(root, workout, item, exerciseById, totalSetsByExercise) {
  const exercise = exerciseById.get(item.exerciseId);
  const setTarget = await repository.getSetTarget(item.setTargetId);
  const totalSets = totalSetsByExercise.get(item.exerciseId) ?? item.setNumber;

  const label = el("p", { class: "rest-countdown-big" });
  const skipBtn = el("button", { class: "secondary-action", text: "Skip rest" });
  root.appendChild(
    el("section", { class: "card rest-dominant" }, [
      el("p", { class: "subtitle", text: "Resting" }),
      label,
      skipBtn,
    ])
  );

  root.appendChild(
    el("section", { class: "card workout-card-compact" }, [
      el("p", { class: "subtitle", text: `Up next — Set ${item.setNumber} of ${totalSets}` }),
      el("p", {
        class: "compact-next-line",
        text: `${exercise?.name ?? "Exercise"} — ${formatWeight(setTarget.currentWeight)}`,
      }),
    ])
  );

  let notifiedThirty = false;

  function tick() {
    const ms = remainingMs(workout.restTimerEndsAt);
    if (ms <= 0) {
      clearTimerWatchers();
      fireTimerAlert("Rest complete — back to it.", { done: true });
      renderActiveWorkoutScreen(root, workout.id);
      return;
    }
    label.textContent = formatRemaining(ms);
    if (!notifiedThirty && ms <= 30000) {
      notifiedThirty = true;
      fireTimerAlert("30 seconds left.");
    }
  }

  tick();
  timerIntervalId = setInterval(tick, 250);

  // §6.1: recompute fresh whenever the tab regains focus rather than
  // trusting a background-suspended interval — this is what makes an
  // already-elapsed rest period get caught immediately on return.
  visibilityHandler = () => tick();
  document.addEventListener("visibilitychange", visibilityHandler);
  window.addEventListener("pageshow", visibilityHandler);

  skipBtn.addEventListener("click", async () => {
    unlockAudio();
    clearTimerWatchers();
    await repository.updateWorkout(workout.id, { restTimerEndsAt: null });
    renderActiveWorkoutScreen(root, workout.id);
  });
}

// Best-effort only, per §6.1 — iOS Safari doesn't implement vibrate, and
// Notification permission may never have been granted, and Web Audio
// stays silent until a user gesture has unlocked it. All three are
// bonuses, never required for a timer to work correctly.
function fireTimerAlert(message, { done = false } = {}) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Overload", { body: message });
    }
  } catch {
    // Notifications unavailable/blocked — skip silently.
  }
  if (navigator.vibrate) {
    try {
      navigator.vibrate(200);
    } catch {
      // Not supported — skip silently.
    }
  }
  if (done) playDoneChime();
  else playBeep();
}

function renderWarmupCard(root, workout, item, exerciseById) {
  const exercise = exerciseById.get(item.exerciseId);
  root.appendChild(
    el("section", { class: "card workout-card" }, [
      el("span", { class: "badge", text: "Warmup" }),
      el("h1", { text: exercise?.name ?? "Warmup" }),
      el("p", {
        class: "muted",
        text: "Not logged, not tracked — just a reminder before working sets.",
      }),
      el("button", {
        class: "start-button",
        text: "Ready →",
        onclick: async () => {
          unlockAudio();
          const key = warmupKey(item);
          await repository.updateWorkout(workout.id, {
            completedWarmupKeys: [...(workout.completedWarmupKeys ?? []), key],
          });
          renderActiveWorkoutScreen(root, workout.id);
        },
      }),
    ])
  );
}

async function renderWorkingSetCard(root, workout, item, exerciseById, totalSetsByExercise, plateProfile) {
  const exercise = exerciseById.get(item.exerciseId);
  const setTarget = await repository.getSetTarget(item.setTargetId);
  const last = await repository.getLastLoggedSetForSlot(
    item.exerciseId,
    item.setNumber,
    workout.location,
    workout.id
  );
  const totalSets = totalSetsByExercise.get(item.exerciseId) ?? item.setNumber;

  const card = el("section", { class: "card workout-card" });
  card.appendChild(el("p", { class: "subtitle", text: `Set ${item.setNumber} of ${totalSets}` }));
  card.appendChild(el("h1", { text: exercise?.name ?? "Exercise" }));
  card.appendChild(
    el("p", {
      class: "target-display",
      text: `${formatWeight(setTarget.currentWeight)} × ${setTarget.repRangeLow}–${setTarget.repRangeHigh}`,
    })
  );
  card.appendChild(
    el("p", {
      class: "muted",
      text: last
        ? `Last: ${formatWeight(last.loggedSet.weightUsed)} × ${last.loggedSet.reps}`
        : "Last: — (first time at this slot)",
    })
  );

  const weightInput = el("input", {
    type: "number",
    step: "0.5",
    value: setTarget.currentWeight,
    class: "big-input",
  });
  card.appendChild(labeledField("Weight used", weightInput));

  // Starts at a flat 6 rather than the slot's repRangeLow (deviates from
  // SPEC.md §6's original "pre-filled with the target's low end" — a
  // deliberate personal-preference override; SPEC.md is updated to match).
  let reps = DEFAULT_STARTING_REPS;
  const repsDisplay = el("span", { class: "stepper-value", text: String(reps) });
  function setReps(next) {
    reps = Math.max(0, next);
    repsDisplay.textContent = String(reps);
  }
  card.appendChild(
    el("div", { class: "field" }, [
      el("span", { class: "field-label", text: "Reps" }),
      el("div", { class: "stepper" }, [
        el("button", { class: "icon-button", text: "−", onclick: () => setReps(reps - 1) }),
        repsDisplay,
        el("button", { class: "icon-button", text: "+", onclick: () => setReps(reps + 1) }),
      ]),
    ])
  );

  // Substitution (§5 "Substitutions"): summons the same search/browse
  // sheet as the Program Editor's exercise picker (my exercises + the
  // library) to pick a name — never creates or links a real exercise
  // record, just annotates the logged set(s).
  //
  // A workout-level swap ("Swap this exercise for today", footer
  // actions) takes priority and applies silently to every remaining set
  // of this exercise — no per-set toggle needed once it's set.
  const workoutSwap = workout.substitutedExercises?.[item.exerciseId] ?? null;
  let substitutedName = workoutSwap;

  if (workoutSwap) {
    card.appendChild(
      el("p", { class: "muted" }, [
        el("span", { text: `Swapped for today: ${workoutSwap}  ` }),
        el("button", {
          class: "link-button",
          text: "Revert",
          onclick: async () => {
            const remaining = { ...(workout.substitutedExercises ?? {}) };
            delete remaining[item.exerciseId];
            await repository.updateWorkout(workout.id, { substitutedExercises: remaining });
            renderActiveWorkoutScreen(root, workout.id);
          },
        }),
      ])
    );
  } else {
    const subLine = el("p", { class: "muted" });
    const subToggle = el("button", { class: "link-button", text: "Log as a different exercise" });
    function refreshSubLine() {
      clear(subLine);
      if (!substitutedName) return;
      subLine.appendChild(el("span", { text: `Substituting: ${substitutedName}  ` }));
      subLine.appendChild(
        el("button", {
          class: "link-button",
          text: "Clear",
          onclick: () => {
            substitutedName = null;
            subToggle.textContent = "Log as a different exercise";
            refreshSubLine();
          },
        })
      );
    }
    subToggle.addEventListener("click", async () => {
      unlockAudio();
      const picked = await pickExerciseName();
      if (picked) {
        substitutedName = picked;
        subToggle.textContent = "Change substitution";
        refreshSubLine();
      }
    });
    card.appendChild(subToggle);
    card.appendChild(subLine);
  }

  // Plate calculator: only meaningful for plate-loaded barbell work, and
  // only when this location has a plate profile to compute against.
  if (exercise?.equipmentCategory === "barbell" && plateProfile) {
    card.appendChild(renderPlateCalculator(plateProfile, weightInput));
  }

  // Finishing the item: start the rest timer (unless a superset's first
  // leg — restAfter:false) and advance to the next plan item.
  async function finishItem() {
    if (item.restAfter) {
      await repository.updateWorkout(workout.id, {
        restTimerEndsAt: Date.now() + setTarget.restSeconds * 1000,
      });
    }
    if (navigator.vibrate) {
      try {
        navigator.vibrate(150);
      } catch {
        // Not supported — skip silently.
      }
    }
    renderActiveWorkoutScreen(root, workout.id);
  }

  let topSet = null; // set once logged, so a drop can link back to it

  const logButton = el("button", { class: "start-button", text: "Log set →" });
  logButton.addEventListener("click", async () => {
    unlockAudio();
    logButton.disabled = true;
    try {
      if (!topSet) topSet = await logCurrentEntry(); // already logged if a drop was started first
      await finishItem();
    } finally {
      logButton.disabled = false;
    }
  });
  card.appendChild(logButton);

  // Drop set (user feedback): log the current entry as the primary set,
  // then immediately drop weight and log again, no rest, as many times
  // as wanted — each drop is its own loggedSet linked via `dropOf` so it
  // shows in history, but is never itself evaluated for progression
  // (completionScreen.js only evaluates dropOf === null rows).
  const dropSection = el("div", { class: "drop-section" });
  dropSection.hidden = true;
  card.appendChild(
    el("button", {
      class: "link-button",
      text: "+ Drop set",
      onclick: async () => {
        unlockAudio();
        if (!topSet) topSet = await logCurrentEntry();
        dropSection.hidden = false;
        renderDropEntry(topSet.weightUsed);
      },
    })
  );
  card.appendChild(dropSection);

  function renderDropEntry(previousWeight) {
    clear(dropSection);
    const dropWeightInput = el("input", {
      type: "number",
      step: "0.5",
      value: previousWeight - setTarget.increment,
      class: "big-input",
    });
    let dropReps = DEFAULT_STARTING_REPS;
    const dropRepsDisplay = el("span", { class: "stepper-value", text: String(dropReps) });
    function setDropReps(next) {
      dropReps = Math.max(0, next);
      dropRepsDisplay.textContent = String(dropReps);
    }

    dropSection.appendChild(labeledField("Drop weight", dropWeightInput));
    dropSection.appendChild(
      el("div", { class: "field" }, [
        el("span", { class: "field-label", text: "Reps" }),
        el("div", { class: "stepper" }, [
          el("button", { class: "icon-button", text: "−", onclick: () => setDropReps(dropReps - 1) }),
          dropRepsDisplay,
          el("button", { class: "icon-button", text: "+", onclick: () => setDropReps(dropReps + 1) }),
        ]),
      ])
    );

    const logDropButton = el("button", { class: "secondary-action", text: "Log this drop" });
    logDropButton.addEventListener("click", async () => {
      unlockAudio();
      logDropButton.disabled = true;
      try {
        const dropWeight = parseFloat(dropWeightInput.value);
        const logged = await repository.createLoggedSet({
          workoutId: workout.id,
          exerciseId: item.exerciseId,
          setNumber: item.setNumber,
          weightUsed: Number.isFinite(dropWeight) ? dropWeight : previousWeight,
          reps: dropReps,
          dropOf: topSet.id,
        });
        renderDropEntry(logged.weightUsed);
      } finally {
        logDropButton.disabled = false;
      }
    });
    dropSection.appendChild(logDropButton);

    dropSection.appendChild(
      el("button", {
        class: "start-button",
        text: "Done — continue →",
        onclick: async () => {
          unlockAudio();
          await finishItem();
        },
      })
    );
  }

  async function logCurrentEntry() {
    const weightUsed = parseFloat(weightInput.value);
    return repository.createLoggedSet({
      workoutId: workout.id,
      exerciseId: item.exerciseId,
      setNumber: item.setNumber,
      weightUsed: Number.isFinite(weightUsed) ? weightUsed : setTarget.currentWeight,
      reps,
      wasSubstituted: substitutedName !== null,
      substitutedExerciseName: substitutedName,
    });
  }

  root.appendChild(card);
}

function renderPlateCalculator(plateProfile, weightInput) {
  const body = el("div", { class: "plate-calc-body" });
  body.hidden = true;
  const toggle = el("button", { class: "link-button", text: "Show plate loading ▸" });

  function renderBreakdown() {
    clear(body);
    const target = parseFloat(weightInput.value);
    if (!Number.isFinite(target)) return;
    const { perSide, exact, remainderPerSide } = calculatePlateLoading(
      target,
      plateProfile.barWeight,
      plateProfile.plateDenominations
    );
    body.appendChild(el("p", { class: "muted", text: `${plateProfile.barWeight} lb bar — per side:` }));
    body.appendChild(
      el("p", {
        class: "plate-breakdown",
        text: perSide.length ? perSide.map((p) => `${p.weight}×${p.count}`).join("  +  ") : "Bar only",
      })
    );
    if (!exact) {
      body.appendChild(
        el("p", { class: "muted", text: `${remainderPerSide} lb/side short with plates on hand` })
      );
    }
  }

  toggle.addEventListener("click", () => {
    body.hidden = !body.hidden;
    toggle.textContent = body.hidden ? "Show plate loading ▸" : "Hide plate loading ▾";
    if (!body.hidden) renderBreakdown();
  });
  weightInput.addEventListener("input", () => {
    if (!body.hidden) renderBreakdown();
  });

  return el("div", { class: "plate-calc" }, [toggle, body]);
}

function renderFooterActions(root, workout, item) {
  const actions = el("div", { class: "workout-footer-actions" });

  if (item.kind === "workingSet") {
    // Distinct from "Skip this set" — do this later resurfaces the set
    // once everything else is done (SPEC.md-adjacent user feedback: "the
    // equipment I need is occupied, I'll come back to it").
    actions.appendChild(
      el("button", {
        class: "danger-link",
        text: "Do this later",
        onclick: async () => {
          const key = `${item.exerciseId}:${item.setNumber}`;
          await repository.updateWorkout(workout.id, {
            deferredSetKeys: [...(workout.deferredSetKeys ?? []), key],
          });
          renderActiveWorkoutScreen(root, workout.id);
        },
      })
    );
    actions.appendChild(
      el("button", {
        class: "danger-link",
        text: "Skip this set",
        onclick: async () => {
          const key = `${item.exerciseId}:${item.setNumber}`;
          await repository.updateWorkout(workout.id, {
            skippedSetKeys: [...(workout.skippedSetKeys ?? []), key],
          });
          renderActiveWorkoutScreen(root, workout.id);
        },
      })
    );
    // Distinct from the per-set "Log as a different exercise" toggle —
    // this applies to every remaining set of this exercise for the rest
    // of the workout without re-prompting each time (user feedback: "a
    // piece of equipment is occupied and I swap out the exercise
    // entirely").
    actions.appendChild(
      el("button", {
        class: "danger-link",
        text: "Swap this exercise for today",
        onclick: async () => {
          unlockAudio();
          const picked = await pickExerciseName();
          if (!picked) return;
          await repository.updateWorkout(workout.id, {
            substitutedExercises: { ...(workout.substitutedExercises ?? {}), [item.exerciseId]: picked },
          });
          renderActiveWorkoutScreen(root, workout.id);
        },
      })
    );
  }

  actions.appendChild(
    el("button", {
      class: "danger-link",
      text: "Skip this exercise for today",
      onclick: async () => {
        if (!confirm("Skip this exercise for the rest of today's workout?")) return;
        await repository.updateWorkout(workout.id, {
          skippedExerciseIds: [...(workout.skippedExerciseIds ?? []), item.exerciseId],
        });
        renderActiveWorkoutScreen(root, workout.id);
      },
    })
  );

  actions.appendChild(
    el("button", {
      class: "danger-link",
      text: "Abandon workout",
      onclick: async () => {
        if (!confirm("Abandon this workout? It's marked abandoned and won't affect your rotation.")) {
          return;
        }
        await repository.updateWorkout(workout.id, { status: "abandoned" });
        navigate("/");
      },
    })
  );

  root.appendChild(actions);
}

async function handleWorkoutComplete(root, workout) {
  if (workout.status === "inProgress") {
    await repository.updateWorkout(workout.id, { status: "awaitingProgression" });
  }
  navigate(`/workout/${workout.id}/complete`);
}

function formatWeight(weight) {
  return weight < 0 ? `${Math.abs(weight)} lb assist` : `${weight} lb`;
}
