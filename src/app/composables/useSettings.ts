import type { LayoutSettings, Settings } from "@/core/settings/schema";
import {
  createBrowserStore,
  layoutKey,
  loadLayout,
  loadSettings,
  saveLayout,
  saveSettings,
  SETTINGS_KEY,
} from "@/core/settings/storage";
import { validateLayout, validateSettings } from "@/core/settings/validate";
import { createPersisted, type Persisted } from "./usePersisted";
import { urlParams } from "./useUrlParams";

const store = createBrowserStore();

let settings: Persisted<Settings> | undefined;
let layout: Persisted<LayoutSettings> | undefined;

export function useSettings(): Persisted<Settings> {
  settings ??= createPersisted({
    storageKey: SETTINGS_KEY,
    load: () => loadSettings(store),
    save: (v) => saveSettings(store, v),
    validate: validateSettings,
  });
  return settings;
}

/** Layout of this overlay instance (`?profile=` selects an independent one). */
export function useLayout(): Persisted<LayoutSettings> {
  const profile = urlParams.profile;
  layout ??= createPersisted({
    storageKey: layoutKey(profile),
    load: () => loadLayout(store, profile),
    save: (v) => saveLayout(store, v, profile),
    validate: validateLayout,
  });
  return layout;
}
