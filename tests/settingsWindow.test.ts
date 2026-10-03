import { describe, expect, it } from "vitest";
import { forgetIfOffScreen, savePosition, savedPosition, settingsWindowFeatures } from "@/app/settingsWindow";

function fakeWindow(screenX: number, screenY: number, screen: Record<string, number>) {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
  return { screenX, screenY, outerWidth: 751, outerHeight: 994, screen, localStorage } as unknown as Window;
}

describe("settings window", () => {
  it("opens 735 × 955, at the remembered place if there is one", () => {
    expect(settingsWindowFeatures()).toBe("width=735,height=955");
    expect(settingsWindowFeatures({ left: -1500, top: 40 })).toBe("width=735,height=955,left=-1500,top=40");
  });

  it("remembers where it was closed", () => {
    const win = fakeWindow(1200, 60, { availWidth: 1920, availHeight: 1040 });
    expect(savedPosition(win.localStorage)).toBeUndefined();
    savePosition(win);
    expect(savedPosition(win.localStorage)).toEqual({ left: 1200, top: 60 });
  });

  it("ignores a broken record", () => {
    const win = fakeWindow(0, 0, { availWidth: 1920, availHeight: 1040 });
    win.localStorage.setItem("skills-monitoring:settings-window-position", '{"left":"x"}');
    expect(savedPosition(win.localStorage)).toBeUndefined();
  });

  it("forgets a place that left the window off its screen, keeps one on a second monitor", () => {
    const offScreen = fakeWindow(2500, 60, { availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1040 });
    savePosition(offScreen);
    forgetIfOffScreen(offScreen);
    expect(savedPosition(offScreen.localStorage)).toBeUndefined();

    const leftMonitor = fakeWindow(-1500, 40, { availLeft: -1920, availTop: 0, availWidth: 1920, availHeight: 1040 });
    savePosition(leftMonitor);
    forgetIfOffScreen(leftMonitor);
    expect(savedPosition(leftMonitor.localStorage)).toEqual({ left: -1500, top: 40 });
  });
});
