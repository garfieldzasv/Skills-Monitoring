/**
 * Builds src/data/generated/actions.json from game data (see scripts/game-data/sources.ts).
 *
 * Usage: pnpm import-data [--xivapi <version name|key>] [--cn <git ref>]
 *        defaults: the latest XIVAPI version and the latest Chinese export.
 *
 * Per action it derives everything the overlay needs, at every level 1-100:
 *   name        Chinese client's Action name (checked against the global row: same icon and level)
 *   recast      Action.Recast100ms, then trait "Reduces X recast time to N seconds"
 *   charges     the tooltip's 积蓄次数 at that level/job (description macros), else Action.MaxCharges;
 *               cross-checked against trait "Maximum Charges" / "Allows a third charge" texts
 *   durations   every 持续时间 of the tooltip at that level/job, in tooltip order
 *   recastGroup Action.CooldownGroup: actions sharing one are one recast timer in game
 *   upgradesTo  trait "Upgrades X to Y"
 *   replaces    ActionIndirection: a timer-less stand-in for another action's button
 *
 * Anything the rules cannot place (unknown macros, unresolved trait names, CN/global mismatch)
 * stops the import with a list, rather than writing doubtful data.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ALL_JOB_IDS, getJob, toAdvancedJob } from "../src/core/game/jobs";
import { compressLevelSamples, MAX_LEVEL, type LevelValue } from "../src/core/game/levelValue";
import type { GeneratedActions, GeneratedAction } from "../src/core/game/actions";
import { compileTooltip } from "./game-data/seString";
import {
  Cache,
  cnCsvUrl,
  cnRows,
  downloadText,
  resolveCnCommit,
  resolveXivapiVersion,
  xivapiRows,
  xivapiSearch,
  xivapiSheet,
} from "./game-data/sources";
import { parseCharges, parseRecasts, parseUpgrades, sentences } from "./game-data/traits";

const root = resolve(import.meta.dirname, "..");
const outFile = join(root, "src/data/generated/actions.json");
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** Recast group shared by every GCD; an action whose own timer is only this has no cooldown of its own. */
const GCD_GROUP = 58;

const problems: string[] = [];
const problem = (msg: string) => problems.push(msg);

// ---------- download ----------

const version = await resolveXivapiVersion(arg("xivapi") ?? "latest");
const cn = await resolveCnCommit(arg("cn") ?? "master");
const cache = new Cache(join(root, "node_modules/.cache/game-data", `${version.key}-${cn.sha.slice(0, 12)}`));
console.log(`XIVAPI ${version.names.join("/")} (${version.key}); CN export ${cn.sha.slice(0, 12)} "${cn.message}"`);

const jobAbbr = new Map(ALL_JOB_IDS.map((id) => [getJob(id)!.abbr, id]));

interface CategoryFields {
  [abbr: string]: boolean;
}
const categories = await cache.json("ClassJobCategory.json", () =>
  xivapiSheet<CategoryFields>(version.key, "ClassJobCategory", [...jobAbbr.keys()]),
);
const jobsOfCategory = new Map(
  categories.map((r) => [
    r.row_id,
    [...jobAbbr].filter(([abbr]) => r.fields[abbr]).map(([, id]) => id).sort((a, b) => a - b),
  ]),
);

interface ActionFields {
  Name: string;
  "Icon@as(raw)": number;
  "ClassJob@as(raw)": number;
  "ClassJobCategory@as(raw)": number;
  ClassJobLevel: number;
  IsPlayerAction: boolean;
  Recast100ms: number;
  CooldownGroup: number;
  AdditionalCooldownGroup: number;
  MaxCharges: number;
}
const actionRows = await cache.json("Action.json", () =>
  xivapiSearch<ActionFields>(
    version.key,
    "Action",
    "+IsPvP=false +ClassJobLevel>0 +ActionCategory>=2 +ActionCategory<=4",
    [
      "Name",
      "Icon@as(raw)",
      "ClassJob@as(raw)",
      "ClassJobCategory@as(raw)",
      "ClassJobLevel",
      "IsPlayerAction",
      "Recast100ms",
      "CooldownGroup",
      "AdditionalCooldownGroup",
      "MaxCharges",
    ],
  ),
);

interface TraitFields {
  Name: string;
  Level: number;
  "ClassJob@as(raw)": number;
  "ClassJobCategory@as(raw)": number;
}
const traitRows = await cache.json("Trait.json", () =>
  xivapiSearch<TraitFields>(version.key, "Trait", "+Level>0", [
    "Name",
    "Level",
    "ClassJob@as(raw)",
    "ClassJobCategory@as(raw)",
  ]),
);
const traitText = new Map(
  (
    await cache.json("TraitTransient.json", () =>
      xivapiSheet<{ Description: string }>(version.key, "TraitTransient", ["Description"]),
    )
  ).map((r) => [r.row_id, r.fields.Description]),
);

