import { describe, expect, it } from "vitest";
import { viewAt } from "@/core/cooldown/cooldownTracker";
import { cooldownKey, MonitorEngine } from "@/core/engine/monitorEngine";
import { recastKey } from "@/core/game/upgrades";
import type { GameEventConsumer } from "@/core/gauges/types";
import { defaultSettings } from "@/core/settings/schema";

function ability(source: string, actionId: number, type: "21" | "22" = "21", targetIndex = "0") {
  const line = Array.from({ length: 48 }, () => "");
  line[0] = type;
  line[2] = source;
  line[4] = actionId.toString(16).toUpperCase();
  line[45] = targetIndex;
  return line;
}

const stateOf = (engine: MonitorEngine, ownerId: string, actionId: number) =>
  engine.cooldowns.get(cooldownKey(ownerId, recastKey(actionId)!));

function setup() {
  let now = 0;
  const engine = new MonitorEngine(defaultSettings(), { now: () => now });
  engine.setSelf("10000001");
  engine.setParty([
    { id: "10000001", name: "Me", job: 23, level: 100 }, // BRD
    { id: "10000002", name: "Tank", job: 19, level: 100 }, // PLD
    { id: "10000003", name: "Blu", job: 36, level: 80 }, // unsupported job
  ]);
  return { engine, advance: (ms: number) => (now += ms), at: () => now };
}

