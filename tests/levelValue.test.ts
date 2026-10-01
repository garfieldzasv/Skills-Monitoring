import { describe, expect, it } from "vitest";
import { compressLevelSamples, evalLevelValue, isValidLevelValue } from "@/core/game/levelValue";

describe("evalLevelValue", () => {
  it("returns constants as-is", () => {
    expect(evalLevelValue(120, 1)).toBe(120);
  });

  it("picks the last breakpoint at or below the level", () => {
    const v = [[1, 120], [88, 90]] as const;
    expect(evalLevelValue(v, 87)).toBe(120);
    expect(evalLevelValue(v, 88)).toBe(90);
    expect(evalLevelValue(v, 100)).toBe(90);
  });
});

describe("compressLevelSamples", () => {
  it("collapses constant samples to a number", () => {
    expect(compressLevelSamples([5, 5, 5])).toBe(5);
  });
  it("keeps only change points", () => {
    expect(compressLevelSamples([1, 1, 2, 2, 3])).toEqual([[1, 1], [3, 2], [5, 3]]);
  });
});

describe("isValidLevelValue", () => {
  it("validates shape and ascending levels", () => {
    expect(isValidLevelValue(3)).toBe(true);
    expect(isValidLevelValue([[1, 2], [50, 3]])).toBe(true);
    expect(isValidLevelValue([[50, 2], [1, 3]])).toBe(false);
    expect(isValidLevelValue([])).toBe(false);
    expect(isValidLevelValue("3")).toBe(false);
  });
});
