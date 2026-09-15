// Workout Complete (SPEC.md §6, §5). Evaluates every logged working set
// through progressionEngine.js, shows the summary, and lets the below-
// range / weight-override / ceiling flags get resolved inline. Nothing is
// written to setTargets or progressionEvents until every flagged row has
// a resolution and "Finish workout" is pressed — the workout stays
// `awaitingProgression` until then (§5.1: "status stays awaitingProgression
// until I resolve these, then flips to complete").
//
// All progression rules live in progressionEngine.js — this file is UI
// glue only: build one row per logged set, call the engine, render
// whatever it hands back, and persist whatever the user resolves.

import { el, clear } from "../dom.js";
import { repository } from "../repository.js";
import { navigate } from "../router.js";
import { getLocationLabels, labelFor } from "../locationLabels.js";
import {
  DECISION,
  evaluateLoggedSet,
  manualProgress,
  resolveBelowRange,
  resolveWeightAboveTarget,
  resolveCeilingBlocked,
} from "../progressionEngine.js";

const CEILING_FIELD_BY_CATEGORY = {
  barbell: "barbellCeiling",
  dumbbell: "dumbbellCeiling",
  machine: "machineCeiling",
  cable: "cableCeiling",
};

// Kinds where the engine can't decide on its own — the completion screen
// must present a choice before the workout can finish.
const FLAGGED_KINDS = new Set([
  DECISION.BELOW_RANGE,
  DECISION.WEIGHT_ABOVE_TARGET,
  DECISION.CEILING_BLOCKED,
]);

// The default resolution for decisions the engine already settled on its
// own. Flagged kinds resolve to null — no default, must be chosen.
function autoResolution(decision) {
  switch (decision.kind) {
    case DECISION.PROGRESSED:
      return { newWeight: decision.newWeight, reason: decision.reason };
    case DECISION.HELD:
    case DECISION.WEIGHT_BELOW_TARGET:
      return { newWeight: decision.currentWeight, reason: "held" };
    case DECISION.SUBSTITUTED:
      // No progressionEvent gets written for a substituted slot — a
      // different exercise's performance says nothing about this one.
      return { newWeight: decision.currentWeight, reason: null };
    default:
      return null;
  }
}

