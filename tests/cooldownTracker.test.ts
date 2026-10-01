import { describe, expect, it, vi } from "vitest";
import { CooldownTracker, settledAt, viewAt } from "@/core/cooldown/cooldownTracker";

const S = 1000;

function tracker(recastMs: number, maxCharges = 1, durationMs = 0) {
  const t = new CooldownTracker();
  t.ensure("k", { recastMs, maxCharges, durationMs }, 0);
  return t;
}

describe("single-charge cooldown", () => {
  it("counts down from the cast and becomes ready after recast", () => {
    const t = tracker(60 * S);
    t.use("k", 10 * S);
    expect(viewAt(t.get("k")!, 20 * S)).toMatchObject({ charges: 0, nextReadyAt: 70 * S, cycleStartAt: 10 * S });
    expect(viewAt(t.get("k")!, 70 * S)).toMatchObject({ charges: 1, nextReadyAt: null });
  });

  it("reports the effect duration window", () => {
    const t = tracker(60 * S, 1, 15 * S);
    t.use("k", 0);
    expect(viewAt(t.get("k")!, 14 * S).activeUntil).toBe(15 * S);
    expect(viewAt(t.get("k")!, 15 * S).activeUntil).toBeNull();
  });

  it("restarts the cycle when a cast is seen while we think it is on cooldown", () => {
    const t = tracker(60 * S);
    t.use("k", 0);
    t.use("k", 50 * S);
    expect(viewAt(t.get("k")!, 51 * S).nextReadyAt).toBe(110 * S);
  });
});

describe("charges", () => {
  it("recover one at a time (serially), not in parallel", () => {
    const t = tracker(30 * S, 2);
    t.use("k", 0);
    t.use("k", 1 * S);
    // After one recast only the first charge is back.
    expect(viewAt(t.get("k")!, 30 * S)).toMatchObject({ charges: 1, nextReadyAt: 60 * S });
    expect(viewAt(t.get("k")!, 60 * S)).toMatchObject({ charges: 2, nextReadyAt: null });
  });

  it("settledAt is when all charges are back and the effect is over", () => {
    const t = tracker(30 * S, 2, 40 * S);
    t.use("k", 0);
    t.use("k", 1 * S);
    expect(settledAt(t.get("k")!)).toBe(60 * S); // two serial recoveries outlast the 40 s effect
  });

  it("keeps the running cycle when a charge is used mid-recovery", () => {
    const t = tracker(30 * S, 3);
    t.use("k", 0);
    t.use("k", 10 * S);
    expect(viewAt(t.get("k")!, 10 * S)).toMatchObject({ charges: 1, nextReadyAt: 30 * S });
  });
});

describe("adjust / reset / spec changes", () => {
  it("adjust shortens the recovery in progress", () => {
    const t = tracker(120 * S);
    t.use("k", 0);
    t.adjust("k", 60 * S, 10 * S);
    expect(viewAt(t.get("k")!, 10 * S).nextReadyAt).toBe(60 * S);
  });

  it("resetAll returns everything to full", () => {
    const t = tracker(120 * S, 2, 10 * S);
    t.use("k", 0);
    t.resetAll();
    expect(settledAt(t.get("k")!)).toBe(-Infinity);
    expect(viewAt(t.get("k")!, 1 * S).charges).toBe(2);
  });

  it("ensure with a new recast keeps progress", () => {
    const t = tracker(120 * S);
    t.use("k", 0);
    t.ensure("k", { recastMs: 90 * S, maxCharges: 1, durationMs: 0 }, 10 * S);
    expect(viewAt(t.get("k")!, 10 * S).nextReadyAt).toBe(90 * S);
  });

  it("level up gaining a charge: an idle timer is full at the new maximum", () => {
    const t = tracker(55 * S, 1);
    t.ensure("k", { recastMs: 55 * S, maxCharges: 2, durationMs: 0 }, 20 * S);
    expect(viewAt(t.get("k")!, 20 * S)).toMatchObject({ charges: 2, nextReadyAt: null });
  });

  it("level up gaining a charge: a running timer keeps its recovery", () => {
    const t = tracker(55 * S, 1);
    t.use("k", 0);
    t.ensure("k", { recastMs: 55 * S, maxCharges: 2, durationMs: 0 }, 20 * S);
    expect(viewAt(t.get("k")!, 20 * S)).toMatchObject({ charges: 0, nextReadyAt: 55 * S });
  });

  it("level sync losing a charge keeps at most the new maximum", () => {
    const t = tracker(55 * S, 2);
    t.ensure("k", { recastMs: 55 * S, maxCharges: 1, durationMs: 0 }, 0);
    expect(viewAt(t.get("k")!, 0)).toMatchObject({ charges: 1, nextReadyAt: null });
  });

  it("notifies listeners with new state objects, and removal with undefined", () => {
    const t = tracker(60 * S);
    const listener = vi.fn();
    t.subscribe(listener);
    const before = t.get("k");
    t.use("k", 0);
    expect(listener).toHaveBeenLastCalledWith("k", expect.objectContaining({ charges: 0 }));
    expect(t.get("k")).not.toBe(before);
    t.retain(new Set());
    expect(listener).toHaveBeenLastCalledWith("k", undefined);
  });

  it("ignores skills without a recast", () => {
    const t = tracker(0);
    expect(t.use("k", 0)).toBe(false);
  });
});

describe("effect separate from the timer", () => {
  it("a cast that does not start the effect only spends the timer", () => {
    const t = tracker(120 * S, 1, 20 * S);
    t.use("k", 0, false);
    expect(viewAt(t.get("k")!, 1 * S)).toMatchObject({ charges: 0, nextReadyAt: 120 * S, activeUntil: null });
  });

  it("startEffect starts the countdown without spending a charge", () => {
    const t = tracker(120 * S, 1, 20 * S);
    t.use("k", 0, false);
    t.startEffect("k", 7 * S);
    expect(viewAt(t.get("k")!, 8 * S)).toMatchObject({ charges: 0, nextReadyAt: 120 * S, activeUntil: 27 * S });
    expect(settledAt(t.get("k")!)).toBe(120 * S);
  });
});
