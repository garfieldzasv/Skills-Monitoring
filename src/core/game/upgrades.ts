import { canJobUse, getAction, getAllActionIds, type ActionData } from "./actions";

/** lower → upper, e.g. 预警(17) → 极致防御(36920), from the game data's `upgradesTo`. */
let lowersByUpper: Map<number, number[]> | undefined;

function lowerTiers(id: number): readonly number[] {
  if (!lowersByUpper) {
    lowersByUpper = new Map();
    for (const lower of getAllActionIds()) {
      const upper = getAction(lower)!.upgradesTo;
      if (upper === undefined) continue;
      lowersByUpper.set(upper, [...(lowersByUpper.get(upper) ?? []), lower]);
    }
  }
  return lowersByUpper.get(id) ?? [];
}

const topCache = new Map<number, number>();
const familyCache = new Map<number, readonly number[]>();

/** Follows the upgrade chain to its highest tier. */
export function topOfChain(actionId: number): number {
  let top = topCache.get(actionId);
  if (top === undefined) {
    top = actionId;
    const seen = new Set([top]);
    for (let next = getAction(top)?.upgradesTo; next !== undefined && !seen.has(next); next = getAction(top)?.upgradesTo) {
      seen.add(next);
      top = next;
    }
    topCache.set(actionId, top);
  }
  return top;
}

/** Every tier of the chain containing `actionId`. */
export function upgradeFamily(actionId: number): readonly number[] {
  const top = topOfChain(actionId);
  let family = familyCache.get(top);
  if (!family) {
    const found = new Set<number>();
    const stack = [top];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (found.has(id)) continue;
      found.add(id);
      stack.push(...lowerTiers(id));
    }
    family = [...found];
    familyCache.set(top, family);
  }
  return family;
}

/**
 * The action that owns the recast timer of `action`'s button: itself, or for a stand-in such as
 * 四色技巧舞步结束 the action whose button it replaces (技巧舞步).
 */
export function timerOwner(action: ActionData): ActionData {
  return action.recastGroup === 0 && action.replaces !== undefined ? (getAction(action.replaces) ?? action) : action;
}

/**
 * The key one player's cooldown is tracked under: the game's recast timer. Every action that
 * shares the timer (all tiers of a chain, 失血箭 and 死亡箭雨, a stand-in and the button it
 * replaces, …) hits the same tracker entry. Actions with no timer at all fall back to their
 * chain. Undefined for unknown actions.
 */
export function recastKey(actionId: number): string | undefined {
  const action = getAction(actionId);
  if (!action) return undefined;
  const owner = timerOwner(action);
  return owner.recastGroup > 0 ? `g${owner.recastGroup}` : `a${topOfChain(owner.id)}`;
}

/**
 * The tier a player of `jobId` at `level` actually has: the highest-level usable tier whose
 * required level is met. Undefined when no tier is learned (e.g. level-synced below it).
 */
export function resolveLearnedTier(actionId: number, jobId: number, level: number): number | undefined {
  let best: number | undefined;
  let bestLevel = -1;
  for (const id of upgradeFamily(actionId)) {
    const action = getAction(id);
    if (!action || !canJobUse(action, jobId) || action.level > level) continue;
    if (action.level > bestLevel) {
      best = id;
      bestLevel = action.level;
    }
  }
  return best;
}
