import { el, clear } from "../dom.js";
import { repository } from "../repository.js";
import { navigate } from "../router.js";
import { LOGGING_LOCATIONS } from "../constants.js";
import { computeTotalWeightLifted, computeDurationMs, formatDuration, formatTotalWeight } from "../workoutStats.js";
import { getLocationLabels, labelFor } from "../locationLabels.js";

const LAST_LOCATION_KEY = "overload:lastLocation";

// A per-device convenience only (which location tab was picked last) —
// not domain data, so localStorage is fine here even though everything
// else goes through the repository/IndexedDB.
function getStoredLocation() {
  try {
    const stored = localStorage.getItem(LAST_LOCATION_KEY);
    return LOGGING_LOCATIONS.includes(stored) ? stored : LOGGING_LOCATIONS[0];
  } catch {
    return LOGGING_LOCATIONS[0];
  }
}

function storeLocation(location) {
  try {
    localStorage.setItem(LAST_LOCATION_KEY, location);
  } catch {
    // Private browsing / storage disabled — just won't be remembered.
  }
}

export async function renderHomeScreen(root) {
  clear(root);
  root.appendChild(el("h1", { text: "Overload" }));

  const routines = await repository.listRoutines();
  const activeWorkout = await repository.getActiveWorkout();
  const labels = await getLocationLabels();

  if (activeWorkout) {
    root.appendChild(renderResumeCard(activeWorkout, routines, labels));
  } else {
    root.appendChild(await renderStartCard(routines, labels));
  }

  root.appendChild(await renderRecentWorkouts(root, routines, labels));
}

function renderResumeCard(activeWorkout, routines, labels) {
  const routine = routines.find((r) => r.id === activeWorkout.routineId);
  const needsReview = activeWorkout.status === "awaitingProgression";
  const destination = needsReview
    ? `/workout/${activeWorkout.id}/complete`
    : `/workout/${activeWorkout.id}`;
  return el("section", { class: "card resume-card" }, [
    el("h2", { text: needsReview ? "Needs progression review" : "In progress" }),
    el("p", { text: `${routine?.name ?? "Workout"} — ${labelFor(labels, activeWorkout.location)}` }),
    el("button", {
      class: "start-button",
      text: needsReview ? "Review →" : "Resume →",
      onclick: () => navigate(destination),
    }),
  ]);
}

async function renderStartCard(routines, labels) {
  const card = el("section", { class: "card" });

  if (routines.length === 0) {
    card.appendChild(el("p", { class: "muted", text: "No routines yet." }));
    card.appendChild(
      el("button", { text: "Go to Program Editor", onclick: () => navigate("/routines/home") })
    );
    return card;
  }

  const nextRoutine = await repository.getNextRoutineInRotation();
  let selectedLocation = getStoredLocation();

  card.appendChild(el("h2", { text: `Next up: ${nextRoutine?.name ?? "—"}` }));
  card.appendChild(el("p", { class: "subtitle", text: "Location" }));

  const locationRow = el("div", { class: "tabs" });
  function renderLocationTabs() {
    clear(locationRow);
    for (const location of LOGGING_LOCATIONS) {
      locationRow.appendChild(
        el("button", {
          class: `tab${location === selectedLocation ? " tab-active" : ""}`,
          text: labelFor(labels, location),
          onclick: () => {
            selectedLocation = location;
            storeLocation(location);
            renderLocationTabs();
          },
        })
      );
    }
  }
  renderLocationTabs();
  card.appendChild(locationRow);

  const startButton = el("button", { class: "start-button", text: "Start →" });
  startButton.addEventListener("click", async () => {
    startButton.disabled = true;
    try {
      const workout = await repository.createWorkout({
        date: new Date().toISOString().slice(0, 10),
        routineId: nextRoutine.id,
        location: selectedLocation,
      });
      navigate(`/workout/${workout.id}`);
    } finally {
      startButton.disabled = false;
    }
  });
  card.appendChild(startButton);

  return card;
}

async function renderRecentWorkouts(root, routines, labels) {
  const section = el("section");
  section.appendChild(el("h2", { text: "Recent workouts" }));

  const workouts = await repository.listRecentWorkouts(5);
  if (workouts.length === 0) {
    section.appendChild(el("p", { class: "muted", text: "No workouts logged yet." }));
    return section;
  }

  const list = el("div", { class: "list" });
  for (const workout of workouts) {
    list.appendChild(await renderWorkoutRow(root, workout, routines, labels));
  }
  section.appendChild(list);
  return section;
}

// Reopen/Delete live behind a collapsed "Manage" toggle — most workouts
// in this list are just history you're scanning, not something you're
// about to act on (user feedback: keep review-style controls minimized
// by default).
async function renderWorkoutRow(root, workout, routines, labels) {
  const routine = routines.find((r) => r.id === workout.routineId);
  const card = el("div", { class: "card" });

  const meta = [el("p", { class: "muted", text: workout.date })];
  if (workout.status === "complete") {
    const loggedSets = await repository.listLoggedSetsForWorkout(workout.id);
    const totalWeight = computeTotalWeightLifted(loggedSets);
    const durationText = formatDuration(computeDurationMs(workout));
    meta.push(
      el("p", {
        class: "muted",
        text: [formatTotalWeight(totalWeight), durationText].filter(Boolean).join(" · "),
      })
    );
  }

  card.appendChild(
    el("div", { class: "row-card" }, [
      el("div", {}, [
        el("p", { text: `${routine?.name ?? "Workout"} — ${labelFor(labels, workout.location)}` }),
        ...meta,
      ]),
      el("span", { class: "badge", text: statusLabel(workout.status) }),
    ])
  );

  const panel = el("div", { class: "workout-manage-panel" });
  panel.hidden = true;
  const toggle = el("button", { class: "link-button", text: "Manage ▸" });
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.textContent = panel.hidden ? "Manage ▸" : "Manage ▾";
  });

  if (workout.status === "complete" || workout.status === "abandoned") {
    panel.appendChild(
      el("button", {
        class: "secondary-action",
        text: "View workout",
        onclick: () => navigate(`/workout/${workout.id}/view`),
      })
    );
  }
  if (workout.status === "complete") {
    panel.appendChild(
      el("button", {
        class: "secondary-action",
        text: "Edit Workout",
        onclick: async () => {
          const isLatest = await repository.isMostRecentCompletedWorkout(workout.id);
          const warning = isLatest
            ? "Reopen this workout for progression review? Its weight changes are undone until you finish it again."
            : "This isn't your most recently completed workout — reopening it can leave weights that don't match what's happened since. Reopen anyway?";
          if (!confirm(warning)) return;
          await repository.reopenWorkout(workout.id);
          navigate(`/workout/${workout.id}/complete`);
        },
      })
    );
  }
  panel.appendChild(
    el("button", {
      class: "danger-link",
      text: "Delete workout",
      onclick: async () => {
        if (!confirm("Permanently delete this workout and its logged sets? This can't be undone.")) {
          return;
        }
        await repository.deleteWorkout(workout.id);
        renderHomeScreen(root);
      },
    })
  );

  card.appendChild(toggle);
  card.appendChild(panel);
  return card;
}

function statusLabel(status) {
  switch (status) {
    case "inProgress":
      return "In progress";
    case "awaitingProgression":
      return "Needs review";
    case "complete":
      return "Complete";
    case "abandoned":
      return "Abandoned";
    default:
      return status;
  }
}
