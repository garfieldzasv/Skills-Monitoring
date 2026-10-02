import { describe, expect, it } from "vitest";
import { getAction } from "@/core/game/actions";
import { iconPath } from "@/core/game/icons";
import { resolveSkill } from "@/core/game/skillMeta";
import { recastKey, resolveLearnedTier, topOfChain, upgradeFamily } from "@/core/game/upgrades";
import { DEFAULT_WATCH_ACTIONS } from "@/data/defaultWatchActions";

describe("action data", () => {
  it("has Chinese names and jobs from the game's ClassJobCategory", () => {
    const reprisal = getAction(7535)!;
    expect(reprisal.name).toBe("雪仇");
    expect(reprisal.jobs).toEqual([1, 3, 19, 21, 32, 37]);
    // ACN actions belong to SMN only; SCH has its own copies.
    expect(getAction(163)!.jobs).toEqual([26, 27]);
  });

  it("takes level-dependent values from tooltips and traits", () => {
    expect(getAction(7518)!.charges).toEqual([[1, 1], [88, 2]]); // 促进
    expect(getAction(7432)!.charges).toEqual([[1, 1], [88, 2]]); // 神祝祷
    expect(getAction(3614)!.charges).toEqual([[1, 1], [78, 2], [98, 3]]); // 先天禀赋
    expect(getAction(7405)!.recast).toEqual([[1, 120], [88, 90]]); // 行吟
    expect(getAction(7535)!.durations).toEqual([[[1, 10], [98, 15]]]); // 雪仇
  });

  it("knows which actions the game's Actions & Traits list shows", () => {
    expect(getAction(16004)!.listed).toBe(true); // 技巧舞步结束
    expect(getAction(16196)!.listed).toBe(false); // 四色技巧舞步结束: swapped in by the game only
    expect(getAction(34675)!.listed).toBe(true); // 星空构想
    expect(getAction(7535)!.listed).toBe(true); // 雪仇 (role action, on the role tab)
    expect(getAction(18805)!.listed).toBe(false); // 天之印 while forming a ninjutsu
  });

  it("every default slot is an action the game lists", () => {
    for (const [job, ids] of Object.entries(DEFAULT_WATCH_ACTIONS)) {
      for (const id of ids) expect(getAction(id)?.listed, `${job}:${id}`).toBe(true);
    }
  });

  it("leaves pets, duty actions and effect variants out", () => {
    expect(getAction(802)).toBeUndefined(); // 仙光的拥抱 (the fairy's)
    expect(getAction(33987)).toBeUndefined(); // 闪躲 (duty action)
    expect(getAction(16538)).toBeDefined(); // 异想的幻光 (the scholar's own command)
  });

  it("every default slot resolves for its job at level 100", () => {
    for (const [job, ids] of Object.entries(DEFAULT_WATCH_ACTIONS)) {
      for (const id of ids) {
        expect(resolveSkill(id, Number(job), 100), `${job}:${id}`).toBeDefined();
      }
    }
  });
});

describe("upgrades", () => {
  it("follows chains to the top tier", () => {
    expect(topOfChain(17)).toBe(36920); // 预警 → 极致防御
    expect(upgradeFamily(36920)).toEqual(expect.arrayContaining([17, 36920]));
  });

  it("tracks by the game's recast timer", () => {
    expect(recastKey(17)).toBe(recastKey(36920)); // tiers of one chain
    expect(recastKey(110)).toBe(recastKey(117)); // 失血箭 and 死亡箭雨 share their charges
    expect(recastKey(7535)).not.toBe(recastKey(7549));
    expect(recastKey(99_999_999)).toBeUndefined();
  });

  it("stand-ins use the timer of the button they replace", () => {
    expect(getAction(16196)!.replaces).toBe(15998); // 四色技巧舞步结束 → 技巧舞步 (ActionIndirection)
    expect(recastKey(16196)).toBe(recastKey(15998));
    expect(recastKey(16193)).toBe(recastKey(15998));
    expect(resolveSkill(16196, 38, 100)).toMatchObject({ recastMs: 120_000, durationMs: 20_000, effectOnTimerUse: false });
    expect(resolveSkill(15998, 38, 100)).toMatchObject({ effectOnTimerUse: true });
  });

  it("does not treat in-combat replacements as upgrades", () => {
    expect(getAction(7392)!.upgradesTo).toBeUndefined(); // 血溅 → 血红乱 only under Delirium
    expect(getAction(24292)!.upgradesTo).toBe(37034); // 均衡预后 → 均衡预后II at Lv96
  });

  it("picks the tier a player has at their level", () => {
    expect(resolveLearnedTier(36920, 19, 100)).toBe(36920);
    expect(resolveLearnedTier(36920, 19, 50)).toBe(17);
    expect(resolveLearnedTier(36920, 19, 10)).toBeUndefined();
    // A base class can use role actions but not job-only actions.
    expect(resolveLearnedTier(7535, 1, 30)).toBe(7535);
    expect(resolveLearnedTier(3540, 1, 60)).toBeUndefined();
  });
});

describe("resolveSkill", () => {
  it("evaluates game data at the member's level", () => {
    expect(resolveSkill(7405, 23, 100)).toMatchObject({ recastMs: 90_000, durationMs: 15_000 });
    expect(resolveSkill(7405, 23, 80)).toMatchObject({ recastMs: 120_000 });
    expect(resolveSkill(7518, 35, 100)).toMatchObject({ maxCharges: 2 });
    expect(resolveSkill(7518, 35, 87)).toMatchObject({ maxCharges: 1 });
  });

  it("counts down the chosen tooltip duration", () => {
    expect(resolveSkill(25868, 28, 100)?.durationMs).toBe(20_000); // 怒涛之计, not 疾风之计
    expect(resolveSkill(7561, 24, 100)).toMatchObject({ recastMs: 40_000, durationMs: 0 });
  });

  it("user overrides win over built-in values", () => {
    const skill = resolveSkill(7405, 23, 100, (id) => (id === 7405 ? { recast: 100 } : undefined));
    expect(skill?.recastMs).toBe(100_000);
  });

  it("respects a user minimum level", () => {
    expect(resolveSkill(7405, 23, 100, () => ({ minLevel: 101 }))).toBeUndefined();
  });

  it("builds icon paths in the game folder layout", () => {
    expect(iconPath(806)).toBe("icons/000000/000806.png");
    expect(iconPath(62119)).toBe("icons/062000/062119.png");
    expect(iconPath(0)).toBe("");
  });
});
