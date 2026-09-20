// Visual styling for the plate-loading diagram (Active Workout). Pure —
// no DOM — so the sizing/color rules are unit-tested. Colors follow the
// common gym color coding; any weight not in the table still gets a
// sensible size (scaled by weight) and a neutral color.

const KNOWN = {
  45: { color: "#2b6cb0", text: "#ffffff", height: 104, width: 26 },
  35: { color: "#d69e2e", text: "#2a1c00", height: 92, width: 22 },
  25: { color: "#3c9d5b", text: "#ffffff", height: 80, width: 20 },
  10: { color: "#e5e7eb", text: "#333333", height: 62, width: 16 },
  5: { color: "#c0392b", text: "#ffffff", height: 48, width: 14 },
  2.5: { color: "#4b5563", text: "#ffffff", height: 38, width: 12 },
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** @returns {{color: string, text: string, height: number, width: number}} */
export function plateStyle(weight) {
  if (KNOWN[weight]) return KNOWN[weight];
  return {
    color: "#7a7468",
    text: "#ffffff",
    height: Math.round(clamp(34 + weight * 1.6, 34, 104)),
    width: Math.round(clamp(10 + weight * 0.3, 10, 26)),
  };
}

/** Expands [{weight, count}] into one entry per physical plate, in order. */
export function expandPlates(perSide) {
  return perSide.flatMap(({ weight, count }) => Array.from({ length: count }, () => weight));
}
