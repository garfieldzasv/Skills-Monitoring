/**
 * Download layer for the game-data import. Both sources are exports of the game client:
 *
 * - XIVAPI (https://v2.xivapi.com): the global client's sheets with EXDSchema column names.
 *   Used for every structural and numeric column.
 * - thewakingsands/ffxiv-datamining-cn: SaintCoinach CSV exports of the Chinese client.
 *   Used only for Chinese strings (action names, and descriptions with their level macros,
 *   which XIVAPI renders away). Its CSV headers are not trusted: columns are read by raw index.
 *
 * Every download is pinned (XIVAPI version key, git commit) and cached on disk, so re-running the
 * import is cheap and reproducible.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const XIVAPI = "https://v2.xivapi.com/api";
const CN_REPO = "thewakingsands/ffxiv-datamining-cn";

export class Cache {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  async text(name: string, load: () => Promise<string>): Promise<string> {
    const file = join(this.dir, name);
    if (existsSync(file)) return readFileSync(file, "utf8");
    const text = await load();
    writeFileSync(file, text, "utf8");
    return text;
  }

  async json<T>(name: string, load: () => Promise<T>): Promise<T> {
    return JSON.parse(await this.text(name, async () => JSON.stringify(await load()))) as T;
  }
}

async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": "skills-monitoring-import" } });
    if (res.ok) return res.text();
    // Be gentle with a shared public service: back off on rate limits and transient errors.
    if (attempt >= 5 || (res.status !== 429 && res.status < 500)) {
      throw new Error(`GET ${url} → ${res.status} ${await res.text()}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

const fetchJson = async <T>(url: string) => JSON.parse(await fetchText(url)) as T;

// ---------- XIVAPI ----------

export interface XivapiVersion {
  key: string;
  names: string[];
}

/** Resolves a version name ("7.56x1", "latest") to its immutable key. */
export async function resolveXivapiVersion(name: string): Promise<XivapiVersion> {
  const { versions } = await fetchJson<{ versions: XivapiVersion[] }>(`${XIVAPI}/version`);
  const found = versions.find((v) => v.names.includes(name) || v.key === name);
  if (!found) throw new Error(`Unknown XIVAPI version "${name}"`);
  return found;
}

export interface XivapiRow<F> {
  row_id: number;
  fields: F;
  transient?: Record<string, unknown>;
}

/** Every row of a sheet matching `query` (XIVAPI search syntax), following result cursors. */
export async function xivapiSearch<F>(
  version: string,
  sheet: string,
  query: string,
  fields: readonly string[],
): Promise<XivapiRow<F>[]> {
  const rows: XivapiRow<F>[] = [];
  let url =
    `${XIVAPI}/search?version=${version}&sheets=${sheet}&limit=500` +
    `&query=${encodeURIComponent(query)}&fields=${fields.join(",")}`;
  for (;;) {
    const page = await fetchJson<{ next?: string; results: XivapiRow<F>[] }>(url);
    rows.push(...page.results);
    if (!page.next || page.results.length === 0) break;
    // The cursor carries the query but not the field selection.
    url = `${XIVAPI}/search?version=${version}&limit=500&cursor=${page.next}&fields=${fields.join(",")}`;
  }
  return rows.sort((a, b) => a.row_id - b.row_id);
}

/** Every row of a sheet, paged by row id. */
export async function xivapiSheet<F>(version: string, sheet: string, fields: readonly string[]): Promise<XivapiRow<F>[]> {
  const rows: XivapiRow<F>[] = [];
  for (let after = -1; ; ) {
    const url =
      `${XIVAPI}/sheet/${sheet}?version=${version}&limit=500` +
      `${after >= 0 ? `&after=${after}` : ""}&fields=${fields.join(",")}`;
    const page = await fetchJson<{ rows: XivapiRow<F>[] }>(url);
    if (page.rows.length === 0) break;
    rows.push(...page.rows);
    after = page.rows[page.rows.length - 1]!.row_id;
  }
  return rows;
}

/** Specific rows of a sheet. */
export async function xivapiRows<F>(
  version: string,
  sheet: string,
  ids: readonly number[],
  fields: readonly string[],
): Promise<XivapiRow<F>[]> {
  const rows: XivapiRow<F>[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const url =
      `${XIVAPI}/sheet/${sheet}?version=${version}&rows=${ids.slice(i, i + 100).join(",")}` +
      `&fields=${fields.join(",")}`;
    rows.push(...(await fetchJson<{ rows: XivapiRow<F>[] }>(url)).rows);
  }
  return rows;
}

// ---------- Chinese client export ----------

export interface CnCommit {
  sha: string;
  message: string;
}

export async function resolveCnCommit(ref: string): Promise<CnCommit> {
  const c = await fetchJson<{ sha: string; commit: { message: string } }>(
    `https://api.github.com/repos/${CN_REPO}/commits/${ref}`,
  );
  return { sha: c.sha, message: c.commit.message.split("\n")[0]! };
}

export function cnCsvUrl(sha: string, sheet: string): string {
  return `https://raw.githubusercontent.com/${CN_REPO}/${sha}/${sheet}.csv`;
}

export const downloadText = fetchText;

/** Minimal RFC 4180 parser: quoted fields may contain commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * SaintCoinach CSV → row id → raw columns. Lines 1-3 are the raw column indexes, the (possibly
 * stale) column names and types; data starts at line 4. `cells[0]` is the row id, so raw column
 * `n` (as numbered on line 1) is `cells[n + 1]`.
 */
export function cnRows(csv: string): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const cells of parseCsv(csv).slice(3)) {
    if (cells[0] === "" || cells[0] === undefined) continue;
    map.set(Number(cells[0]), cells);
  }
  return map;
}
