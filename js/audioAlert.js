// Timer alerts (rest timer + cardio warm-up), synthesized with the Web
// Audio API — no asset file, no network, fits the "no third-party
// dependencies" rule same as everything else here.
//
// Why alerts were inconsistent (user feedback, investigated):
//  1. iOS Safari reports an AudioContext as "interrupted" (a phone call,
//     Siri, another app taking audio, backgrounding) — a state distinct
//     from "suspended". The old code only ever resumed a "suspended"
//     context, so once interrupted it stayed silent for good, even after
//     later taps. Every non-"running" state is now resumed, and a
//     context that won't come back is rebuilt.
//  2. A resume() that can't succeed without a user gesture can hang
//     forever; awaiting it queued beeps that then fired late. Resume is
//     now raced against a short timeout.
//  3. iOS mutes plain Web Audio when the ringer/silent switch is on. The
//     Audio Session API (Safari 16.4+) lets a page declare its sound a
//     short "transient" one instead — best-effort, feature-detected.
//  4. Nothing can play while the page isn't running at all (screen locked,
//     app fully backgrounded). The timer still ends correctly on return
//     (it's timestamp-based), but that chime can only sound then.
//
// Each attempt and every context state change is recorded in a small log
// (Settings -> Sound check) so a missed alert can be diagnosed rather than
// guessed at.
//
// Mobile browsers only let an AudioContext produce sound once it's been
// created/resumed from inside a real user-gesture handler. unlockAudio()
// is called from every button tap in the active-workout flow so the
// context is unlocked well before a timer callback (which is NOT a user
// gesture) needs to beep.

// Was 0.2; +50% per user feedback (0.3). Applies to every beep/tick/chime.
const PEAK_GAIN = 0.3;
const RESUME_TIMEOUT_MS = 400;
const LOG_KEY = "overload.audioLog";
const LOG_MAX = 20;

let audioContext = null;

function logEvent(kind, result, detail = "") {
  try {
    const log = getAudioLog();
    log.push({ t: Date.now(), kind, result, state: audioContext?.state ?? "none", detail });
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-LOG_MAX)));
  } catch {
    // Storage unavailable — diagnostics are best-effort.
  }
}

export function getAudioLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getAudioStatus() {
  const standalone =
    (typeof navigator !== "undefined" && navigator.standalone === true) ||
    (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches);
  return {
    supported: Boolean(window.AudioContext || window.webkitAudioContext),
    state: audioContext?.state ?? "not created yet",
    sessionType: navigator.audioSession?.type ?? "unsupported",
    standalone,
  };
}

// Best-effort: ask for a session that plays over the silent switch
// without holding the audio route the way a full "playback" session does.
function applyAudioSession() {
  try {
    if (navigator.audioSession && navigator.audioSession.type !== "transient") {
      navigator.audioSession.type = "transient";
    }
  } catch {
    // Not supported — skip silently.
  }
}

function createContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  ctx.addEventListener("statechange", () => logEvent("state", ctx.state));
  return ctx;
}

function getContext() {
  if (!audioContext) audioContext = createContext();
  return audioContext;
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

async function tryResume(ctx) {
  try {
    await withTimeout(ctx.resume(), RESUME_TIMEOUT_MS);
  } catch {
    // Fall through — the caller checks ctx.state.
  }
}

/** Replaces a context that won't come back (closed, or stuck interrupted). */
function rebuildContext() {
  const old = audioContext;
  audioContext = null;
  try {
    old?.close();
  } catch {
    // Already closed.
  }
  return getContext();
}

/** Call from a real tap: creates the context, revives it, applies the audio session. */
export function unlockAudio() {
  applyAudioSession();
  let ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "closed") ctx = rebuildContext();
  if (ctx && ctx.state !== "running") {
    ctx.resume().catch(() => {});
  }
}

async function ensureRunning() {
  applyAudioSession();
  let ctx = getContext();
  if (!ctx) return null;
  if (ctx.state !== "running") await tryResume(ctx);
  if (ctx.state === "running") return ctx;

  // Interrupted/closed, or a resume that never landed: try a fresh context.
  ctx = rebuildContext();
  if (!ctx) return null;
  await tryResume(ctx);
  return ctx.state === "running" ? ctx : null;
}

// A page coming back to the foreground is the moment iOS is most likely
// to let a previously-interrupted context resume — try, no gesture needed.
if (typeof document !== "undefined") {
  const revive = () => {
    if (document.visibilityState === "hidden") return;
    if (audioContext && audioContext.state !== "running" && audioContext.state !== "closed") {
      audioContext.resume().catch(() => {});
    }
  };
  document.addEventListener("visibilitychange", revive);
  window.addEventListener("pageshow", revive);
}

/** Best-effort — silently does nothing if Web Audio is unavailable or can't be unlocked. */
export async function playBeep({ frequency = 880, durationMs = 180, kind = "beep" } = {}) {
  const ctx = await ensureRunning();
  if (!ctx) {
    logEvent(kind, "blocked", "context not running");
    return false;
  }
  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(PEAK_GAIN, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + durationMs / 1000);
    logEvent(kind, "played");
    return true;
  } catch (err) {
    logEvent(kind, "error", String(err?.message ?? err));
    return false;
  }
}

/** A short, sharp tick — the 3-2-1 countdown (user feedback), distinct from the heads-up beep. */
export function playCountdownTick() {
  return playBeep({ frequency: 660, durationMs: 90, kind: "tick" });
}

/** Two quick beeps — used to distinguish "done" from the heads-up/countdown beeps. */
export function playDoneChime() {
  const first = playBeep({ frequency: 880, durationMs: 150, kind: "done" });
  setTimeout(() => playBeep({ frequency: 1100, durationMs: 220, kind: "done-2" }), 180);
  return first;
}
