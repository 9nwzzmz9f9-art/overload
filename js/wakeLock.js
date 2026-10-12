// Keeps the screen on during an active workout (user feedback: chimes
// were inconsistent). A web page can't make sound — or run its timer
// callbacks — once the phone locks the screen, so a rest that ends while
// the screen is off can only chime when you wake the phone. Holding a
// screen wake lock while a workout is in progress avoids that.
//
// Best-effort everywhere: unsupported browsers, a denied request, or a
// disabled setting all just fall back to the normal behavior. The lock is
// released automatically by the browser whenever the page is hidden, so
// it's re-requested when the page becomes visible again.

import { repository } from "./repository.js";

let sentinel = null;
let wanted = false;
let acquiring = false;
let lastError = "";

export function wakeLockSupported() {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

/** True only for the live workout screen (#/workout/<id>), not its /complete or /view pages. */
export function isActiveWorkoutHash(hash) {
  return /^#?\/?workout\/[^/]+\/?$/.test(hash);
}

export function getWakeLockStatus() {
  if (!wakeLockSupported()) return "not supported";
  if (sentinel && !sentinel.released) return "holding";
  if (lastError) return `failed (${lastError})`;
  return wanted ? "waiting" : "idle";
}

async function acquire() {
  if (!wanted || !wakeLockSupported() || acquiring) return;
  if (sentinel && !sentinel.released) return;
  if (document.visibilityState !== "visible") return;
  acquiring = true;
  try {
    sentinel = await navigator.wakeLock.request("screen");
    lastError = "";
  } catch (err) {
    sentinel = null;
    lastError = String(err?.name ?? err?.message ?? err);
  } finally {
    acquiring = false;
  }
}

/** Call whenever the active workout screen renders — safe to repeat. */
export async function keepScreenAwake() {
  const settings = await repository.getAppSettings();
  if (settings.keepScreenAwake === false) {
    await releaseScreenAwake();
    return;
  }
  wanted = true;
  await acquire();
}

export async function releaseScreenAwake() {
  wanted = false;
  const held = sentinel;
  sentinel = null;
  try {
    await held?.release();
  } catch {
    // Already released.
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") acquire();
  });
  window.addEventListener("hashchange", () => {
    if (!isActiveWorkoutHash(window.location.hash)) releaseScreenAwake();
  });
}
