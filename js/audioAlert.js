// A short local beep for timer alerts (rest timer + cardio warm-up),
// synthesized with the Web Audio API — no asset file, no network, fits
// the "no third-party dependencies" rule same as everything else here.
//
// Mobile browsers only let an AudioContext produce sound once it's been
// created/resumed from inside a real user-gesture handler. unlockAudio()
// is called from every button tap in the active-workout flow so the
// context is unlocked well before a timer callback (which is NOT a user
// gesture) needs to beep.
//
// Bug fix (user feedback: "chime at the end of timers isn't working"):
// the context can drift back to "suspended" on its own mid-session —
// iOS does this after backgrounding or extended idle — and the original
// code just gave up silently when that happened, since the only
// `resume()` calls were the ones-off unlockAudio() taps. Every play
// attempt now tries to resume first; a `resume()` after the context has
// already been unlocked once doesn't need a fresh user gesture, so this
// recovers on its own.

let audioContext = null;

function getContext() {
  if (!audioContext) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }
  return audioContext;
}

export function unlockAudio() {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

async function ensureRunning() {
  const ctx = getContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return null;
    }
  }
  return ctx.state === "running" ? ctx : null;
}

/** Best-effort — silently does nothing if Web Audio is unavailable or can't be unlocked. */
export async function playBeep({ frequency = 880, durationMs = 180 } = {}) {
  const ctx = await ensureRunning();
  if (!ctx) return;
  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Best-effort only — never let an audio failure break the timer.
  }
}

/** A short, sharp tick — the 3-2-1 countdown (user feedback), distinct from the heads-up beep. */
export function playCountdownTick() {
  playBeep({ frequency: 660, durationMs: 90 });
}

/** Two quick beeps — used to distinguish "done" from the heads-up/countdown beeps. */
export function playDoneChime() {
  playBeep({ frequency: 880, durationMs: 150 });
  setTimeout(() => playBeep({ frequency: 1100, durationMs: 220 }), 180);
}
