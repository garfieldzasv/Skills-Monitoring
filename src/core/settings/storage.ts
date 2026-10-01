import { migrateSettings } from "./migrate";
import type { LayoutSettings, Settings } from "./schema";
import { validateLayout, validateSettings } from "./validate";

/** Minimal storage port so core code never touches `window.localStorage` directly. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/**
 * All `<user>.github.io` Pages share one origin and one localStorage, so every key carries
 * the project prefix.
 */
export const STORAGE_PREFIX = "skills-monitoring:";
export const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;

export function layoutKey(profile?: string): string {
  return profile ? `${STORAGE_PREFIX}layout:${profile}` : `${STORAGE_PREFIX}layout`;
}

function readJson(store: KeyValueStore, key: string): unknown {
  try {
    const raw = store.get(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function loadSettings(store: KeyValueStore): Settings {
  return validateSettings(migrateSettings(readJson(store, SETTINGS_KEY)));
}

export function saveSettings(store: KeyValueStore, settings: Settings): void {
  store.set(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadLayout(store: KeyValueStore, profile?: string): LayoutSettings {
  return validateLayout(readJson(store, layoutKey(profile)));
}

export function saveLayout(store: KeyValueStore, layout: LayoutSettings, profile?: string): void {
  store.set(layoutKey(profile), JSON.stringify(layout));
}

/** localStorage adapter; access can throw in some embedded browsers, so it degrades to memory. */
export function createBrowserStore(): KeyValueStore {
  const memory = new Map<string, string>();
  return {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        memory.set(key, value);
      }
    },
  };
}
