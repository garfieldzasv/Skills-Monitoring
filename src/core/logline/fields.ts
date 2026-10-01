/**
 * Network log line field indexes (OverlayPlugin `LogLine` event, `line` array).
 * Reference: cactbot resources/netlog_defs.ts.
 */
export const LineType = {
  Ability: "21",
  AOEAbility: "22",
  WasDefeated: "25",
  GainsEffect: "26",
  LosesEffect: "30",
  ActorControl: "33",
  NetworkUpdateHP: "39",
  InCombat: "260",
} as const;

export const AbilityField = {
  timestamp: 1,
  sourceId: 2,
  id: 4,
  targetId: 6,
  currentMp: 36,
  targetIndex: 45,
} as const;

export const WasDefeatedField = { timestamp: 1, targetId: 2 } as const;

export const EffectField = {
  timestamp: 1,
  effectId: 2,
  duration: 4,
  sourceId: 5,
  targetId: 7,
} as const;

export const ActorControlField = { timestamp: 1, command: 3 } as const;

export const UpdateHPField = { timestamp: 1, id: 2, currentMp: 6 } as const;

export const InCombatField = { timestamp: 1, inACTCombat: 2, inGameCombat: 3 } as const;

/** ActorControl commands that mean a wipe / encounter reset. */
export const WIPE_COMMANDS: ReadonlySet<string> = new Set(["4000000F", "40000010"]);