describe("MonitorEngine", () => {
  it("builds rows in party order with slots from settings", () => {
    const { engine } = setup();
    const rows = engine.getRows();
    expect(rows.map((r) => r.member.id)).toEqual(["10000001", "10000002", "10000003"]);
    expect(rows[0]!.slots.map((s) => s.skill?.actionId)).toEqual([7405, 118, 25785]);
    expect(rows[2]!.job).toBeUndefined();
    expect(rows[2]!.slots).toEqual([]);
  });

  it("starts a cooldown from an ability line of a party member", () => {
    const { engine, at } = setup();
    engine.handleLogLine(ability("10000002", 7535)); // 雪仇
    const state = stateOf(engine, "10000002", 7535)!;
    expect(viewAt(state, at()).nextReadyAt).toBe(60_000);
  });

  it("ignores non-members, other targets of AOE lines and unwatched actions", () => {
    const { engine } = setup();
    engine.handleLogLine(ability("10009999", 7535));
    engine.handleLogLine(ability("10000002", 7535, "22", "1"));
    engine.handleLogLine(ability("10000002", 9)); // 先锋剑 is not watched
    expect(stateOf(engine, "10000002", 7535)!.lastUsedAt).toBeNull();
  });

  it("resets on wipe", () => {
    const { engine, advance, at } = setup();
    engine.handleLogLine(ability("10000002", 7535));
    advance(1000);
    engine.handleLogLine(["33", "t", "8003", "4000000F"]);
    expect(viewAt(stateOf(engine, "10000002", 7535)!, at()).nextReadyAt).toBeNull();
  });

  it("keeps cooldown progress across re-sorts and drops members who leave", () => {
    const { engine } = setup();
    engine.handleLogLine(ability("10000002", 7535));
    engine.setSelf("10000002");
    expect(stateOf(engine, "10000002", 7535)!.lastUsedAt).toBe(0);
    engine.setParty([{ id: "10000001", name: "Me", job: 23, level: 100 }]);
    expect(stateOf(engine, "10000002", 7535)).toBeUndefined();
  });

  it("hides slots a level-synced member has not learned", () => {
    const { engine } = setup();
    engine.setParty([{ id: "10000002", name: "Tank", job: 19, level: 50 }]);
    const slots = engine.getRows()[0]!.slots;
    expect(slots).toHaveLength(4); // positions kept
    expect(slots.map((s) => s.skill?.actionId)).toEqual([7535, undefined, undefined, 30]);
  });

  it("works solo: OverlayPlugin sends a one-member party", () => {
    const { engine, at } = setup();
    engine.setParty([{ id: "10000001", name: "Me", job: 24, level: 100 }]);
    expect(engine.getRows().map((r) => r.member.id)).toEqual(["10000001"]);
    engine.handleLogLine(ability("10000001", 16536)); // 节制
    expect(viewAt(stateOf(engine, "10000001", 16536)!, at()).nextReadyAt).toBe(120_000);
  });

  it("routes parsed events only to consumers that asked for them", () => {
    const { engine } = setup();
    const seen: string[] = [];
    let adjusted = false;
    const consumer: GameEventConsumer = {
      eventTypes: new Set(["death"]),
      onEvent: (e, ctx) => {
        seen.push(e.type);
        ctx.adjustCooldown("10000002", 7535, 1);
        adjusted = true;
      },
      reset: () => {},
    };
    engine.addConsumer(consumer);
    engine.handleLogLine(ability("10000002", 7535));
    engine.handleLogLine(["25", "t", "10000002"]);
    expect(seen).toEqual(["death"]);
    expect(adjusted).toBe(true);
  });

  it("charge skills: later casts spend a charge without restarting the recovery", () => {
    const { engine, advance, at } = setup();
    const settings = defaultSettings();
    settings.watchActions[35] = [7518]; // 促进: 2 charges from Lv88 (Enhanced Acceleration)
    engine.setSettings(settings);
    engine.setParty([{ id: "10000004", name: "Rdm", job: 35, level: 100 }]);
    expect(engine.getRows()[0]!.slots[0]!.skill?.maxCharges).toBe(2);
    engine.handleLogLine(ability("10000004", 7518));
    advance(10_000);
    engine.handleLogLine(ability("10000004", 7518));
    expect(viewAt(stateOf(engine, "10000004", 7518)!, at())).toMatchObject({ charges: 0, nextReadyAt: 55_000 });

    // Below Lv88 it has a single charge.
    engine.setParty([{ id: "10000005", name: "Rdm80", job: 35, level: 80 }]);
    expect(engine.getRows()[0]!.slots[0]!.skill?.maxCharges).toBe(1);
  });

  it("actions sharing a recast timer share one cooldown", () => {
    const { engine, at } = setup();
    const settings = defaultSettings();
    settings.watchActions[23] = [110, 117]; // 失血箭 (→ 碎心箭) and 死亡箭雨
    engine.setSettings(settings);
    const [a, b] = engine.getRows()[0]!.slots;
    expect(a!.skill?.actionId).toBe(36975); // upgraded tier at Lv100
    expect(a!.key).toBe(b!.key);
    engine.handleLogLine(ability("10000001", 117));
    expect(viewAt(engine.cooldowns.get(a!.key!)!, at()).charges).toBe(2);
  });

  it("level up gaining a charge: idle → full at once; running → recovery kept", () => {
    const { engine, advance, at } = setup();
    const settings = defaultSettings();
    settings.watchActions[35] = [7518]; // 促进: 2 charges from Lv88
    engine.setSettings(settings);
    engine.setParty([
      { id: "10000004", name: "Idle", job: 35, level: 87 },
      { id: "10000005", name: "Busy", job: 35, level: 87 },
    ]);
    engine.handleLogLine(ability("10000005", 7518));
    advance(20_000);
    engine.setParty([
      { id: "10000004", name: "Idle", job: 35, level: 88 },
      { id: "10000005", name: "Busy", job: 35, level: 88 },
    ]);
    expect(viewAt(stateOf(engine, "10000004", 7518)!, at())).toMatchObject({ charges: 2, nextReadyAt: null });
    expect(viewAt(stateOf(engine, "10000005", 7518)!, at())).toMatchObject({ charges: 0, nextReadyAt: 55_000 });
  });

  it("a stand-in's slot: the timer starts with the replaced action, the effect with the stand-in", () => {
    const { engine, advance, at } = setup();
    engine.setParty([{ id: "10000006", name: "Dnc", job: 38, level: 100 }]); // default slot 四色技巧舞步结束
    const slot = engine.getRows()[0]!.slots[1]!;
    expect(slot.skill).toMatchObject({ actionId: 16196, recastMs: 120_000, durationMs: 20_000 });
    const state = () => viewAt(engine.cooldowns.get(slot.key!)!, at());

    engine.handleLogLine(ability("10000006", 15998)); // 技巧舞步: timer starts, no buff yet
    expect(state()).toMatchObject({ charges: 0, nextReadyAt: 120_000, activeUntil: null });
    advance(7_000);
    engine.handleLogLine(ability("10000006", 16196)); // 四色技巧舞步结束: buff starts, timer untouched
    expect(state()).toMatchObject({ charges: 0, nextReadyAt: 120_000, activeUntil: 27_000 });
    advance(10_000);
    engine.handleLogLine(ability("10000006", 25790)); // 提拉纳: no effect of its own
    expect(state()).toMatchObject({ nextReadyAt: 120_000, activeUntil: 27_000 });

    advance(120_000);
    engine.handleLogLine(ability("10000006", 15998));
    advance(7_000);
    engine.handleLogLine(ability("10000006", 16193)); // a one-step finish is the same buff
    expect(state()).toMatchObject({ activeUntil: at() + 20_000 });
  });
});
