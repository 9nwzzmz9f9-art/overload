const CACHE_NAME = "overload-shell-v15";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/db.js",
  "./js/repository.js",
  "./js/sessionPlan.js",
  "./js/progressionEngine.js",
  "./js/plateCalculator.js",
  "./js/restTimer.js",
  "./js/workoutProgress.js",
  "./js/audioAlert.js",
  "./js/workoutStats.js",
  "./js/migrations.js",
  "./js/dataExporter.js",
  "./js/dataImporter.js",
  "./js/seed.js",
  "./js/router.js",
  "./js/dom.js",
  "./js/constants.js",
  "./js/exerciseLibrary.js",
  "./js/exercisePicker.js",
  "./js/screens/homeScreen.js",
  "./js/screens/programsScreen.js",
  "./js/screens/exercisesScreen.js",
  "./js/screens/routinesScreen.js",
  "./js/screens/blocksScreen.js",
  "./js/screens/blockDetailScreen.js",
  "./js/screens/activeWorkoutScreen.js",
  "./js/screens/completionScreen.js",
  "./js/screens/settingsScreen.js",
  "./js/data/exercise-library.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache.addAll() would otherwise happily reuse the browser's own
      // HTTP cache for a URL already fetched this session — meaning a
      // fresh CACHE_NAME can still end up storing a stale file if that
      // exact URL was requested earlier (e.g. during dev). `cache:
      // "reload"` forces every shell file to actually hit the network.
      cache.addAll(SHELL_FILES.map((url) => new Request(url, { cache: "reload" })))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

// Cache-first for same-origin GET requests, so the app works fully
// offline after the first load. Never fetches cross-origin — this app
// makes no network calls at runtime by design.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
