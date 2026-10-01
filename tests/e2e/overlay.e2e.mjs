// End-to-end check of the built app (dist/, loaded from file:// like in ACT), driven by a fake
// OverlayPlugin through party, casts, AOE, wipe, zone change, party changes, solo play and the
// settings window. Run: pnpm e2e  (needs Chrome; override the path with CHROME_PATH)
//
//   node tests/e2e/overlay.e2e.mjs embedded   → strict mock of OverlayPlugin's CefSharp-bound API
//   node tests/e2e/overlay.e2e.mjs ws         → fake OverlayPlugin WebSocket server (OVERLAY_WS)
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";

const WS_PORT = 10600 + Math.floor(Math.random() * 300);
const wsUrl = `ws://127.0.0.1:${WS_PORT}/ws`;
const base = pathToFileURL(resolve(import.meta.dirname, "../../dist/index.html")).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);

// ---------- fake OverlayPlugin ----------
const clients = new Set();
const wss = new WebSocketServer({ port: WS_PORT, path: "/ws" });
wss.on("connection", (sock) => {
  const client = { sock, events: new Set() };
  clients.add(client);
  sock.on("message", (data) => {
    const msg = JSON.parse(String(data));
    if (msg.call === "subscribe") msg.events.forEach((e) => client.events.add(e));
  });
  sock.on("close", () => clients.delete(client));
});
// MODE=embedded mimics ACT: page talks to window.OverlayPluginApi (CefSharp binding). MODE=ws uses OVERLAY_WS.
const MODE = process.argv[2] === "ws" ? "ws" : "embedded";
let overlayRef;
const push = (msg) => {
  if (MODE === "ws") { for (const c of clients) if (c.events.has(msg.type)) c.sock.send(JSON.stringify(msg)); return; }
  overlayRef.send("Runtime.evaluate", { expression: `window.__mockPush(${JSON.stringify(msg)})` });
};

/**
 * Strict stand-in for OverlayPlugin's injected API, modelled on the real failure seen in ACT:
 * CefSharp rejects a bound call when any declared parameter is missing. `ready` flips late, and
 * the lock state is announced after load like OverlayPlugin's BrowserLoad handler does.
 */
const MOCK_API = `(() => {
  const subs = new Set(); const calls = []; const errors = [];
  window.__mockSubs = subs; window.__mockCalls = calls; window.__mockErrors = errors;
  window.OverlayPluginApi = {
    ready: false,
    callHandler: function (msg, cb) {
      if (arguments.length < 2) {
        errors.push('Missing Parameters: ' + msg);
        return Promise.reject(new Error('Could not execute method: callHandler(' + msg + ') - Missing Parameters: 1'));
      }
      const m = JSON.parse(msg); calls.push(m);
      if (m.call === 'subscribe') m.events.forEach((e) => {
        subs.add(e);
        // Like OverlayPlugin's cached event types: new subscribers get the current state at once.
        const cached = (window.__mockCached || {})[e];
        if (cached) setTimeout(() => window.__OverlayCallback && window.__OverlayCallback(cached), 0);
      });
      if (typeof cb === 'function') setTimeout(() => cb('null'), 0);
      return Promise.resolve(null);
    },
  };
  setTimeout(() => { window.OverlayPluginApi.ready = true; }, 400);
  window.__mockPush = (msg) => { if (subs.has(msg.type) && window.__OverlayCallback) window.__OverlayCallback(msg); };
  window.addEventListener('load', () => setTimeout(() =>
    document.dispatchEvent(new CustomEvent('onOverlayStateUpdate', { detail: { isLocked: true } })), 50));
})();`;
const member = (id, name, job, level = 100, inParty = true) => ({ id, name, worldId: 1, job, level, inParty });
function logLine(fields) {
  const line = Array.from({ length: 48 }, () => "");
  Object.entries(fields).forEach(([i, v]) => (line[+i] = v));
  return { type: "LogLine", line, rawLine: line.join("|") };
}
const ts = () => new Date().toISOString();
const ability = (source, actionId, type = "21", targetIndex = "0") =>
  logLine({ 0: type, 1: ts(), 2: source, 3: "x", 4: actionId.toString(16).toUpperCase(), 5: "a", 6: "40000001", 45: targetIndex });

// ---------- browser ----------
const port = 9700 + Math.floor(Math.random() * 90);
const proc = spawn(process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp-"))}`, "--no-first-run", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "about:blank"]);
async function openTab(url, w = 520, h = 400, injectScript = "") {
  let t;
  for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json(); } catch {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id) pending.get(m.id)?.(m); if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description).join(" ")); });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send("Page.enable");
  if (injectScript) await send("Page.addScriptToEvaluateOnNewDocument", { source: injectScript });
  await send("Page.navigate", { url });
  await sleep(300);
  const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  return { send, evaluate, errors };
}

