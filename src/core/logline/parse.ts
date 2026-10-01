import {
  AbilityField,
  ActorControlField,
  EffectField,
  InCombatField,
  LineType,
  UpdateHPField,
  WasDefeatedField,
  WIPE_COMMANDS,
} from "./fields";

/** Structured game events; downstream modules never index raw log arrays. */
export type GameEvent =
  | { type: "ability"; time: number; sourceId: string; actionId: number; targetId: string; sourceMp?: number }
  | { type: "death"; time: number; targetId: string }
  | { type: "gainEffect"; time: number; effectId: number; duration: number; sourceId: string; targetId: string }
  | { type: "loseEffect"; time: number; effectId: number; sourceId: string; targetId: string }
  | { type: "hpUpdate"; time: number; id: string; mp: number }
  | { type: "combat"; time: number; inCombat: boolean }
  | { type: "wipe"; time: number };

export type GameEventType = GameEvent["type"];

const LINE_TYPE_TO_EVENT: Readonly<Record<string, GameEventType>> = {
  [LineType.Ability]: "ability",
  [LineType.AOEAbility]: "ability",
  [LineType.WasDefeated]: "death",
  [LineType.GainsEffect]: "gainEffect",
  [LineType.LosesEffect]: "loseEffect",
  [LineType.ActorControl]: "wipe",
  [LineType.NetworkUpdateHP]: "hpUpdate",
  [LineType.InCombat]: "combat",
};

/** Cheap pre-check so callers skip lines no consumer is interested in (most lines in a raid). */
export function eventTypeOfLine(lineType: string | undefined): GameEventType | undefined {
  return lineType === undefined ? undefined : LINE_TYPE_TO_EVENT[lineType];
}

const hex = (s: string | undefined) => (s ? Number.parseInt(s, 16) : Number.NaN);
const id = (s: string | undefined) => (s ?? "").toUpperCase();
const time = (s: string | undefined) => {
  const t = s ? Date.parse(s) : Number.NaN;
  return Number.isFinite(t) ? t : 0;
};

/**
 * Parses one OverlayPlugin log line. Returns undefined for irrelevant or malformed lines.
 * AOE abilities produce one line per target; only the first target (index 0) is kept.
 */
export function parseLogLine(line: readonly string[]): GameEvent | undefined {
  switch (line[0]) {
    case LineType.Ability:
    case LineType.AOEAbility: {
      if (line[0] === LineType.AOEAbility && line[AbilityField.targetIndex] !== "0") return undefined;
      const actionId = hex(line[AbilityField.id]);
      const sourceId = id(line[AbilityField.sourceId]);
      if (!Number.isFinite(actionId) || !sourceId) return undefined;
      const mp = Number.parseInt(line[AbilityField.currentMp] ?? "", 10);
      return {
        type: "ability",
        time: time(line[AbilityField.timestamp]),
        sourceId,
        actionId,
        targetId: id(line[AbilityField.targetId]),
        ...(Number.isFinite(mp) ? { sourceMp: mp } : {}),
      };
    }
    case LineType.WasDefeated:
      return { type: "death", time: time(line[WasDefeatedField.timestamp]), targetId: id(line[WasDefeatedField.targetId]) };
    case LineType.GainsEffect:
    case LineType.LosesEffect: {
      const effectId = hex(line[EffectField.effectId]);
      if (!Number.isFinite(effectId)) return undefined;
      const base = {
        time: time(line[EffectField.timestamp]),
        effectId,
        sourceId: id(line[EffectField.sourceId]),
        targetId: id(line[EffectField.targetId]),
      };
      return line[0] === LineType.GainsEffect
        ? { type: "gainEffect", ...base, duration: Number.parseFloat(line[EffectField.duration] ?? "0") || 0 }
        : { type: "loseEffect", ...base };
    }
    case LineType.ActorControl:
      return WIPE_COMMANDS.has(line[ActorControlField.command] ?? "")
        ? { type: "wipe", time: time(line[ActorControlField.timestamp]) }
        : undefined;
    case LineType.NetworkUpdateHP: {
      const mp = Number.parseInt(line[UpdateHPField.currentMp] ?? "", 10);
      if (!Number.isFinite(mp)) return undefined;
      return { type: "hpUpdate", time: time(line[UpdateHPField.timestamp]), id: id(line[UpdateHPField.id]), mp };
    }
    case LineType.InCombat:
      return {
        type: "combat",
        time: time(line[InCombatField.timestamp]),
        inCombat: line[InCombatField.inACTCombat] === "1" || line[InCombatField.inGameCombat] === "1",
      };
    default:
      return undefined;
  }
}
