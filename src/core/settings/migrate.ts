import { getAction, getAllActionIds } from "@/core/game/actions";
import { SETTINGS_VERSION } from "./schema";

/**
 * The listed action a slot holding an unlisted stand-in should show instead: the one that stands
 * in for the same button with the same effect durations (单色~四色技巧舞步结束 → 技巧舞步结束).
 */
function listedEquivalent(id: number): number | undefined {
  const action = getAction(id);
  if (!action || action.listed || action.replaces === undefined) return undefined;
  const durations = JSON.stringify(action.durations);
  return getAllActionIds().find((other) => {
    const o = getAction(other)!;
    return o.listed && o.replaces === action.replaces && JSON.stringify(o.durations) === durations;
  });
}

/**
 * `MIGRATIONS[n]` upgrades raw data from version n to n + 1. Add an entry whenever the
 * {@link Settings} shape or the meaning of stored IDs changes, then bump SETTINGS_VERSION.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // v2: slots offer only what the game's action list shows; replace swapped-in variants.
  1: (raw) => {
    const watch = raw.watchActions;
    if (typeof watch !== "object" || watch === null) return raw;
    const migrated = Object.fromEntries(
      Object.entries(watch as Record<string, unknown>).map(([job, list]) => [
        job,
        Array.isArray(list) ? [...new Set(list.map((id) => listedEquivalent(id as number) ?? id))] : list,
      ]),
    );
    return { ...raw, watchActions: migrated };
  },
};

/** Brings stored data up to the current version; validation runs afterwards. */
export function migrateSettings(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  let data = raw as Record<string, unknown>;
  let version = typeof data.version === "number" ? data.version : SETTINGS_VERSION;
  while (version < SETTINGS_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    data = step(data);
    version++;
  }
  return { ...data, version };
}