const REQUIRED_EVENTS = ["LogLine", "PartyChanged", "ChangePrimaryPlayer", "ChangeZone"];
let overlay;
if (MODE === "ws") {
  overlay = await openTab(`${base}?OVERLAY_WS=${encodeURIComponent(wsUrl)}&edit=0#/`);
  for (let i = 0; i < 50 && ![...clients].some((c) => c.events.has("LogLine")); i++) await sleep(100);
  check("[ws] overlay connects and subscribes", [...clients].some((c) => REQUIRED_EVENTS.every((e) => c.events.has(e))));
} else {
  // Same URL as in ACT: plain file path, no parameters.
  // Opened while already in a 3-person party: only the cached PartyChanged arrives, nothing else.
  const cachedParty = {
    type: "PartyChanged",
    party: [member("10000001", "骑士A", 19), member("10000004", "白魔C", 24), member("10000005", "龙骑D", 22)],
  };
  overlay = await openTab(`${base}#/`, 520, 400, `${MOCK_API}\nwindow.__mockCached = ${JSON.stringify({ PartyChanged: cachedParty })};`);
  await sleep(1200);
  const cachedRows = await overlay.evaluate("document.querySelectorAll('.row').length");
  check("[embedded] overlay opened mid-party shows the cached party immediately", cachedRows === 3, `${cachedRows} rows`);
  const subs = await overlay.evaluate("[...window.__mockSubs]");
  const calls = await overlay.evaluate("window.__mockCalls");
  const mockErrors = await overlay.evaluate("window.__mockErrors");
  check("[embedded] callHandler always called with the callback (no CefSharp 'Missing Parameters')", mockErrors?.length === 0, JSON.stringify(mockErrors));
  check("[embedded] subscribes all required events", REQUIRED_EVENTS.every((e) => subs?.includes(e)), JSON.stringify(subs));
  check("[embedded] no empty subscribe calls", calls?.every((c) => c.call !== "subscribe" || c.events.length > 0), JSON.stringify(calls));
  check("[embedded] starts locked (lock event after load)", !(await overlay.evaluate("!!document.querySelector('.frame')")));
}
overlayRef = overlay;

const party = [
  member("10000001", "骑士A", 19),
  member("10000002", "战士B", 21),
  member("10000003", "学者·我", 28),
  member("10000004", "白魔C", 24),
  member("10000005", "龙骑D", 22),
  member("1000000A", "龙骑E", 22),
  member("10000006", "诗人F(70级)", 23, 70),
  member("10000007", "青魔G", 36),
  member("10000009", "不在队", 25, 100, false),
];
push({ type: "ChangePrimaryPlayer", charID: 0x10000003, charName: "学者·我" });
push({ type: "PartyChanged", party });
await sleep(500);

const rowAlts = () => overlay.evaluate("[...document.querySelectorAll('.row')].map(r=>[...r.children].map(c=>c.querySelector?.('img')?.alt ?? (c.classList.contains('spacer')?'_':'?')).join('|'))");
const rows = await rowAlts();
check("8 rows (not-in-party member excluded)", rows.length === 8, `${rows.length}`);
const expected = ["疾风怒涛之计", "雪仇", "雪仇", "全大赦", "牵制", "牵制", "行吟", ""];
check("row order: self, tanks, healer, DPS, unsupported job last", expected.every((e, i) => (rows[i] ?? "").split("|")[0] === e || (e === "" && rows[i] === "")), JSON.stringify(rows.map((r) => r.split("|")[0])));
check("level-synced BRD(70): 光明神的最终乐章 slot kept as spacer", (rows[6] ?? "") === "行吟|战斗之声|_", (rows[6] ?? ""));
check("unsupported job (BLU) row is empty but present", (rows[7] ?? "") === "", JSON.stringify((rows[7] ?? "")));

const settings = await openTab(MODE === "ws" ? `${base}?OVERLAY_WS=${encodeURIComponent(wsUrl)}#/settings` : `${base}#/settings`, 735, 760);
await sleep(800);
const liveIds = await settings.evaluate("JSON.parse(localStorage.getItem('skills-monitoring:live-party')).members.map(m=>m.id)");
check("same-job DRGs ordered by ActorID desc (1000000A before 10000005)", liveIds?.indexOf("1000000A") < liveIds?.indexOf("10000005"), JSON.stringify(liveIds));
const shownInSettings = await settings.evaluate("document.querySelectorAll('.current .list li').length");
check("settings page lists current party", shownInSettings === 8, `${shownInSettings}`);