export async function renderCompletionScreen(root, workoutId) {
  clear(root);

  const workout = await repository.getWorkout(workoutId);
  if (!workout) {
    root.appendChild(el("p", { text: "Workout not found." }));
    root.appendChild(el("button", { text: "← Home", onclick: () => navigate("/") }));
    return;
  }

  const routine = await repository.getRoutine(workout.routineId);
  const labels = await getLocationLabels();
  root.appendChild(
    el("div", { class: "screen-header" }, [
      el("h1", { text: "Workout complete" }),
      el("span", { class: "badge", text: labelFor(labels, workout.location) }),
    ])
  );
  root.appendChild(
    el("p", { class: "subtitle", text: `${routine?.name ?? "Workout"} — ${workout.date}` })
  );

  const [loggedSets, exercises, plateProfile] = await Promise.all([
    repository.listLoggedSetsForWorkout(workout.id),
    repository.listExercises({ includeArchived: true }),
    repository.getPlateProfileForLocation(workout.location),
  ]);
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));

  if (loggedSets.length === 0) {
    root.appendChild(
      el("section", { class: "card" }, [
        el("p", { class: "muted", text: "Nothing was logged this workout." }),
        el("button", {
          class: "start-button",
          text: "Close out workout →",
          onclick: async () => {
            await repository.updateWorkout(workout.id, { status: "complete", completedAt: Date.now() });
            navigate("/");
          },
        }),
      ])
    );
    return;
  }

  const targetsCache = new Map();
  async function targetsForExercise(exerciseId) {
    if (!targetsCache.has(exerciseId)) {
      targetsCache.set(exerciseId, await repository.listSetTargetsForExercise(exerciseId, workout.location));
    }
    return targetsCache.get(exerciseId);
  }

  // Drops (user feedback) are real reps performed, but never their own
  // progression decision — they're an extension of their parent set, at
  // a weight the lifter chose in the moment, not the prescribed target.
  // Group them by parent so each evaluated row can show its drops.
  const dropsByParentId = new Map();
  for (const loggedSet of loggedSets) {
    if (!loggedSet.dropOf) continue;
    if (!dropsByParentId.has(loggedSet.dropOf)) dropsByParentId.set(loggedSet.dropOf, []);
    dropsByParentId.get(loggedSet.dropOf).push(loggedSet);
  }
  for (const drops of dropsByParentId.values()) {
    drops.sort((a, b) => a.completedAt - b.completedAt);
  }

  const rows = [];
  for (const loggedSet of [...loggedSets].sort((a, b) => a.completedAt - b.completedAt)) {
    if (loggedSet.dropOf) continue; // shown under its parent row instead
    const exercise = exerciseById.get(loggedSet.exerciseId);
    const targets = await targetsForExercise(loggedSet.exerciseId);
    const setTarget = targets.find((t) => t.setNumber === loggedSet.setNumber);
    if (!setTarget) continue; // the slot's target was deleted since logging — nothing to evaluate

    const ceilingField = CEILING_FIELD_BY_CATEGORY[exercise?.equipmentCategory];
    const ceiling = ceilingField ? plateProfile?.[ceilingField] ?? null : null;

    const decision = evaluateLoggedSet(loggedSet, setTarget, { ceiling });
    rows.push({
      loggedSet,
      setTarget,
      exercise,
      ceiling,
      decision,
      resolution: autoResolution(decision),
      drops: dropsByParentId.get(loggedSet.id) ?? [],
    });
  }

  const list = el("div", { class: "list" });
  root.appendChild(list);

  const bulkBar = el("div", { class: "bulk-actions" });
  root.appendChild(bulkBar);

  const finishButton = el("button", { class: "start-button", text: "Finish workout →" });
  root.appendChild(finishButton);

  const rowViews = rows.map((row) => buildRowView(row, refreshAll));

  function refreshAll() {
    for (const view of rowViews) view.refresh();
    renderBulkBar();
    const unresolved = rows.filter((r) => r.resolution === null);
    finishButton.disabled = unresolved.length > 0;
    finishButton.textContent =
      unresolved.length > 0 ? `Resolve ${unresolved.length} flagged set(s) first` : "Finish workout →";
  }

  function renderBulkBar() {
    clear(bulkBar);
    const unresolvedBelowRange = rows.filter(
      (r) => r.decision.kind === DECISION.BELOW_RANGE && r.resolution === null
    );
    if (unresolvedBelowRange.length < 2) return;
    bulkBar.appendChild(el("span", { class: "muted", text: "Apply to all flagged below-range: " }));
    bulkBar.appendChild(
      el("button", {
        class: "secondary-action",
        text: "Deload all",
        onclick: () => {
          for (const row of unresolvedBelowRange) {
            row.resolution = resolveBelowRange(row.decision, "deload");
          }
          refreshAll();
        },
      })
    );
    bulkBar.appendChild(
      el("button", {
        class: "secondary-action",
        text: "Hold all",
        onclick: () => {
          for (const row of unresolvedBelowRange) {
            row.resolution = resolveBelowRange(row.decision, "hold");
          }
          refreshAll();
        },
      })
    );
  }

  for (const view of rowViews) list.appendChild(view.element);
  refreshAll();

  finishButton.addEventListener("click", async () => {
    if (rows.some((r) => r.resolution === null)) return;
    finishButton.disabled = true;
    try {
      await finishWorkout(workout, rows);
      navigate("/");
    } finally {
      finishButton.disabled = false;
    }
  });
}

async function finishWorkout(workout, rows) {
  for (const { loggedSet, setTarget, resolution } of rows) {
    if (!resolution) continue;

    if (resolution.reason) {
      await repository.createProgressionEvent({
        exerciseId: loggedSet.exerciseId,
        location: workout.location,
        setNumber: loggedSet.setNumber,
        oldWeight: setTarget.currentWeight,
        newWeight: resolution.newWeight,
        reason: resolution.reason,
        workoutId: workout.id,
      });
    }

    const changes = { currentWeight: resolution.newWeight };
    if (resolution.newProgressionTriggerReps !== undefined) {
      // repository.updateSetTarget always derives progressionTriggerReps
      // from repRangeHigh — "raising the trigger" now means raising this.
      changes.repRangeHigh = resolution.newProgressionTriggerReps;
    }
    await repository.updateSetTarget(setTarget.id, changes);
  }
  await repository.updateWorkout(workout.id, { status: "complete", completedAt: Date.now() });
}