const cnAction = cnRows(await cache.text("cn-Action.csv", () => downloadText(cnCsvUrl(cn.sha, "Action"))));
const cnTransient = cnRows(
  await cache.text("cn-ActionTransient.csv", () => downloadText(cnCsvUrl(cn.sha, "ActionTransient"))),
);
// Raw column positions in the CN export (SaintCoinach's names for them are stale, see sources.ts).
const CN = { name: 1, icon: 3, level: 13 } as const;

// ---------- actions ----------

interface Row {
  id: number;
  en: string;
  name: string;
  icon: number;
  jobs: number[];
  level: number;
  isPlayerAction: boolean;
  recast: number;
  maxCharges: number;
  group: number;
}

const rows = new Map<number, Row>();
for (const { row_id: id, fields: f } of actionRows) {
  const jobs = jobsOfCategory.get(f["ClassJobCategory@as(raw)"]) ?? [];
  if (jobs.length === 0 || !f.Name) continue;
  // Player actions, plus job actions only reached by replacement (e.g. the dance finishes:
  // ClassJob 0, IsPlayerAction false) as long as they run a recast timer. ClassJob -1 rows are
  // pets, shadows and duty actions; timer-less ClassJob 0 rows are effect variants.
  if (!f.IsPlayerAction && (f["ClassJob@as(raw)"] < 0 || f.CooldownGroup === 0)) continue;
  const cnCells = cnAction.get(id);
  const name = cnCells?.[CN.name] ?? "";
  if (!cnCells || !name) {
    problem(`#${id} ${f.Name}: no Chinese name in the CN export`);
    continue;
  }
  // Same row in both clients: the translation belongs to this action, not to a shifted row.
  if (Number(cnCells[CN.icon]) !== f["Icon@as(raw)"] || Number(cnCells[CN.level]) !== f.ClassJobLevel) {
    problem(
      `#${id} ${f.Name}/${name}: CN row differs (icon ${cnCells[CN.icon]} vs ${f["Icon@as(raw)"]}, ` +
        `level ${cnCells[CN.level]} vs ${f.ClassJobLevel}); the two exports are not the same patch?`,
    );
    continue;
  }
  const ownGroup = f.CooldownGroup !== GCD_GROUP ? f.CooldownGroup : f.AdditionalCooldownGroup;
  rows.set(id, {
    id,
    en: f.Name,
    name,
    icon: f["Icon@as(raw)"],
    jobs,
    level: f.ClassJobLevel,
    isPlayerAction: f.IsPlayerAction,
    recast: f.Recast100ms / 10,
    maxCharges: Math.max(1, f.MaxCharges),
    group: ownGroup === GCD_GROUP ? 0 : ownGroup,
  });
}

const enDescription = new Map(
  (
    await cache.json("ActionTransient.json", () =>
      xivapiRows<{ Description: string }>(version.key, "ActionTransient", [...rows.keys()], ["Description"]),
    )
  ).map((r) => [r.row_id, r.fields.Description ?? ""]),
);

/**
 * Button stand-ins (ActionIndirection, e.g. 技巧舞步 → 四色技巧舞步结束 while dancing) that have
 * no timer of their own: the timer belongs to the action whose button they replace, which spent
 * it when it was used. stand-in → that action.
 */
const replaces = new Map<number, number>();
for (const { fields: f } of await cache.json("ActionIndirection.json", () =>
  xivapiSheet<{ "Name@as(raw)": number; "PreviousComboAction@as(raw)": number }>(version.key, "ActionIndirection", [
    "Name@as(raw)",
    "PreviousComboAction@as(raw)",
  ]),
)) {
  const standIn = rows.get(f["Name@as(raw)"]);
  const owner = rows.get(f["PreviousComboAction@as(raw)"]);
  if (!standIn || !owner || standIn.group !== 0 || owner.group === 0) continue;
  const previous = replaces.get(standIn.id);
  if (previous !== undefined && previous !== owner.id) problem(`#${standIn.id} ${standIn.name} stands in for both #${previous} and #${owner.id}`);
  replaces.set(standIn.id, owner.id);
}

/** Actions the game only ever swaps in (tooltip: "※This action cannot be assigned to a hotbar."). */
const replacementOnly = (id: number) => /cannot be assigned to a hotbar/.test(enDescription.get(id) ?? "");

/** Advanced jobs an action is evaluated for; base classes use their job's values. */
const evalJobs = (row: Row) => [...new Set(row.jobs.map(toAdvancedJob))];