// Casts
push(ability("10000001", 7535)); // PLD 雪仇
push(ability("10000006", 7405, "22", "0")); // BRD 行吟 AOE first target
push(ability("10000006", 7405, "22", "1")); // same cast, second target: ignored
push(ability("1000000A", 7549)); // DRG E 牵制
push(ability("10000003", 25868)); // SCH 疾风怒涛之计
push(ability("10009999", 7535)); // non-member: ignored
push(ability("10000002", 9)); // unwatched action: ignored
await sleep(1500);
const cd = () => overlay.evaluate("[...document.querySelectorAll('.row')].map(r=>[...r.children].map(c=>c.querySelector?.('.countdown')?.textContent?.trim() ?? '').join('|'))");
let texts = await cd();
check("PLD 雪仇 shows duration", /^1[34]\|/.test((texts[1] ?? "")), (texts[1] ?? ""));
check("WAR untouched", (texts[2] ?? "").replace(/\|/g, "") === "", (texts[2] ?? ""));
check("BRD 行吟 counted once and shows duration", /^1[34]\|/.test((texts[6] ?? "")), (texts[6] ?? ""));
check("only DRG E (1000000A) has 牵制 running", (texts[4] ?? "").startsWith("1") && (texts[5] ?? "").replace(/\|/g, "") === "", `${(texts[4] ?? "")} / ${(texts[5] ?? "")}`);
check("self SCH 疾风怒涛之计 running", /^1[89]\|/.test((texts[0] ?? "")), (texts[0] ?? ""));

// Re-sort from settings (manual order) must keep cooldown progress
await settings.evaluate("[...document.querySelectorAll('.current .list li')][0].querySelector('button[title=\"下移\"]').click()");
await sleep(600);
texts = await cd();
const rowsAfter = await rowAlts();
check("manual move applied (PLD row now first)", (rowsAfter[0] ?? "").startsWith("雪仇|圣光幕帘"), (rowsAfter[0] ?? ""));
check("cooldowns survive re-sort", /^1\d\|/.test((texts[0] ?? "")) && /^1\d\|/.test((texts[1] ?? "")), `${(texts[0] ?? "")} / ${(texts[1] ?? "")}`);

// Wipe
push(logLine({ 0: "33", 1: ts(), 2: "80030001", 3: "40000010" }));
await sleep(400);
texts = await cd();
check("wipe (33 / 40000010) clears all cooldowns", texts.join("").replace(/\|/g, "") === "", texts.join(" "));

// Zone change
push(ability("10000001", 7535));
await sleep(300);
push({ type: "ChangeZone", zoneID: 1, zoneName: "x" });
await sleep(400);
texts = await cd();
check("zone change clears cooldowns", texts.join("").replace(/\|/g, "") === "", texts.join(" "));

// Party change: BLU leaves
push({ type: "PartyChanged", party: party.filter((m) => m.id !== "10000007") });
await sleep(500);
check("member leaving removes the row", (await rowAlts()).length === 7);
const liveCount = await settings.evaluate("document.querySelectorAll('.current .list li').length");
check("settings page follows party change", liveCount === 7, `${liveCount}`);

// Locked vs unlocked chrome
check("locked: no frame / hint", !(await overlay.evaluate("!!document.querySelector('.frame')")));
await overlay.evaluate("document.dispatchEvent(new CustomEvent('onOverlayStateUpdate',{detail:{isLocked:false}}))");
await sleep(300);
check("unlocked: frame + hint shown", await overlay.evaluate("document.querySelector('.frame .hint')?.textContent === '右键打开设置'"));
check("unlocked with a real party: no demo party", (await rowAlts()).length === 7);
const opened = await overlay.evaluate("(()=>{let args; const o=window.open; window.open=(...a)=>{args=a; return null}; const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true}); document.querySelector('.overlay').dispatchEvent(e); window.open=o; return {args, prevented: e.defaultPrevented}})()");
check("right-click opens settings at 735px and suppresses the browser menu", opened?.prevented && opened.args?.[0]?.includes("#/settings") && opened.args?.[2]?.includes("width=735"), JSON.stringify(opened));

