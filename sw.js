const CACHE_NAME = "overload-shell-v25";

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
  "./js/plateStyle.js",
  "./js/restTimer.js",
  "./js/workoutProgress.js",
  "./js/audioAlert.js",
  "./js/workoutStats.js",
  "./js/migrations.js",
  "./js/dataExporter.js",
  "./js/dataImporter.js",
  "./js/exerciseSwap.js",
  "./js/locationLabels.js",
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

// iOS Safari refuses to fulfill a navigation with a service-worker
// response that carries redirect history — "Response served by service
// worker has redirections." Hosts that redirect a URL we asked for (e.g.
// Cloudflare Pages canonicalizing /index.html -> /) hand fetch() a
// Response with `.redirected === true`, and the Cache API will happily
// store that under whatever key we ask, poisoning it for every future
// request of that URL. Rebuild a plain, non-redirected Response before
// it's ever cached or handed to respondWith() so this can't recur,
// regardless of which URL a host decides to redirect.
async function stripRedirect(response) {
  if (!response.redirected) return response;
  const body = await response.clone().arrayBuffer();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Not cache.addAll(): we need each response in hand to strip a
      // redirect before it's stored. `cache: "reload"` still forces
      // every shell file to actually hit the network rather than
      // reusing the browser's own HTTP cache for an already-fetched URL
      // (which could otherwise re-poison a fresh CACHE_NAME with a
      // stale file, e.g. during dev).
      for (const url of SHELL_FILES) {
        const response = await fetch(new Request(url, { cache: "reload" }));
        await cache.put(url, await stripRedirect(response));
      }
    })
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
    (async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached; // already stripped of redirect history when it was cached

      const response = await fetch(event.request);
      const clean = await stripRedirect(response);
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, clean.clone());
      return clean;
    })()
  );
});