/**
 * English name → action of one of `jobs`, preferring real player actions over same-named
 * variants. Case-insensitive: trait texts capitalise "The Forbidden Chakra", the action does not.
 */
function findAction(en: string, jobs: readonly number[]): Row | undefined {
  const key = en.toLowerCase();
  const matches = [...rows.values()].filter((r) => r.en.toLowerCase() === key && r.jobs.some((j) => jobs.includes(j)));
  if (matches.length <= 1) return matches[0];
  const player = matches.filter((r) => r.isPlayerAction);
  return (player.length > 0 ? player : matches).sort((a, b) => a.id - b.id)[0];
}

// ---------- traits ----------

interface Trait {
  id: number;
  name: string;
  level: number;
  jobs: number[];
  text: string;
}
const traits: Trait[] = traitRows
  .map(({ row_id: id, fields: f }) => {
    const byCategory = jobsOfCategory.get(f["ClassJobCategory@as(raw)"]) ?? [];
    const single = f["ClassJob@as(raw)"];
    const jobs = byCategory.length > 0 ? byCategory : getJob(single) ? [single, toAdvancedJob(single)] : [];
    return { id, name: f.Name, level: f.Level, jobs: [...new Set(jobs)], text: traitText.get(id) ?? "" };
  })
  .filter((t) => t.jobs.length > 0 && t.text);

/** actionId → job → [level, seconds][] */
const recastSteps = new Map<number, Map<number, Array<[number, number]>>>();
const upgradesTo = new Map<number, number>();
const chargeClaims: Array<{ trait: Trait; row: Row; charges: number }> = [];

for (const trait of traits) {
  const where = `trait #${trait.id} ${trait.name} (Lv${trait.level})`;
  for (const { action, seconds } of parseRecasts(trait.text)) {
    const row = findAction(action, trait.jobs);
    if (!row) {
      problem(`${where}: recast target "${action}" not found`);
      continue;
    }
    const byJob = recastSteps.get(row.id) ?? new Map<number, Array<[number, number]>>();
    for (const job of trait.jobs.map(toAdvancedJob)) {
      byJob.set(job, [...(byJob.get(job) ?? []), [trait.level, seconds]]);
    }
    recastSteps.set(row.id, byJob);
  }
  for (const { from, to } of parseUpgrades(trait.text)) {
    const lower = findAction(from, trait.jobs);
    const upper = findAction(to, trait.jobs);
    // Statuses are upgraded with the same wording ("Blood of the Dragon to Life of the Dragon").
    if (!lower && !upper) continue;
    if (!lower || !upper) {
      problem(`${where}: upgrade "${from}" → "${to}" resolves only one side`);
      continue;
    }
    // Some traits describe an in-combat replacement with the same wording ("Upgrades Bloodspiller
    // to Scarlet Delirium", which only exists under Delirium): the upper action then cannot be put
    // on a hotbar while the lower one can. A real upgrade keeps the slot as it is.
    if (replacementOnly(upper.id) && !replacementOnly(lower.id)) continue;
    const previous = upgradesTo.get(lower.id);
    if (previous !== undefined && previous !== upper.id) problem(`${where}: #${lower.id} upgrades to both #${previous} and #${upper.id}`);
    upgradesTo.set(lower.id, upper.id);
  }
  for (const { action, charges } of parseCharges(trait.text)) {
    const row = findAction(action, trait.jobs);
    if (row) chargeClaims.push({ trait, row, charges });
    else problem(`${where}: charge target "${action}" not found`);
  }
  // A fixed recast ("… to N seconds") that matched no rule means a rule is missing. Conditional
  // reductions ("by 5 seconds upon …") are effects in combat, not data, and are left out.
  for (const s of sentences(trait.text)) {
    if (/recast/.test(s) && /\bto \d+ seconds?\b/.test(s) && parseRecasts(s).length === 0) problem(`${where}: unparsed "${s}"`);
  }
}

// ---------- per-level values ----------

const levels = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

/** Per level (index 0 = level 1): the charges, and every 持续时间 in tooltip order. */
function tooltipSamples(row: Row, job: number): { charges: number[]; durations: number[][] } {
  const raw = cnTransient.get(row.id)?.[1] ?? "";
  let render: (ctx: { job: number; level: number }) => string;
  try {
    render = compileTooltip(raw);
  } catch (err) {
    problem(`#${row.id} ${row.name}: ${(err as Error).message}`);
    render = () => "";
  }
  const charges: number[] = [];
  const durations: number[][] = [];
  for (const lv of levels) {
    // Below its level the action is not usable; its first learnt values stand in.
    const text = render({ job, level: Math.max(lv, row.level) });
    const c = /积蓄次数：(\d+)/.exec(text);
    charges.push(c ? Number(c[1]) : row.maxCharges);
    durations.push([...text.matchAll(/持续时间：(\d+)(秒|分钟)/g)].map((m) => Number(m[1]) * (m[2] === "分钟" ? 60 : 1)));
  }
  return { charges, durations };
}

