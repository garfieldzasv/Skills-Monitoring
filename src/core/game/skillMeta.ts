import { SHOWN_DURATION } from "@/data/shownDuration";
import { getAction, type ActionData } from "./actions";
import { evalLevelValue, type LevelValue } from "./levelValue";
import { recastKey, resolveLearnedTier, timerOwner, topOfChain } from "./upgrades";

/** A user's correction of one action's values (seconds). Absent fields use game data. */
export interface SkillOverride {
  recast?: LevelValue;
  /** Seconds the effect lasts; 0 means no duration is shown. */
  duration?: LevelValue;
  maxCharges?: LevelValue;
  minLevel?: number;
}

/** A configured slot resolved for one specific player (job + level). */
export interface ResolvedSkill {
  /** The action ID configured in the slot. */
  slotActionId: number;
  /** The tier this player actually has; drives name and icon. */
  actionId: number;
  /** Cooldown tracking key: the game's recast timer, see {@link recastKey}. */
  recastKey: string;
  /**
   * Whether using the timer's own action starts this slot's effect. False for a stand-in
   * (see ActionData.replaces): its effect starts when the stand-in itself is cast.
   */
  effectOnTimerUse: boolean;
  name: string;
  iconId: number;
  recastMs: number;
  durationMs: number;
  maxCharges: number;
}

type OverrideLookup = (actionId: number) => SkillOverride | undefined;

/** The duration the overlay counts down (see SHOWN_DURATION), as a level value. */
export function shownDuration(action: ActionData): LevelValue {
  const index = SHOWN_DURATION[action.id];
  if (index === null) return 0;
  return action.durations[index ?? 0] ?? 0;
}

/**
 * Game-data values of an action, in the same shape as a user override. Recast and charges are the
 * timer's (see {@link timerOwner}); the duration is the action's own effect.
 */
export function gameValues(action: ActionData): Required<Pick<SkillOverride, "recast" | "duration" | "maxCharges">> {
  const timer = timerOwner(action);
  return { recast: timer.recast, duration: shownDuration(action), maxCharges: timer.charges };
}

/**
 * Resolves what a player of `jobId` at `level` sees for a slot.
 * Returns undefined when the player has no tier of that action (wrong job, or synced below it);
 * callers keep the slot's position empty so icons stay aligned.
 *
 * Value priority per field: user override > game data. Overrides are looked up by learned tier,
 * then top tier, then the configured ID.
 */
export function resolveSkill(
  slotActionId: number,
  jobId: number,
  level: number,
  userOverrides: OverrideLookup = () => undefined,
): ResolvedSkill | undefined {
  if (slotActionId <= 0) return undefined;
  const tier = resolveLearnedTier(slotActionId, jobId, level);
  if (tier === undefined) return undefined;
  const action = getAction(tier)!;
  const ids = [...new Set([tier, topOfChain(slotActionId), slotActionId])];
  const pick = <K extends keyof SkillOverride>(key: K) => {
    for (const id of ids) {
      const v = userOverrides(id)?.[key];
      if (v !== undefined) return v;
    }
    return undefined;
  };

  const minLevel = pick("minLevel");
  if (minLevel !== undefined && level < minLevel) return undefined;

  const game = gameValues(action);
  const at = (v: LevelValue) => evalLevelValue(v, level);
  return {
    slotActionId,
    actionId: tier,
    recastKey: recastKey(tier)!,
    effectOnTimerUse: timerOwner(action) === action,
    name: action.name,
    iconId: action.icon,
    recastMs: Math.max(0, at(pick("recast") ?? game.recast)) * 1000,
    durationMs: Math.max(0, at(pick("duration") ?? game.duration)) * 1000,
    maxCharges: Math.max(1, Math.trunc(at(pick("maxCharges") ?? game.maxCharges))),
  };
}
