// Data import / restore (SPEC.md §7.3, the companion to dataExporter.js).
// Takes a JSON file produced by buildJsonExport and replaces the entire
// database with its contents — a restore, not a merge. Merging two
// snapshots of ID-keyed data can't be done safely without conflict
// rules, and "restore my backup" is the actual need.

import { repository } from "./repository.js";
import { runMigrations } from "./migrations.js";

/**
 * Validate and parse an export file. Throws with a readable message if
 * it isn't one. Returns { parsed, counts } where counts is a
 * store→record-count map for the confirmation prompt.
 */
export function parseImport(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (parsed?.format !== "overload-export") {
    throw new Error("That doesn't look like an Overload export file.");
  }
  if (!parsed.data || typeof parsed.data !== "object") {
    throw new Error("The export file has no data in it.");
  }

  const counts = {};
  for (const [store, records] of Object.entries(parsed.data)) {
    if (Array.isArray(records) && records.length > 0) counts[store] = records.length;
  }
  return { parsed, counts };
}

/** Human-readable one-liner of what an import would bring in. */
export function describeCounts(counts) {
  const parts = Object.entries(counts).map(([store, n]) => `${n} ${store}`);
  return parts.length ? parts.join(", ") : "nothing";
}

export async function importReplacingAll(jsonText) {
  const { parsed } = parseImport(jsonText);
  await repository.replaceAllData(parsed.data);
  // Older backups predate per-routine set targets — bring them forward.
  await runMigrations();
  return parsed;
}
