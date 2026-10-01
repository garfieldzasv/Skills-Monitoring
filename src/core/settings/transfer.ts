import { migrateSettings } from "./migrate";
import type { Settings } from "./schema";
import { validateSettings } from "./validate";

const APP_ID = "skills-monitoring";

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64(text: string): string {
  const normalized = text.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
}

/** Manual party orders are tied to specific characters, so they are not exported. */
export function exportSettings(settings: Settings): string {
  const { manualOrders: _omit, ...shared } = settings;
  return encodeBase64(JSON.stringify({ app: APP_ID, settings: shared }));
}

/**
 * Reads text produced by {@link exportSettings}. The current manual orders are kept (they are
 * not part of an export). Throws when the text is not such an export.
 */
export function importSettings(text: string, current: Settings): Settings {
  let data: unknown;
  try {
    data = JSON.parse(decodeBase64(text));
  } catch {
    throw new Error("无法解析导入文本");
  }
  if (typeof data !== "object" || data === null || (data as { app?: unknown }).app !== APP_ID) {
    throw new Error("不是本工具导出的设置");
  }
  const { settings } = data as { settings?: object };
  return validateSettings(migrateSettings({ ...settings, manualOrders: current.manualOrders }));
}
