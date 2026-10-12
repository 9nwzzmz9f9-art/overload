import { test } from "node:test";
import assert from "node:assert/strict";
import { findPersonalRecords, bestRepsAtWeight } from "../js/records.js";

let n = 0;
const set = (key, weightUsed, reps, completedAt) => ({ id: `s${++n}`, key, weightUsed, reps, completedAt });

test("the first set ever logged for a family is never a PR", () => {
  const a = set("k", 70, 9, 1);
  assert.equal(findPersonalRecords([a]).size, 0);
});

test("more reps at the same weight is a PR; equal or fewer is not", () => {
  const a = set("k", 70, 8, 1), b = set("k", 70, 9, 2), c = set("k", 70, 9, 3), d = set("k", 70, 7, 4);
  const prs = findPersonalRecords([a, b, c, d]);
  assert.deepEqual([...prs], [b.id]);
});

test("a heavier weight than anything before is a PR, even at fewer reps", () => {
  const a = set("k", 65, 10, 1), b = set("k", 70, 5, 2), c = set("k", 65, 10, 3);
  assert.deepEqual([...findPersonalRecords([a, b, c])], [b.id]);
});

test("dropping back to a lighter weight first time is not a PR", () => {
  const a = set("k", 70, 8, 1), b = set("k", 60, 12, 2);
  assert.equal(findPersonalRecords([a, b]).size, 0);
});

test("families are independent: same exercise in two routines", () => {
  const upper1 = set("upper", 70, 8, 1), push1 = set("push", 65, 9, 2);
  const upper2 = set("upper", 70, 9, 3), push2 = set("push", 65, 9, 4);
  const prs = findPersonalRecords([upper1, push1, upper2, push2]);
  assert.deepEqual([...prs], [upper2.id]);
});

test("input order does not matter and a run of equal sets earns one PR", () => {
  const a = set("k", 70, 8, 1), b = set("k", 70, 10, 2), c = set("k", 70, 10, 3);
  assert.deepEqual([...findPersonalRecords([c, a, b])], [b.id]);
});

test("assisted (negative) weights: less assistance counts as heavier", () => {
  const a = set("k", -30, 6, 1), b = set("k", -25, 6, 2);
  assert.deepEqual([...findPersonalRecords([a, b])], [b.id]);
});

test("bestRepsAtWeight returns the most reps at that exact weight, else null", () => {
  const sets = [set("k", 70, 8, 1), set("k", 70, 9, 2), set("k", 65, 12, 3)];
  assert.equal(bestRepsAtWeight(sets, 70), 9);
  assert.equal(bestRepsAtWeight(sets, 75), null);
});
