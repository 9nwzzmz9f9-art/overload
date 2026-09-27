import { seedIfNeeded } from "./seed.js";
import { runMigrations } from "./migrations.js";
import { route, notFound, navigate, startRouter } from "./router.js";
import { el, clear } from "./dom.js";
import { renderHomeScreen } from "./screens/homeScreen.js";
import { renderProgramsScreen } from "./screens/programsScreen.js";
import { renderExercisesScreen } from "./screens/exercisesScreen.js";
import { renderRoutinesScreen } from "./screens/routinesScreen.js";
import { renderBlocksScreen } from "./screens/blocksScreen.js";
import { renderBlockDetailScreen } from "./screens/blockDetailScreen.js";
import { renderActiveWorkoutScreen } from "./screens/activeWorkoutScreen.js";
import { renderCompletionScreen } from "./screens/completionScreen.js";
import { renderViewWorkoutScreen } from "./screens/viewWorkoutScreen.js";
import { renderSettingsScreen } from "./screens/settingsScreen.js";

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (err) {
    console.error("Service worker registration failed", err);
  }
}

function renderShell() {
  const app = document.getElementById("app");
  clear(app);

  const nav = el("nav", { class: "top-nav" }, [
    el("button", { text: "Home", onclick: () => navigate("/") }),
    el("button", { text: "Programs", onclick: () => navigate("/programs") }),
    el("button", { text: "Routines", onclick: () => navigate("/routines/home") }),
    el("button", { text: "Exercises", onclick: () => navigate("/exercises") }),
    el("button", { text: "Settings", onclick: () => navigate("/settings") }),
  ]);
  const screenRoot = el("main", { id: "screen" });

  app.appendChild(nav);
  app.appendChild(screenRoot);
  return screenRoot;
}

function registerRoutes(screenRoot) {
  route("/", () => renderHomeScreen(screenRoot));
  route("/workout/:workoutId", ({ workoutId }) => renderActiveWorkoutScreen(screenRoot, workoutId));
  route("/workout/:workoutId/complete", ({ workoutId }) => renderCompletionScreen(screenRoot, workoutId));
  route("/workout/:workoutId/view", ({ workoutId }) => renderViewWorkoutScreen(screenRoot, workoutId));
  route("/programs", () => renderProgramsScreen(screenRoot));
  route("/settings", () => renderSettingsScreen(screenRoot));
  route("/exercises", () => renderExercisesScreen(screenRoot));
  route("/routines/:location", ({ location }) => renderRoutinesScreen(screenRoot, location));
  route("/routines/:routineId/:location/blocks", ({ routineId, location }) =>
    renderBlocksScreen(screenRoot, routineId, location)
  );
  route("/routines/:routineId/:location/blocks/:blockId", ({ routineId, location, blockId }) =>
    renderBlockDetailScreen(screenRoot, routineId, location, blockId)
  );
  notFound(() => navigate("/"));
}

async function main() {
  await registerServiceWorker();
  await seedIfNeeded();
  await runMigrations();

  const screenRoot = renderShell();
  registerRoutes(screenRoot);
  startRouter();
}

main().catch((err) => {
  console.error(err);
  document.getElementById("app").textContent = `Error: ${err.message}`;
});
