import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePlateLoading } from "../js/plateCalculator.js";

// Mirrors SPEC.md §9 seed plate profile: 45lb bar, one pair each of
// 45/35/25/10/5/2.5.
const HOME_PLATES = [
  { weight: 45, count: 2 },
  { weight: 35, count: 2 },
  { weight: 25, count: 2 },
  { weight: 10, count: 2 },
  { weight: 5, count: 2 },
  { weight: 2.5, count: 2 },
];

test("bar weight alone needs no plates", () => {
  const result = calculatePlateLoading(45, 45, HOME_PLATES);
  assert.deepEqual(result.perSide, []);
  assert.equal(result.exact, true);
});

test("a simple even load: 135 = 45 bar + 45/side", () => {
  const result = calculatePlateLoading(135, 45, HOME_PLATES);
  assert.deepEqual(result.perSide, [{ weight: 45, count: 1 }]);
  assert.equal(result.exact, true);
});

test("a mixed load greedily combines denominations: 225 = 45 bar + 90/side", () => {
  const result = calculatePlateLoading(225, 45, HOME_PLATES);
  // 90 per side = 45 + 35 + 10, one of each (matches the seed's one pair each).
  assert.deepEqual(result.perSide, [
    { weight: 45, count: 1 },
    { weight: 35, count: 1 },
    { weight: 10, count: 1 },
  ]);
  assert.equal(result.exact, true);
});

test("fractional plates load correctly: 140 = 45 bar + 47.5/side", () => {
  const result = calculatePlateLoading(140, 45, HOME_PLATES);
  // 47.5 per side = 45 + 2.5.
  assert.deepEqual(result.perSide, [
    { weight: 45, count: 1 },
    { weight: 2.5, count: 1 },
  ]);
  assert.equal(result.exact, true);
});

test("only one pair on hand means only one plate of that size per side, even if more is needed", () => {
  // 315 = 45 bar + 135/side. With only one 45 pair, greedy uses the single
  // available 45, then 35+25+10+... to make up the rest, or reports a
  // remainder if it can't.
  const result = calculatePlateLoading(315, 45, HOME_PLATES);
  const usedWeight = result.perSide.reduce((sum, p) => sum + p.weight * p.count, 0);
  assert.ok(usedWeight <= 135);
  // 45 + 35 + 25 + 10 + 5 + 2.5 = 122.5, short of 135 with only these plates.
  assert.equal(result.exact, false);
  assert.ok(result.remainderPerSide > 0);
});

test("a target below the bar's own weight loads nothing rather than throwing", () => {
  const result = calculatePlateLoading(30, 45, HOME_PLATES);
  assert.deepEqual(result.perSide, []);
});

test("plates are listed heaviest-first", () => {
  const result = calculatePlateLoading(225, 45, HOME_PLATES);
  const weights = result.perSide.map((p) => p.weight);
  const sorted = [...weights].sort((a, b) => b - a);
  assert.deepEqual(weights, sorted);
});

test("an odd plate count (unpaired plate) only allows the paired half per side", () => {
  // count: 3 means one full pair (2) plus a spare — only 1 usable per side.
  const result = calculatePlateLoading(100, 45, [{ weight: 25, count: 3 }]);
  assert.deepEqual(result.perSide, [{ weight: 25, count: 1 }]);
  assert.equal(result.remainderPerSide, 2.5);
});
