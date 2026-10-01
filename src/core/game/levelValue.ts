/**
 * A value that may change with character level.
 *
 * Either a constant, or breakpoints `[[minLevel, value], ...]` sorted by level ascending:
 * the value of the last breakpoint whose `minLevel <= level` applies.
 */
export type LevelValue = number | ReadonlyArray<readonly [minLevel: number, value: number]>;

export const MAX_LEVEL = 100;

export function evalLevelValue(value: LevelValue, level: number): number {
  if (typeof value === "number") return value;
  let result = value[0]?.[1] ?? 0;
  for (const [minLevel, v] of value) {
    if (level >= minLevel) result = v;
    else break;
  }
  return result;
}

/** Compresses per-level samples (index 0 = level 1) into the smallest equivalent LevelValue. */
export function compressLevelSamples(samples: readonly number[]): LevelValue {
  const points: Array<[number, number]> = [];
  samples.forEach((v, i) => {
    if (points.length === 0 || points[points.length - 1]![1] !== v) points.push([i + 1, v]);
  });
  if (points.length === 1) return points[0]![1];
  return points;
}

export function isValidLevelValue(value: unknown): value is LevelValue {
  if (typeof value === "number") return Number.isFinite(value);
  if (!Array.isArray(value) || value.length === 0) return false;
  let prev = -Infinity;
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 2) return false;
    const [lv, v] = point as unknown[];
    if (typeof lv !== "number" || typeof v !== "number") return false;
    if (!Number.isFinite(lv) || !Number.isFinite(v) || lv <= prev) return false;
    prev = lv;
  }
  return true;
}
