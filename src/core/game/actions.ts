import actionsJson from "@/data/generated/actions.json";
import type { LevelValue } from "./levelValue";

/** One action as written by scripts/import-game-data.ts. Values are per level, in seconds. */
export interface GeneratedAction {
  name: string;
  icon: number;
  /** Jobs and base classes that can use it. */
  jobs: number[];
  level: number;
  /**
   * Shown in the game's Actions & Traits list (job actions and role actions). Variants the game
   * only swaps in, such as 单色~四色技巧舞步结束, are not; the action picker offers listed ones only.
   */
  listed: boolean;
  /**
   * The game's recast timer (Action.CooldownGroup). Actions sharing one share their cooldown,
   * e.g. every tier of an upgrade chain, or 失血箭 and 死亡箭雨. 0 = no timer besides the GCD.
   */
  recastGroup: number;
  recast: LevelValue;
  charges: LevelValue;
  /**
   * Every effect duration in the tooltip, in tooltip order (0 at levels where that effect does
   * not exist yet). Which one the overlay counts down is a display choice, see shownDuration.ts.
   */
  durations: LevelValue[];
  /** The action this one becomes when its upgrade trait is learned. */
  upgradesTo?: number;
  /**
   * Set on a timer-less stand-in for another action's button (ActionIndirection), e.g.
   * 四色技巧舞步结束 → 技巧舞步. That action owns the timer and spent it when used; casting the
   * stand-in starts its effect only.
   */
  replaces?: number;
}

export interface GeneratedActions {
  /** Data versions the file was built from. */
  source: { xivapi: string; cn: string };
  actions: Record<number, GeneratedAction>;
}

export interface ActionData extends GeneratedAction {
  id: number;
}

const RAW = (actionsJson as unknown as GeneratedActions).actions;

const cache = new Map<number, ActionData | null>();

export function getAction(id: number): ActionData | undefined {
  let hit = cache.get(id);
  if (hit === undefined) {
    const raw = RAW[id];
    hit = raw ? { id, ...raw } : null;
    cache.set(id, hit);
  }
  return hit ?? undefined;
}

export function canJobUse(action: ActionData, jobId: number): boolean {
  return action.jobs.includes(jobId);
}

let allIds: number[] | undefined;

/** All action IDs, ascending. Used by the settings picker and the upgrade index. */
export function getAllActionIds(): readonly number[] {
  allIds ??= Object.keys(RAW)
    .map(Number)
    .sort((a, b) => a - b);
  return allIds;
}
