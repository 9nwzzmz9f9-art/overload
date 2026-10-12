import { el, clear } from "../dom.js";
import { repository } from "../repository.js";
import { navigate } from "../router.js";
import { LOGGING_LOCATIONS } from "../constants.js";
import { computeTotalWeightLifted, computeDurationMs, formatDuration, formatTotalWeight } from "../workoutStats.js";
import { getLocationLabels, labelFor } from "../locationLabels.js";
import { localDateString, addDays, weekStart, summarizeWeek, weeklyVolumes, percentChange } from "../weekStats.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

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

  root.appendChild(await renderWeekCard(routines));
  root.appendChild(await renderRecentWorkouts(root, routines, labels));
}

// "This week": one dot per day trained (marked with the routine's
// initial), total weight moved, change vs last week, and a six-week
// volume trend line.
async function renderWeekCard(routines) {
  const [workouts, volumeByWorkout] = await Promise.all([
    repository.listAllWorkouts(),
    repository.getVolumeByWorkoutId(),
  ]);
  const today = localDateString();
  const start = weekStart(today);
  const week = summarizeWeek(workouts, volumeByWorkout, start);
  const lastWeek = summarizeWeek(workouts, volumeByWorkout, addDays(start, -7));
  const change = percentChange(week.volume, lastWeek.volume);
  const trend = weeklyVolumes(workouts, volumeByWorkout, start, 6);
  const initialById = new Map(routines.map((r) => [r.id, (r.name ?? "?").charAt(0).toUpperCase()]));

  const strip = el("div", { class: "week-strip" });
  week.days.forEach((day, i) => {
    const done = day.workouts.length > 0;
    const classes = ["week-dot"];
    if (done) classes.push("week-dot-done");
    if (day.date === today) classes.push("week-dot-today");
    strip.appendChild(
      el("div", { class: "week-day" }, [
        el("div", {
          class: classes.join(" "),
          text: done ? (initialById.get(day.workouts[0].routineId) ?? "•") : "",
        }),
        el("span", { text: DAY_LETTERS[i] }),
      ])
    );
  });

  const stats = el("div", {}, [
    el("p", { class: "week-big", text: `${week.count} workout${week.count === 1 ? "" : "s"}` }),
    el("p", { class: "muted", text: `${formatTotalWeight(week.volume)} moved` }),
  ]);
  if (change !== null) {
    stats.appendChild(
      el("p", {
        class: change >= 0 ? "week-delta-up" : "week-delta-down",
        text: `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% vs last week`,
      })
    );
  }

  return el("section", { class: "card" }, [
    el("h2", { text: "This week" }),
    strip,
    el("div", { class: "week-stats" }, [stats, renderSparkline(trend)]),
  ]);
}

function renderSparkline(values) {
  const width = 130;
  const height = 46;
  const pad = 6;
  const max = Math.max(...values, 1);
  const step = (width - pad * 2) / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => [pad + i * step, height - pad - (v / max) * (height - pad * 2)]);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Weight moved per week over the last six weeks");
  const line = document.createElementNS(SVG_NS, "polyline");
  line.setAttribute("points", points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "));
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "var(--accent)");
  line.setAttribute("stroke-width", "2.5");
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("stroke-linejoin", "round");
  svg.appendChild(line);
  const [lx, ly] = points[points.length - 1];
  const end = document.createElementNS(SVG_NS, "circle");
  end.setAttribute("cx", lx.toFixed(1));
  end.setAttribute("cy", ly.toFixed(1));
  end.setAttribute("r", "4");
  end.setAttribute("fill", "var(--accent)");
  svg.appendChild(end);
  return svg;
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
            renderPreview();
          },
        })
      );
    }
  }
  renderLocationTabs();
  card.appendChild(locationRow);

  // First few exercises and their weights at the chosen location, so the
  // card says what's actually coming — refreshed when the location changes.
  const preview = el("ul", { class: "next-preview" });
  async function renderPreview() {
    clear(preview);
    if (!nextRoutine) return;
    const plan = await repository.getSessionPlan(nextRoutine.id, selectedLocation);
    const seen = new Set();
    const rows = [];
    for (const item of plan) {
      if (item.kind !== "workingSet" || seen.has(item.exerciseId)) continue;
      seen.add(item.exerciseId);
      rows.push(item);
    }
    if (rows.length === 0) {
      preview.appendChild(el("li", {}, [el("span", { class: "muted", text: "No exercises set up here yet" }), el("span")]));
      return;
    }
    const exercises = await repository.listExercises({ includeArchived: true });
    const nameById = new Map(exercises.map((e) => [e.id, e.name]));
    for (const item of rows.slice(0, 3)) {
      const target = await repository.getSetTarget(item.setTargetId);
      const weight = target.currentWeight < 0 ? `${Math.abs(target.currentWeight)} lb assist` : `${target.currentWeight} lb`;
      preview.appendChild(el("li", {}, [el("span", { text: nameById.get(item.exerciseId) ?? "Exercise" }), el("span", { text: weight })]));
    }
    if (rows.length > 3) {
      preview.appendChild(el("li", {}, [el("span", { class: "muted", text: `+ ${rows.length - 3} more` }), el("span")]));
    }
  }
  card.appendChild(preview);
  renderPreview();

  const startButton = el("button", { class: "start-button", text: "Start →" });
  startButton.addEventListener("click", async () => {
    startButton.disabled = true;
    try {
      const workout = await repository.createWorkout({
        date: localDateString(),
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
  const { prSetIds } = await repository.getPersonalRecords();
  if (workouts.length === 0) {
    section.appendChild(el("p", { class: "muted", text: "No workouts logged yet." }));
    return section;
  }

  const list = el("div", { class: "list" });
  for (const workout of workouts) {
    list.appendChild(await renderWorkoutRow(root, workout, routines, labels, prSetIds));
  }
  section.appendChild(list);
  return section;
}

// Reopen/Delete live behind a collapsed "Manage" toggle — most workouts
// in this list are just history you're scanning, not something you're
// about to act on (user feedback: keep review-style controls minimized
// by default).
async function renderWorkoutRow(root, workout, routines, labels, prSetIds) {
  const routine = routines.find((r) => r.id === workout.routineId);
  const card = el("div", { class: "card" });

  const meta = [el("p", { class: "muted", text: workout.date })];
  let prCount = 0;
  if (workout.status === "complete") {
    const loggedSets = await repository.listLoggedSetsForWorkout(workout.id);
    prCount = loggedSets.filter((s) => prSetIds.has(s.id)).length;
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
      el("div", { class: "badge-stack" }, [
        prCount > 0 ? el("span", { class: "badge badge-pr", text: `${prCount} PR${prCount === 1 ? "" : "s"}` }) : null,
        el("span", { class: "badge", text: statusLabel(workout.status) }),
      ]),
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
