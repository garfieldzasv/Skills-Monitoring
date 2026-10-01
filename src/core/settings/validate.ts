import { ADVANCED_JOB_IDS, ROLE_GROUPS, type RoleGroup } from "@/core/game/jobs";
import { isValidLevelValue } from "@/core/game/levelValue";
import type { SkillOverride } from "@/core/game/skillMeta";
import { MAX_MANUAL_ORDERS, type ManualOrder, type PartySortSettings, type SortPreset } from "@/core/party/sortParty";
import {
  defaultLayout,
  defaultPartySort,
  defaultWatchActions,
  LAYOUT_LIMITS,
  SETTINGS_VERSION,
  type LayoutSettings,
  type Settings,
} from "./schema";

/*
 * Every loader goes through these functions: unknown shapes are repaired field by field and
 * never throw, so a corrupted localStorage entry can't blank the overlay.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const posInt = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined);

function validateActionList(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(posInt).filter((n): n is number => n !== undefined))];
}

function validateWatchActions(v: unknown): Record<number, number[]> {
  const result = defaultWatchActions();
  if (!isObj(v)) return result;
  for (const [job, list] of Object.entries(v)) {
    const jobId = posInt(Number(job));
    // Unknown jobs are kept so data survives until they become supported.
    if (jobId !== undefined) result[jobId] = validateActionList(list);
  }
  return result;
}

function validateOverride(v: unknown): SkillOverride | undefined {
  if (!isObj(v)) return undefined;
  const out: SkillOverride = {};
  for (const key of ["recast", "duration", "maxCharges"] as const) {
    if (isValidLevelValue(v[key])) out[key] = v[key];
  }
  const minLevel = posInt(v.minLevel);
  if (minLevel !== undefined) out.minLevel = minLevel;
  return Object.keys(out).length > 0 ? out : undefined;
}

function validateOverrides(v: unknown): Record<number, SkillOverride> {
  const result: Record<number, SkillOverride> = {};
  if (!isObj(v)) return result;
  for (const [id, entry] of Object.entries(v)) {
    const actionId = posInt(Number(id));
    const o = validateOverride(entry);
    if (actionId !== undefined && o) result[actionId] = o;
  }
  return result;
}

/** Keeps listed items in order, drops unknown/duplicates, appends anything missing. */
function completeOrder<T>(v: unknown, all: readonly T[]): T[] {
  const listed = Array.isArray(v) ? v.filter((x): x is T => all.includes(x as T)) : [];
  const unique = [...new Set(listed)];
  return [...unique, ...all.filter((x) => !unique.includes(x))];
}

function validatePreset(v: unknown): SortPreset {
  const o = isObj(v) ? v : {};
  return {
    roleOrder: completeOrder<RoleGroup>(o.roleOrder, ROLE_GROUPS),
    jobOrder: completeOrder<number>(o.jobOrder, ADVANCED_JOB_IDS),
  };
}

function validatePartySort(v: unknown): PartySortSettings {
  const d = defaultPartySort();
  if (!isObj(v)) return d;
  const presets = isObj(v.presets) ? v.presets : {};
  return {
    selfFirst: typeof v.selfFirst === "boolean" ? v.selfFirst : d.selfFirst,
    presets: Object.fromEntries(ROLE_GROUPS.map((g) => [g, validatePreset(presets[g])])) as Record<RoleGroup, SortPreset>,
    sameJobTieBreak: v.sameJobTieBreak === "actorIdAsc" ? "actorIdAsc" : "actorIdDesc",
  };
}

function validateManualOrders(v: unknown): ManualOrder[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .filter((o) => typeof o.memberKey === "string" && Array.isArray(o.order))
    .map((o) => ({
      memberKey: o.memberKey as string,
      order: (o.order as unknown[]).filter((id): id is string => typeof id === "string"),
      savedAt: typeof o.savedAt === "number" ? o.savedAt : 0,
    }))
    .slice(0, MAX_MANUAL_ORDERS);
}

export function validateSettings(v: unknown): Settings {
  const o = isObj(v) ? v : {};
  return {
    version: SETTINGS_VERSION,
    watchActions: validateWatchActions(o.watchActions),
    skillOverrides: validateOverrides(o.skillOverrides),
    partySort: validatePartySort(o.partySort),
    manualOrders: validateManualOrders(o.manualOrders),
  };
}

export function validateLayout(v: unknown): LayoutSettings {
  const d = defaultLayout();
  const o = isObj(v) ? v : {};
  const num = (key: keyof typeof LAYOUT_LIMITS) => {
    const x = o[key];
    const { min, max } = LAYOUT_LIMITS[key];
    return typeof x === "number" && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d[key];
  };
  return {
    iconSize: num("iconSize"),
    rowPitch: num("rowPitch"),
    iconGap: num("iconGap"),
    offsetX: num("offsetX"),
    offsetY: num("offsetY"),
    direction: o.direction === "rtl" ? "rtl" : "ltr",
    textScale: num("textScale"),
    opacity: num("opacity"),
    showDuration: typeof o.showDuration === "boolean" ? o.showDuration : d.showDuration,
  };
}
