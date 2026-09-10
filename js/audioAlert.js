// A short local beep for timer alerts (rest timer + cardio warm-up),
// synthesized with the Web Audio API — no asset file, no network, fits
// the "no third-party dependencies" rule same as everything else here.
//
// Mobile browsers only let an AudioContext produce sound once it's been
// created/resumed from inside a real user-gesture handler. unlockAudio()
// is called from every button tap in the active-workout flow so the
// context is already unlocked by the time a timer callback (which is NOT
// a user gesture) needs to beep.

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

/** Best-effort — silently does nothing if Web Audio is unavailable or still locked. */
export function playBeep({ frequency = 880, durationMs = 180 } = {}) {
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") return;
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

/** Two quick beeps — used to distinguish "done" from the single 30s-left beep. */
export function playDoneChime() {
  playBeep({ frequency: 880, durationMs: 150 });
  setTimeout(() => playBeep({ frequency: 1100, durationMs: 220 }), 180);
}