// Builds one row's DOM once, plus a refresh() that redraws just its
// status/actions area from current row.resolution — never a full-screen
// re-render, which would blow away every other row's in-memory choice
// before Finish is pressed.
function buildRowView(row, onRowChanged) {
  const { loggedSet, exercise, decision, drops } = row;

  const card = el("div", { class: "card row-card completion-row" });
  const info = el("div", {}, [
    el("p", { text: `${exercise?.name ?? "Exercise"} — Set ${loggedSet.setNumber}` }),
    el("p", {
      class: "muted",
      text: loggedSet.wasSubstituted
        ? `Logged as "${loggedSet.substitutedExerciseName}": ${formatWeight(loggedSet.weightUsed)} × ${loggedSet.reps}`
        : `${formatWeight(loggedSet.weightUsed)} × ${loggedSet.reps}`,
    }),
  ]);
  for (const drop of drops ?? []) {
    info.appendChild(
      el("p", { class: "muted drop-line", text: `↳ drop: ${formatWeight(drop.weightUsed)} × ${drop.reps}` })
    );
  }
  card.appendChild(info);

  const status = el("div", { class: "completion-status" });
  card.appendChild(status);

  // Every row gets the same "Override" panel — not just flagged ones
  // (user feedback: "the option to click the review buttons on each set
  // as an override, but ... minimized by default"). It starts expanded
  // only while the row still needs a required choice (BELOW_RANGE /
  // WEIGHT_ABOVE_TARGET / CEILING_BLOCKED with no resolution yet);
  // everywhere else it's collapsed behind a toggle.
  const panel = el("div", { class: "override-panel" });
  const panelToggle = el("button", { class: "link-button" });
  panelToggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    panelToggle.textContent = panel.hidden ? "Override ▸" : "Hide override ▾";
  });

  function refresh() {
    clear(status);
    status.appendChild(el("p", { class: "decision-label", text: decisionLabel(row.decision) }));

    const needsResolution = row.resolution === null;
    if (row.resolution) {
      const trigger = row.resolution.newProgressionTriggerReps;
      status.appendChild(
        el("p", {
          class: "resolution-line",
          text: row.resolution.reason
            ? `→ ${formatWeight(row.resolution.newWeight)}${trigger ? `, trigger raised to ${trigger}` : ""}`
            : "No change",
        })
      );
    }

    clear(panel);
    if (FLAGGED_KINDS.has(decision.kind)) {
      buildFlaggedChoices(row, panel, applyResolution);
    }
    buildGenericOverride(row, panel, applyResolution);

    panel.hidden = !needsResolution;
    panelToggle.textContent = panel.hidden ? "Override ▸" : "Hide override ▾";
    status.appendChild(panelToggle);
    status.appendChild(panel);
  }

  function applyResolution(resolution) {
    row.resolution = resolution;
    onRowChanged();
  }

  refresh();
  return { element: card, refresh };
}

