import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression test for the ACT failure: OverlayPlugin's `callHandler` is a CefSharp binding that
 * rejects any call missing a declared parameter, so every subscribe failed and nothing rendered.
 */
interface StrictApi {
  ready: boolean;
  calls: { msg: Record<string, unknown>; argCount: number }[];
  callHandler: (...args: unknown[]) => Promise<null>;
}

function strictApi(): StrictApi {
  const api: StrictApi = {
    ready: false,
    calls: [],
    callHandler(...args: unknown[]) {
      api.calls.push({ msg: JSON.parse(String(args[0])), argCount: args.length });
      if (args.length < 2) return Promise.reject(new Error("Missing Parameters: 1"));
      return Promise.resolve(null);
    },
  };
  return api;
}

let api: StrictApi;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  api = strictApi();
  vi.stubGlobal("window", {
    OverlayPluginApi: api,
    location: { search: "", hash: "#/" },
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("overlayApi (embedded / CefSharp)", () => {
  it("always passes the callback and subscribes once all early listeners are known", async () => {
    const { addOverlayListener } = await import("@/core/overlay/overlayApi");
    addOverlayListener("PartyChanged", () => {});
    addOverlayListener("LogLine", () => {});
    expect(api.calls).toHaveLength(0); // API not ready yet: queued

    api.ready = true;
    vi.advanceTimersByTime(300);
    expect(api.calls).toEqual([{ msg: { call: "subscribe", events: ["PartyChanged", "LogLine"] }, argCount: 2 }]);

    addOverlayListener("ChangeZone", () => {});
    expect(api.calls.at(-1)).toEqual({ msg: { call: "subscribe", events: ["ChangeZone"] }, argCount: 2 });
  });

  it("delivers events from __OverlayCallback to listeners", async () => {
    const { addOverlayListener } = await import("@/core/overlay/overlayApi");
    const seen: unknown[] = [];
    api.ready = true;
    addOverlayListener("ChangeZone", (e) => seen.push(e.zoneID));
    (window as unknown as { __OverlayCallback: (m: unknown) => void }).__OverlayCallback({ type: "ChangeZone", zoneID: 7 });
    expect(seen).toEqual([7]);
  });
});
