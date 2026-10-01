import type { OverlayEventName, OverlayHandler } from "./events";

/**
 * Minimal OverlayPlugin client: subscribes to events, and calls handlers that need no reply
 * (`say` for ACT's text-to-speech).
 *
 * - Embedded (inside an ACT overlay): requests go through the injected `window.OverlayPluginApi`
 *   and events arrive via `window.__OverlayCallback`.
 * - WebSocket: when the URL has `OVERLAY_WS=ws://127.0.0.1:10501/ws` (query string or after
 *   `#/...?`), connect to OverlayPlugin's WebSocket server. Used from a normal browser.
 */

interface OverlayPluginApi {
  ready: boolean;
  /**
   * Bound through CefSharp, which rejects any call that omits a declared parameter: the callback
   * MUST always be passed, or every request fails ("Missing Parameters").
   */
  callHandler(msg: string, cb: ((result: string) => void) | undefined): unknown;
}

declare global {
  interface Window {
    OverlayPluginApi?: OverlayPluginApi;
    __OverlayCallback?: (msg: { type: string }) => void;
  }
}

export type ConnectionMode = "embedded" | "websocket" | "none";

type AnyHandler = (event: never) => void;
const subscribers = new Map<string, Set<AnyHandler>>();
let ws: WebSocket | null = null;
let initialized = false;
/** Until connected, subscriptions are only recorded; connecting subscribes them all at once. */
let connected = false;

function overlayWsUrl(): string | null {
  const fromSearch = new URLSearchParams(window.location.search).get("OVERLAY_WS");
  if (fromSearch) return fromSearch;
  const hashQuery = window.location.hash.split("?")[1];
  return hashQuery ? new URLSearchParams(hashQuery).get("OVERLAY_WS") : null;
}

export function getConnectionMode(): ConnectionMode {
  if (overlayWsUrl()) return "websocket";
  return window.OverlayPluginApi ? "embedded" : "none";
}

type HandlerCall = { call: string; [key: string]: unknown };

function send(msg: HandlerCall): void {
  const text = JSON.stringify(msg);
  if (ws) {
    ws.send(text);
    return;
  }
  const result = window.OverlayPluginApi?.callHandler(text, () => {}) as
    | { catch?: (onRejected: (err: unknown) => void) => unknown }
    | undefined;
  // Thenable check rather than instanceof: the promise comes from CefSharp's binding layer.
  if (typeof result?.catch === "function") {
    result.catch((err) => console.error(`[overlay] ${msg.call} failed`, err));
  }
}

function subscribe(events: string[]): void {
  if (!connected || events.length === 0) return;
  send({ call: "subscribe", events });
}

/**
 * Calls an OverlayPlugin handler whose reply is not needed. Dropped while not connected: these
 * are momentary effects (speech), not state that must arrive later.
 */
export function callOverlayHandler(msg: HandlerCall): void {
  if (connected) send(msg);
}

/** Speaks through ACT's text-to-speech (OverlayPlugin `say` → ActGlobals.oFormActMain.TTS). */
export function say(text: string): void {
  if (text) callOverlayHandler({ call: "say", text });
}

function dispatch(msg: { type: string }): void {
  const handlers = subscribers.get(msg.type);
  if (!handlers) return;
  for (const h of handlers) {
    try {
      (h as (e: unknown) => void)(msg);
    } catch (err) {
      console.error(`[overlay] handler for ${msg.type} failed`, err);
    }
  }
}

function onConnected(): void {
  connected = true;
  subscribe([...subscribers.keys()]);
}

function connectWebSocket(url: string): void {
  ws = new WebSocket(url);
  ws.addEventListener("open", onConnected);
  ws.addEventListener("message", (e) => {
    try {
      const data = JSON.parse(String(e.data)) as { type?: string };
      if (data.type) dispatch(data as { type: string });
    } catch (err) {
      console.error("[overlay] bad websocket message", err);
    }
  });
  ws.addEventListener("close", () => {
    connected = false;
    window.setTimeout(() => connectWebSocket(url), 1000);
  });
}

function waitForEmbeddedApi(): void {
  if (!window.OverlayPluginApi?.ready) {
    window.setTimeout(waitForEmbeddedApi, 300);
    return;
  }
  window.__OverlayCallback = dispatch;
  onConnected();
}

export function addOverlayListener<E extends OverlayEventName>(event: E, handler: OverlayHandler<E>): void {
  let set = subscribers.get(event);
  if (!set) {
    set = new Set();
    subscribers.set(event, set);
    subscribe([event]); // no-op until connected
  }
  set.add(handler as AnyHandler);
  if (!initialized) {
    initialized = true;
    const url = overlayWsUrl();
    if (url) connectWebSocket(url);
    else waitForEmbeddedApi();
  }
}
