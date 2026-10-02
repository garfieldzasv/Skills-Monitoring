import { ADVANCED_JOB_IDS, ROLE_GROUPS, type RoleGroup } from "@/core/game/jobs";
import type { SkillOverride } from "@/core/game/skillMeta";
import type { ManualOrder, PartySortSettings, SortPreset } from "@/core/party/sortParty";
import { DEFAULT_WATCH_ACTIONS } from "@/data/defaultWatchActions";

export const SETTINGS_VERSION = 2;

export interface Settings {
  version: typeof SETTINGS_VERSION;
  /** Advanced job → action IDs shown in order. Missing jobs fall back to defaults. */
  watchActions: Record<number, number[]>;
  /** User corrections per action ID. */
  skillOverrides: Record<number, SkillOverride>;
  /** Advanced job → slot action IDs that are not announced (every slot is, by default). */
  silentActions: Record<number, number[]>;
  partySort: PartySortSettings;
  manualOrders: ManualOrder[];
}

/** Per overlay instance (see `?profile=`), stored separately from {@link Settings}. */
export interface LayoutSettings {
  iconSize: number;
  /** Top of one row to top of the next, matching one in-game party list slot. */
  rowPitch: number;
  iconGap: number;
  offsetX: number;
  offsetY: number;
  direction: "ltr" | "rtl";
  textScale: number;
  opacity: number;
  showDuration: boolean;
  /** Speak watched skills through ACT's TTS. Per overlay, so two overlays do not both speak. */
  announce: boolean;
  announceText: AnnounceText;
}

/** What is spoken when a watched skill is used. */
export type AnnounceText = "skill" | "jobAndSkill" | "memberAndSkill";

export const ANNOUNCE_TEXTS: readonly AnnounceText[] = ["skill", "jobAndSkill", "memberAndSkill"];

export const LAYOUT_LIMITS = {
  iconSize: { min: 12, max: 96, step: 1 },
  rowPitch: { min: 12, max: 160, step: 0.5 },
  iconGap: { min: 0, max: 40, step: 0.5 },
  offsetX: { min: 0, max: 400, step: 1 },
  offsetY: { min: 0, max: 400, step: 1 },
  textScale: { min: 0.5, max: 2.5, step: 0.05 },
  opacity: { min: 0.1, max: 1, step: 0.05 },
} as const satisfies Partial<Record<keyof LayoutSettings, { min: number; max: number; step: number }>>;

function defaultSortPreset(): SortPreset {
  return { roleOrder: [...ROLE_GROUPS], jobOrder: [...ADVANCED_JOB_IDS] };
}

export function defaultPartySort(): PartySortSettings {
  const presets = {} as Record<RoleGroup, SortPreset>;
  for (const g of ROLE_GROUPS) presets[g] = defaultSortPreset();
  return { selfFirst: true, presets, sameJobTieBreak: "actorIdDesc" };
}

export function defaultWatchActions(): Record<number, number[]> {
  return Object.fromEntries(Object.entries(DEFAULT_WATCH_ACTIONS).map(([job, ids]) => [Number(job), [...ids]]));
}

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    watchActions: defaultWatchActions(),
    skillOverrides: {},
    silentActions: {},
    partySort: defaultPartySort(),
    manualOrders: [],
  };
}

export function defaultLayout(): LayoutSettings {
  return {
    iconSize: 32,
    rowPitch: 40,
    iconGap: 3,
    offsetX: 8,
    offsetY: 8,
    direction: "ltr",
    textScale: 1,
    opacity: 1,
    showDuration: true,
    announce: false,
    announceText: "skill",
  };
}
