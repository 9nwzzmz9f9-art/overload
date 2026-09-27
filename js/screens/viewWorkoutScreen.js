// Read-only view of a past workout (user feedback: "Manage" only offered
// Edit/Delete — sometimes I just want to look back at what I did without
// risking a reopen). No mutation anywhere on this screen; it's the same
// data completionScreen.js shows, minus every action button.

import { el, clear } from "../dom.js";
import { repository } from "../repository.js";
import { navigate } from "../router.js";
import { getLocationLabels, labelFor } from "../locationLabels.js";
import { computeTotalWeightLifted, computeDurationMs, formatDuration, formatTotalWeight } from "../workoutStats.js";

export async function renderViewWorkoutScreen(root, workoutId) {
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
      el("button", { class: "back-link", text: "← Home", onclick: () => navigate("/") }),
      el("span", { class: "badge", text: labelFor(labels, workout.location) }),
    ])
  );
  root.appendChild(
    el("p", { class: "subtitle", text: `${routine?.name ?? "Workout"} — ${workout.date}` })
  );

  const [loggedSets, exercises] = await Promise.all([
    repository.listLoggedSetsForWorkout(workout.id),
    repository.listExercises({ includeArchived: true }),
  ]);
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));

  if (loggedSets.length === 0) {
    root.appendChild(el("section", { class: "card" }, [el("p", { class: "muted", text: "Nothing was logged this workout." })]));
    return;
  }

  const totalWeight = computeTotalWeightLifted(loggedSets);
  const durationText = formatDuration(computeDurationMs(workout));
  root.appendChild(
    el("p", { class: "muted", text: [formatTotalWeight(totalWeight), durationText].filter(Boolean).join(" · ") })
  );

  const dropsByParentId = new Map();
  for (const loggedSet of loggedSets) {
    if (!loggedSet.dropOf) continue;
    if (!dropsByParentId.has(loggedSet.dropOf)) dropsByParentId.set(loggedSet.dropOf, []);
    dropsByParentId.get(loggedSet.dropOf).push(loggedSet);
  }
  for (const drops of dropsByParentId.values()) drops.sort((a, b) => a.completedAt - b.completedAt);

  const list = el("div", { class: "list" });
  for (const loggedSet of [...loggedSets].sort((a, b) => a.completedAt - b.completedAt)) {
    if (loggedSet.dropOf) continue; // shown under its parent below
    const exercise = exerciseById.get(loggedSet.exerciseId);
    const card = el("div", { class: "card row-card" });
    const lines = [
      el("p", { text: `${exercise?.name ?? "Exercise"} — Set ${loggedSet.setNumber}` }),
      el("p", {
        class: "muted",
        text: loggedSet.wasSubstituted
          ? `Logged as "${loggedSet.substitutedExerciseName}": ${formatWeight(loggedSet.weightUsed)} × ${loggedSet.reps}`
          : `${formatWeight(loggedSet.weightUsed)} × ${loggedSet.reps}`,
      }),
    ];
    for (const drop of dropsByParentId.get(loggedSet.id) ?? []) {
      lines.push(
        el("p", { class: "muted drop-line", text: `↳ drop: ${formatWeight(drop.weightUsed)} × ${drop.reps}` })
      );
    }
    card.appendChild(el("div", {}, lines));
    list.appendChild(card);
  }
  root.appendChild(list);
}

function formatWeight(weight) {
  return weight < 0 ? `${Math.abs(weight)} lb assist` : `${weight} lb`;
}
