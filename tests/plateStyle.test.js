import { test } from "node:test";
import assert from "node:assert/strict";
import { plateStyle, expandPlates } from "../js/plateStyle.js";

test("known plates get distinct colors and heavier plates are taller", () => {
  const weights = [45, 35, 25, 10, 5, 2.5];
  const colors = new Set(weights.map((w) => plateStyle(w).color));
  assert.equal(colors.size, weights.length);
  for (let i = 1; i < weights.length; i++) {
    assert.ok(plateStyle(weights[i - 1]).height > plateStyle(weights[i]).height);
  }
});

test("unknown weights scale by weight and stay in bounds with a neutral color", () => {
  const light = plateStyle(1.25);
  const heavy = plateStyle(100);
  assert.ok(light.height < heavy.height);
  assert.ok(heavy.height <= 104 && light.height >= 34);
  assert.equal(light.color, heavy.color);
});

test("expandPlates repeats each denomination count times, preserving order", () => {
  assert.deepEqual(expandPlates([{ weight: 45, count: 2 }, { weight: 10, count: 1 }]), [45, 45, 10]);
  assert.deepEqual(expandPlates([]), []);
});