// Solo, as real OverlayPlugin reports it: a one-member party containing only ourselves.
push({ type: "PartyChanged", party: [member("10000003", "学者·我", 28)] });
await sleep(500);
check("unlocked + solo → demo party for calibration", (await rowAlts()).length === 8);
await overlay.evaluate("document.dispatchEvent(new CustomEvent('onOverlayStateUpdate',{detail:{isLocked:true}}))");
await sleep(300);
const soloRows = await rowAlts();
check("locked + solo → own row shown", soloRows.length === 1 && soloRows[0].startsWith("疾风怒涛之计"), JSON.stringify(soloRows));
push(ability("10000003", 7436)); // 连环计
await sleep(800);
check("solo cast counts down", /\d/.test((await cd())[0] ?? ""), (await cd())[0]);

// Charge skill, as reported in game: solo RDM Lv100 casting 促进 (2 charges from Lv88) twice.
// The second cast must only spend a charge; the recovery countdown keeps running.
const savedSettings = await settings.evaluate("localStorage.getItem('skills-monitoring:settings')");
const savedLayout = await settings.evaluate("localStorage.getItem('skills-monitoring:layout')");
await settings.evaluate(`localStorage.setItem('skills-monitoring:settings', JSON.stringify({ version: 2, watchActions: { 35: [7518] } }));
  localStorage.setItem('skills-monitoring:layout', JSON.stringify({ showDuration: false }));`);
await sleep(400);
push({ type: "PartyChanged", party: [member("10000003", "赤魔·我", 35)] });
await sleep(400);
const iconText = () => overlay.evaluate("(() => { const s = document.querySelector('.row .skill'); return s && { cd: s.querySelector('.countdown')?.textContent?.trim() ?? '', charges: s.querySelector('.charges')?.textContent?.trim() ?? '' }; })()");
const beforeCast = await iconText();
check("促进 at Lv100 shows 2 charges", beforeCast?.charges === "2", JSON.stringify(beforeCast));
push(ability("10000003", 7518));
await sleep(1200);
const afterFirst = await iconText();
check("first cast: 1 charge left, 55 s recovery starts", afterFirst?.charges === "1" && /^5[45]$/.test(afterFirst.cd), JSON.stringify(afterFirst));
await sleep(2500);
push(ability("10000003", 7518));
await sleep(600);
const afterSecond = await iconText();
check("second cast: 0 charges, recovery countdown NOT restarted", afterSecond?.charges === "0" && Number(afterSecond.cd) <= 52, JSON.stringify(afterSecond));
await settings.evaluate(`(() => {
  // Other windows ignore removals, so "nothing saved" is restored as an empty object (= defaults).
  const restore = (k, v) => localStorage.setItem(k, v ?? '{}');
  restore('skills-monitoring:settings', ${JSON.stringify(savedSettings)});
  restore('skills-monitoring:layout', ${JSON.stringify(savedLayout)});
})()`);
await sleep(400);

// A stand-in's slot (default DNC slot 四色技巧舞步结束): the 120 s timer starts with 技巧舞步,
// whose button it replaces while dancing; the 20 s buff starts with the finish.
push({ type: "PartyChanged", party: [member("10000003", "舞者·我", 38)] });
await sleep(400);
const finishSlot = () => overlay.evaluate("(() => { const s = document.querySelectorAll('.row .skill')[1]; const c = s?.querySelector('.countdown'); return s && { alt: s.querySelector('img')?.alt, cd: c?.textContent?.trim() ?? '', buff: !!c?.classList.contains('active') }; })()");
push(ability("10000003", 15998)); // 技巧舞步
await sleep(800);
const afterStep = await finishSlot();
check("技巧舞步 starts the finish slot's 120 s cooldown, no buff yet", afterStep?.alt === "四色技巧舞步结束" && afterStep.cd === "2m" && !afterStep.buff, JSON.stringify(afterStep));
await sleep(1500);
push(ability("10000003", 16196)); // 四色技巧舞步结束
await sleep(800);
const afterFinish = await finishSlot();
check("四色技巧舞步结束 starts the 20 s buff", /^(19|20)$/.test(afterFinish?.cd ?? "") && afterFinish.buff, JSON.stringify(afterFinish));

push({ type: "PartyChanged", party });
await overlay.evaluate("document.dispatchEvent(new CustomEvent('onOverlayStateUpdate',{detail:{isLocked:false}}))");
push(ability("10000001", 7535));
push(ability("10000006", 7405, "22", "0"));
await sleep(2500);
await overlay.evaluate("document.body.style.background='#4a5566'");
const shot = await overlay.send("Page.captureScreenshot", { format: "png" });
writeFileSync(join(tmpdir(), "skills-monitoring-e2e.png"), Buffer.from(shot.result.data, "base64"));

check("no JS errors in overlay", overlay.errors.length === 0, overlay.errors.join(" / "));
check("no JS errors in settings", settings.errors.length === 0, settings.errors.join(" / "));
console.log(results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
proc.kill();
wss.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