/** Effect i over levels, 0 where the tooltip has fewer effects at that level. */
const nthDuration = (samples: number[][], i: number) => samples.map((list) => list[i] ?? 0);

function recastSamples(row: Row, job: number): number[] {
  const steps = [...(recastSteps.get(row.id)?.get(job) ?? [])].sort((a, b) => a[0] - b[0]);
  return levels.map((lv) => steps.filter(([at]) => at <= lv).at(-1)?.[1] ?? row.recast);
}

/** One value for all jobs of the action; jobs disagreeing is reported (no such case so far). */
function perJob(row: Row, sample: (job: number) => number[], field: string): LevelValue {
  const byJob = evalJobs(row).map((job) => ({ job, value: compressLevelSamples(sample(job)) }));
  const first = JSON.stringify(byJob[0]!.value);
  const differing = byJob.filter((x) => JSON.stringify(x.value) !== first);
  if (differing.length > 0) {
    problem(`#${row.id} ${row.name}: ${field} differs by job: ${byJob.map((x) => `${x.job}=${JSON.stringify(x.value)}`).join(" ")}`);
  }
  return byJob[0]!.value;
}

const actions: Record<number, GeneratedAction> = {};
for (const row of rows.values()) {
  const tooltip = new Map(evalJobs(row).map((job) => [job, tooltipSamples(row, job)]));
  const entry: GeneratedAction = {
    name: row.name,
    icon: row.icon,
    jobs: row.jobs,
    level: row.level,
    recastGroup: row.group,
    recast: perJob(row, (job) => recastSamples(row, job), "recast"),
    charges: perJob(row, (job) => tooltip.get(job)!.charges, "charges"),
    durations: Array.from(
      { length: Math.max(0, ...[...tooltip.values()].flatMap((t) => t.durations.map((d) => d.length))) },
      (_, i) => perJob(row, (job) => nthDuration(tooltip.get(job)!.durations, i), `duration #${i + 1}`),
    ),
  };
  const upper = upgradesTo.get(row.id);
  if (upper !== undefined) entry.upgradesTo = upper;
  const owner = replaces.get(row.id);
  if (owner !== undefined) entry.replaces = owner;
  actions[row.id] = entry;
}

// Two independent statements of the game must agree: trait text vs the action's tooltip.
for (const { trait, row, charges } of chargeClaims) {
  for (const job of trait.jobs.map(toAdvancedJob).filter((j) => evalJobs(row).includes(j))) {
    const got = tooltipSamples(row, job).charges[Math.max(trait.level, row.level) - 1];
    if (got !== charges) {
      problem(`trait #${trait.id} ${trait.name}: ${row.name} has ${charges} charges at Lv${trait.level}, tooltip says ${got}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s), nothing written:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

// ---------- write ----------

const output: GeneratedActions = {
  source: {
    xivapi: `${version.names.join("/")} ${version.key}`,
    cn: `${cn.sha} ${cn.message}`,
  },
  actions,
};

const previous = existsSync(outFile) ? (JSON.parse(readFileSync(outFile, "utf8")) as Partial<GeneratedActions>) : {};
if (previous.actions) {
  const changes: string[] = [];
  for (const [id, a] of Object.entries(actions)) {
    const before = previous.actions[Number(id)];
    if (!before) changes.push(`+ #${id} ${a.name}`);
    else if (JSON.stringify(before) !== JSON.stringify(a)) {
      const keys = (Object.keys({ ...before, ...a }) as (keyof GeneratedAction)[]).filter(
        (k) => JSON.stringify(before[k]) !== JSON.stringify(a[k]),
      );
      changes.push(`~ #${id} ${a.name}: ${keys.map((k) => `${k} ${JSON.stringify(before[k])} → ${JSON.stringify(a[k])}`).join("; ")}`);
    }
  }
  for (const id of Object.keys(previous.actions)) if (!(id in actions)) changes.push(`- #${id} ${previous.actions[Number(id)]!.name}`);
  console.log(changes.length > 0 ? `Changes since the previous import:\n  ${changes.join("\n  ")}` : "No changes.");
}

writeFileSync(outFile, `${JSON.stringify(output)}\n`, "utf8");
console.log(`Wrote ${Object.keys(actions).length} actions, ${upgradesTo.size} upgrades → ${outFile}`);
