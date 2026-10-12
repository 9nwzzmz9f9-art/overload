// Keeps the screen on during an active workout (user feedback: chimes
// were inconsistent). A web page can't make sound — or run its timer
// callbacks — once the phone locks the screen, so a rest that ends while
// the screen is off can only chime when you wake the phone. Holding a
// screen wake lock while a workout is in progress avoids that.
//
// Two methods, tried in this order:
//  1. The Screen Wake Lock API. The lock is released automatically by the
//     browser whenever the page is hidden, so it's re-requested when the
//     page becomes visible again.
//  2. A tiny silent looping video (the long-standing "NoSleep" trick) —
//     iOS won't let the screen sleep while a video is playing. Used when
//     the API is missing or refused, which is the case in some iOS
//     browsers (user feedback: the API alone didn't work in Brave). It
//     has no audio track, so it never touches the chime's audio or
//     interrupts music. Browsers only allow video.play() from a user tap,
//     so it starts on the first tap of the workout and restarts after the
//     page was backgrounded.
// Both are best-effort: failure of either just means normal screen-lock
// behavior.

import { repository } from "./repository.js";

// 32x32 black H.264 clip, 2s, ~1.7 KB, no audio track.
const NOSLEEP_VIDEO =
  "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANKbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAnV0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAACAAAAAgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHtbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAUABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABmG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAVhzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAACAAIABIAAAASAAAAAAAAAABFExhdmM2My4xLjEwMiBsaWJ4MjY0AAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAe/+EAFmdCwB7ZCWwEQAAAAwBAAAADAoPFi5IBAAVoy4DksgAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAAt0AAAAAAAAABhzdHRzAAAAAAAAAAEAAAAKAAAIAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAKAAAAAQAAADxzdHN6AAAAAAAAAAAAAAAKAAAChAAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACQAAABRzdGNvAAAAAAAAAAEAAAN6AAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2My4xLjEwMgAAAAhmcmVlAAAC5W1kYXQAAAJvBgX//2vcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY1IHIzMjIyIGIzNTYwNWEgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDI1IC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MCByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgxOjB4MTExIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0wIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTAgd2VpZ2h0cD0wIGtleWludD0xMCBrZXlpbnRfbWluPTEgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD0xMCByYz1jcmYgbWJ0cmVlPTEgY3JmPTQwLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAANZYiEBHyYoAAi2yddeAAAAAZBmjgI+WAAAAAGQZpUAj5YAAAABkGaYBHywAAAAAZBmoAR8sAAAAAGQZqgEfLAAAAABkGawBHywAAAAAZBmuAR8sAAAAAGQZsAEPLAAAAABUGbID/L";

let sentinel = null;
let wanted = false;
let acquiring = false;
let lastError = "";
let video = null;
let videoPlaying = false;
let videoError = "";

export function wakeLockSupported() {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

/** True only for the live workout screen (#/workout/<id>), not its /complete or /view pages. */
export function isActiveWorkoutHash(hash) {
  return /^#?\/?workout\/[^/]+\/?$/.test(hash);
}

export function getWakeLockStatus() {
  if (sentinel && !sentinel.released) return "holding (wake lock)";
  if (videoPlaying) return "holding (video fallback)";
  if (!wanted) return "idle";
  const api = wakeLockSupported() ? (lastError ? `wake lock failed: ${lastError}` : "wake lock waiting") : "wake lock unsupported";
  const fallback = videoError ? `video failed: ${videoError}` : "video fallback waits for a tap";
  return `${api}; ${fallback}`;
}

function ensureVideo() {
  if (video) return video;
  video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.muted = true;
  video.loop = true;
  video.setAttribute("aria-hidden", "true");
  video.style.cssText =
    "position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;bottom:0;left:0;";
  video.src = NOSLEEP_VIDEO;
  video.addEventListener("pause", () => {
    videoPlaying = false;
  });
  document.body.appendChild(video);
  return video;
}

// Must run inside (or right after) a user tap on browsers that gate
// autoplay; harmless to call any time.
async function startVideo() {
  if (!wanted || videoPlaying) return;
  if (sentinel && !sentinel.released) return; // the real wake lock already covers it
  if (document.visibilityState !== "visible") return;
  try {
    await ensureVideo().play();
    videoPlaying = true;
    videoError = "";
  } catch (err) {
    videoPlaying = false;
    videoError = String(err?.name ?? err?.message ?? err);
  }
}

function stopVideo() {
  videoPlaying = false;
  try {
    video?.pause();
  } catch {
    // Nothing to stop.
  }
}

async function acquire() {
  if (!wanted || !wakeLockSupported() || acquiring) return;
  if (sentinel && !sentinel.released) return;
  if (document.visibilityState !== "visible") return;
  acquiring = true;
  try {
    sentinel = await navigator.wakeLock.request("screen");
    lastError = "";
    stopVideo(); // the real lock is better; don't run both
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
  await startVideo(); // no-op if the real lock is held; may need a tap
}

export async function releaseScreenAwake() {
  wanted = false;
  stopVideo();
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
    if (document.visibilityState === "visible") acquire().then(startVideo);
  });
  // Browsers gate video.play() on a real tap — the first one on the
  // workout screen (and the first after backgrounding) starts it.
  document.addEventListener("pointerup", () => startVideo(), { capture: true });
  window.addEventListener("hashchange", () => {
    if (!isActiveWorkoutHash(window.location.hash)) releaseScreenAwake();
  });
}
