import { SETTINGS_VERSION } from "./schema";

/**
 * `MIGRATIONS[n]` upgrades raw data from version n to n + 1. Add an entry whenever the
 * {@link Settings} shape changes incompatibly, then bump SETTINGS_VERSION.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

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
