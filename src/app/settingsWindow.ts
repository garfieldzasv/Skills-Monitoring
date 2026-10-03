import { STORAGE_PREFIX } from "@/core/settings/storage";

/**
 * Size of the settings window, and the place it was last closed at. The window opens where the
 * user left it: inside ACT the overlay cannot see the monitor and the opened window cannot move
 * itself, so centring could not work the same way every time; remembering the user's placement
 * does (the first open is wherever the browser puts it).
 */

/** The settings layout is designed for this width (every tab verified without overflow). */
export const SETTINGS_WINDOW = { name: "skills-monitoring-settings", width: 735, height: 955 } as const;

const POSITION_KEY = `${STORAGE_PREFIX}settings-window-position`;

export interface WindowPosition {
  left: number;
  top: number;
}

/** `window.open` features: the fixed size, plus the remembered position if there is one. */
export function settingsWindowFeatures(position?: WindowPosition): string {
  const size = `width=${SETTINGS_WINDOW.width},height=${SETTINGS_WINDOW.height}`;
  return position ? `${size},left=${position.left},top=${position.top}` : size;
}

export function savedPosition(storage: Storage): WindowPosition | undefined {
  try {
    const v = JSON.parse(storage.getItem(POSITION_KEY) ?? "null") as Partial<WindowPosition> | null;
    return v && Number.isFinite(v.left) && Number.isFinite(v.top) ? { left: v.left!, top: v.top! } : undefined;
  } catch {
    return undefined;
  }
}

/** Run in the settings window as it closes: its own position on the screen. */
export function savePosition(win: Window): void {
  try {
    win.localStorage.setItem(POSITION_KEY, JSON.stringify({ left: win.screenX, top: win.screenY }));
  } catch {
    // Storage unavailable: the window opens at the browser's default place next time.
  }
}

/**
 * Run in the settings window as it opens: a remembered position that put it mostly off its screen
 * (a monitor unplugged since, a changed resolution) is forgotten, so the next open is back at the
 * browser's default place instead of out of reach again.
 */
export function forgetIfOffScreen(win: Window): void {
  const screen = win.screen as Screen & { availLeft?: number; availTop?: number };
  const left = screen.availLeft ?? 0;
  const top = screen.availTop ?? 0;
  const reachable = 100; // px of the window that must stay on the work area
  const onScreen =
    win.screenX + win.outerWidth >= left + reachable &&
    win.screenX <= left + screen.availWidth - reachable &&
    win.screenY >= top - reachable &&
    win.screenY <= top + screen.availHeight - reachable;
  if (onScreen) return;
  try {
    win.localStorage.removeItem(POSITION_KEY);
  } catch {
    // nothing to forget
  }
}
