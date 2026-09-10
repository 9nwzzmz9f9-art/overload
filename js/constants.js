// Locations with their own real structure (blocks/setTargets) — what the
// Program Editor lets you build. "other" (below) is deliberately not
// here: it has no structure of its own.
export const LOCATIONS = ["home", "beach", "florida"];

// Every location Home's "where am I training" picker offers, including
// "other" — a logging-only location with no independent program data of
// its own (user feedback). Starting a workout at "other" always reads
// and writes against "home"'s blocks/setTargets — see
// repository.js's resolveDataLocation.
export const LOGGING_LOCATIONS = [...LOCATIONS, "other"];

export const EQUIPMENT_CATEGORIES = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "weightedBodyweight",
];

// "superset" is structurally identical to "alternatingPair" (two
// exercises, interleaved) but with no rest between the two exercises'
// matched sets — only after the pair. See sessionPlan.js's `restAfter`.
export const BLOCK_TYPES = ["single", "alternatingPair", "superset"];

export const DEFAULT_INCREMENT_BY_CATEGORY = {
  barbell: 10,
  dumbbell: 5,
  weightedBodyweight: 5,
  machine: 5,
  cable: 5,
  bodyweight: 0,
};
