import { describe, expect, it } from "vitest";
import { ADVANCED_JOB_IDS } from "@/core/game/jobs";
import { defaultSettings } from "@/core/settings/schema";
import { loadLayout, loadSettings, saveSettings, type KeyValueStore } from "@/core/settings/storage";
import { exportSettings, importSettings } from "@/core/settings/transfer";
import { validateLayout, validateSettings } from "@/core/settings/validate";

function memoryStore(init: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(init));
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
}

const b64 = (obj: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));

describe("validateSettings", () => {
  it("returns defaults for garbage", () => {
    expect(validateSettings("nope")).toEqual(defaultSettings());
    expect(validateSettings(null)).toEqual(defaultSettings());
  });

  it("repairs fields individually", () => {
    const s = validateSettings({
      watchActions: { 19: [7535, "x", 7535, -1], 99: [1] },
      skillOverrides: { 7405: { recast: [[50, 1], [1, 2]], duration: 15 }, bad: {} },
      partySort: { selfFirst: false, presets: { tank: { roleOrder: ["dps", "bogus"], jobOrder: [21] } } },
    });
    expect(s.watchActions[19]).toEqual([7535]);
    expect(s.watchActions[99]).toEqual([1]); // unknown job kept for later
    expect(s.watchActions[21]).toBeDefined(); // missing jobs get defaults
    expect(s.skillOverrides[7405]).toEqual({ duration: 15 });
    expect(s.partySort.selfFirst).toBe(false);
    expect(s.partySort.presets.tank.roleOrder).toEqual(["dps", "tank", "healer"]);
    expect(s.partySort.presets.tank.jobOrder[0]).toBe(21);
    expect(s.partySort.presets.tank.jobOrder).toHaveLength(ADVANCED_JOB_IDS.length);
  });

  it("keeps an intentionally empty job", () => {
    expect(validateSettings({ watchActions: { 19: [] } }).watchActions[19]).toEqual([]);
  });
});

describe("storage", () => {
  it("round-trips settings and survives corrupted JSON", () => {
    const store = memoryStore();
    const s = defaultSettings();
    s.partySort.selfFirst = false;
    saveSettings(store, s);
    expect(loadSettings(store).partySort.selfFirst).toBe(false);
    expect(loadSettings(memoryStore({ "skills-monitoring:settings": "{oops" }))).toEqual(defaultSettings());
  });

  it("clamps layout values", () => {
    expect(validateLayout({ iconSize: 9999, direction: "rtl" })).toMatchObject({ iconSize: 96, direction: "rtl" });
    expect(loadLayout(memoryStore(), "left").rowPitch).toBe(40);
  });
});

describe("transfer", () => {
  it("round-trips its own format without manual orders", () => {
    const s = defaultSettings();
    s.watchActions[19] = [30];
    s.manualOrders = [{ memberKey: "a", order: ["a"], savedAt: 1 }];
    const current = defaultSettings();
    const imported = importSettings(exportSettings(s), current);
    expect(imported.watchActions[19]).toEqual([30]);
    expect(imported.manualOrders).toEqual([]);
  });

  it("rejects unknown text", () => {
    expect(() => importSettings("not base64 !!", defaultSettings())).toThrow();
    expect(() => importSettings(b64({ hello: "world" }), defaultSettings())).toThrow();
  });
});