// The specific choice buttons for a flagged decision (§5's below-range /
// weight-override / ceiling flows). "Custom" weight entry isn't
// duplicated here — the generic override panel below covers it.
function buildFlaggedChoices(row, panel, applyResolution) {
  const { decision, setTarget } = row;
  const row1 = el("div", { class: "completion-actions" });
  if (decision.kind === DECISION.BELOW_RANGE) {
    row1.appendChild(choiceButton("Deload", () => applyResolution(resolveBelowRange(decision, "deload"))));
    row1.appendChild(choiceButton("Hold", () => applyResolution(resolveBelowRange(decision, "hold"))));
  } else if (decision.kind === DECISION.WEIGHT_ABOVE_TARGET) {
    row1.appendChild(
      choiceButton(`Adopt ${formatWeight(decision.adoptWeight)}`, () =>
        applyResolution(resolveWeightAboveTarget(decision, "adopt"))
      )
    );
    row1.appendChild(
      choiceButton(`Keep ${formatWeight(decision.keepWeight)}`, () =>
        applyResolution(resolveWeightAboveTarget(decision, "keep"))
      )
    );
  } else if (decision.kind === DECISION.CEILING_BLOCKED) {
    row1.appendChild(
      choiceButton(`Hold at ${formatWeight(decision.ceiling)}`, () =>
        applyResolution(resolveCeilingBlocked(decision, "holdAtCeiling"))
      )
    );
    row1.appendChild(
      el("button", {
        class: "secondary-action",
        text: "Raise rep target",
        onclick: () => {
          const value = prompt("New rep-range-high (= trigger):", String(setTarget.repRangeHigh + 1));
          if (value === null) return;
          const parsed = parseInt(value, 10);
          if (!Number.isFinite(parsed)) return;
          applyResolution(resolveCeilingBlocked(decision, "raiseTrigger", parsed));
        },
      })
    );
    row1.appendChild(
      choiceButton("Swap exercise", () => applyResolution(resolveCeilingBlocked(decision, "swapExercise")))
    );
  }
  panel.appendChild(row1);

  function choiceButton(label, onClick) {
    return el("button", { class: "secondary-action", text: label, onclick: onClick });
  }
}

// Available on every row regardless of decision kind: "Progress anyway"
// (§5 "Manual early progression") and a free-entry custom weight.
function buildGenericOverride(row, panel, applyResolution) {
  const row2 = el("div", { class: "completion-actions" });

  if (row.decision.kind === DECISION.CEILING_BLOCKED) {
    // The ceiling choices above already cover "progress" for this row.
  } else if (row.decision.kind === DECISION.PROGRESSED) {
    // The engine is already progressing this slot — offering "Progress
    // anyway" here would be confusing (user feedback), so the override
    // is the opposite: hold at the current weight instead.
    row2.appendChild(
      el("button", {
        class: "secondary-action",
        text: "Hold anyway",
        onclick: () => applyResolution({ newWeight: row.decision.currentWeight, reason: "held" }),
      })
    );
  } else {
    row2.appendChild(
      el("button", {
        class: "secondary-action",
        text: "Progress anyway",
        onclick: () => {
          const result = manualProgress(row.setTarget, { ceiling: row.ceiling });
          if (result.kind === DECISION.PROGRESSED) {
            applyResolution({ newWeight: result.newWeight, reason: result.reason });
          } else {
            alert(`Can't — would exceed the ${formatWeight(result.ceiling)} ceiling.`);
          }
        },
      })
    );
  }

  // Pre-filled with whatever's currently resolved (not always the
  // original target) — otherwise re-opening the panel after applying a
  // resolution looked like it had silently reverted (user feedback).
  const customInput = el("input", {
    type: "number",
    step: "0.5",
    value: row.resolution ? row.resolution.newWeight : row.setTarget.currentWeight,
    class: "inline-input inline-input-narrow",
  });
  row2.appendChild(customInput);
  row2.appendChild(
    el("button", {
      class: "secondary-action",
      text: "Set custom weight",
      onclick: () => {
        const parsed = parseFloat(customInput.value);
        if (!Number.isFinite(parsed)) return;
        applyResolution({ newWeight: parsed, reason: "manualEdit" });
      },
    })
  );

  panel.appendChild(row2);
}

function decisionLabel(decision) {
  switch (decision.kind) {
    case DECISION.PROGRESSED:
      return `Progressed → ${formatWeight(decision.newWeight)}`;
    case DECISION.HELD:
      return "Held";
    case DECISION.WEIGHT_BELOW_TARGET:
      return "Held — lifted below target";
    case DECISION.WEIGHT_ABOVE_TARGET:
      return "Lifted above target";
    case DECISION.BELOW_RANGE:
      return "Below range";
    case DECISION.CEILING_BLOCKED:
      return "Would exceed equipment ceiling";
    case DECISION.SUBSTITUTED:
      return "Substituted — progression skipped";
    default:
      return decision.kind;
  }
}

function formatWeight(weight) {
  return weight < 0 ? `${Math.abs(weight)} lb assist` : `${weight} lb`;
}
