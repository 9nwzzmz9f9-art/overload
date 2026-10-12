import { test } from "node:test";
import assert from "node:assert/strict";
import { isActiveWorkoutHash } from "../js/wakeLock.js";

test("only the live workout screen counts as active", () => {
  assert.equal(isActiveWorkoutHash("#/workout/abc-123"), true);
  assert.equal(isActiveWorkoutHash("#/workout/abc-123/"), true);
  assert.equal(isActiveWorkoutHash("#/workout/abc-123/complete"), false);
  assert.equal(isActiveWorkoutHash("#/workout/abc-123/view"), false);
  assert.equal(isActiveWorkoutHash("#/"), false);
  assert.equal(isActiveWorkoutHash("#/settings"), false);
});
