import { readonly, shallowRef } from "vue";
import { STORAGE_PREFIX } from "@/core/settings/storage";
import { urlParams } from "./useUrlParams";
import { createPersisted, type Persisted } from "./usePersisted";

/*
 * Overlay ↔ settings window communication. Both windows share one localStorage (same origin,
 * same embedded browser), and `storage` events fire in the *other* window, which is exactly the
 * direction needed. BroadcastChannel is avoided because file:// pages have an opaque origin.
 */

const LIVE_KEY = `${STORAGE_PREFIX}live-party`;
const COMMAND_KEY = `${STORAGE_PREFIX}command`;
const PREVIEW_KEY = `${STORAGE_PREFIX}preview`;

/** What the overlay is currently showing, published for the settings window. */
export interface LivePartySnapshot {
  members: { id: string; name: string; job: number }[];
  demo: boolean;
  updatedAt: number;
}

/** `sayTest` speaks a test phrase, to check ACT's TTS from the settings window. */
export type OverlayCommand = "castAll" | "reset" | "sayTest";

const COMMANDS: readonly OverlayCommand[] = ["castAll", "reset", "sayTest"];

/** Edit-time preview switches, set from the settings window. */
export interface PreviewFlags {
  calibrate: boolean;
  forceDemo: boolean;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: cross-window features degrade, the overlay itself keeps working.
  }
}

function parseLive(raw: string | null): LivePartySnapshot | undefined {
  try {
    const v = raw ? (JSON.parse(raw) as LivePartySnapshot) : undefined;
    return v && Array.isArray(v.members) ? v : undefined;
  } catch {
    return undefined;
  }
}

// ---------- live party (overlay → settings) ----------

let lastPublished = "";

export function publishLiveParty(snapshot: Omit<LivePartySnapshot, "updatedAt">): void {
  const body = JSON.stringify(snapshot);
  if (body === lastPublished) return;
  lastPublished = body;
  safeSet(LIVE_KEY, JSON.stringify({ ...snapshot, updatedAt: Date.now() }));
}

const live = shallowRef<LivePartySnapshot | undefined>();
let liveListening = false;

export function useLiveParty() {
  if (!liveListening) {
    liveListening = true;
    live.value = parseLive(safeGet(LIVE_KEY));
    window.addEventListener("storage", (e) => {
      if (e.key === LIVE_KEY) live.value = parseLive(e.newValue);
    });
  }
  return readonly(live);
}

// ---------- commands (settings → overlay) ----------

/**
 * Sent from a settings window; it carries that window's profile (the overlay that opened it).
 * The timestamp makes repeated identical commands still change the value (and fire events).
 */
export function sendOverlayCommand(command: OverlayCommand): void {
  safeSet(COMMAND_KEY, JSON.stringify({ command, profile: urlParams.profile ?? null, at: Date.now() }));
}

export function onOverlayCommand(handler: (command: OverlayCommand) => void): void {
  window.addEventListener("storage", (e) => {
    if (e.key !== COMMAND_KEY || !e.newValue) return;
    try {
      const { command, profile } = JSON.parse(e.newValue) as { command: OverlayCommand; profile?: string | null };
      if (!COMMANDS.includes(command)) return;
      // A test phrase is for the overlay whose settings are open, like its announce switch;
      // with two overlays open, the other one stays quiet.
      if (command === "sayTest" && (profile ?? undefined) !== urlParams.profile) return;
      handler(command);
    } catch {
      // ignore malformed values
    }
  });
}

// ---------- preview flags (settings → overlay) ----------

function validatePreview(v: unknown): PreviewFlags {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  return { calibrate: o.calibrate === true, forceDemo: o.forceDemo === true };
}

let preview: Persisted<PreviewFlags> | undefined;

export function usePreviewFlags(): Persisted<PreviewFlags> {
  preview ??= createPersisted({
    storageKey: PREVIEW_KEY,
    load: () => {
      try {
        return validatePreview(JSON.parse(safeGet(PREVIEW_KEY) ?? "null"));
      } catch {
        return validatePreview(undefined);
      }
    },
    save: (v) => safeSet(PREVIEW_KEY, JSON.stringify(v)),
    validate: validatePreview,
    debounceMs: 0,
  });
  return preview;
}
