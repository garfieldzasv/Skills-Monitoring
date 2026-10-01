import { CooldownTracker } from "@/core/cooldown/cooldownTracker";
import { getJob, toAdvancedJob, type JobInfo } from "@/core/game/jobs";
import { evalLevelValue } from "@/core/game/levelValue";
import { resolveSkill, shownDuration, type ResolvedSkill } from "@/core/game/skillMeta";
import { getAction } from "@/core/game/actions";
import { recastKey, timerOwner } from "@/core/game/upgrades";
import type { GameEventConsumer, GaugeContext } from "@/core/gauges/types";
import { AbilityField, ActorControlField, LineType, WIPE_COMMANDS } from "@/core/logline/fields";
import { eventTypeOfLine, parseLogLine, type GameEventType } from "@/core/logline/parse";
import { sortParty, type PartyMember } from "@/core/party/sortParty";
import type { Settings } from "@/core/settings/schema";

export const MAX_ROWS = 8;

export interface SkillSlot {
  /** Undefined when this member has no tier of the configured action (the slot stays empty). */
  skill?: ResolvedSkill;
  /** Cooldown tracker key; set together with `skill`. */
  key?: string;
}

export interface MemberRow {
  member: PartyMember;
  /** Undefined for unsupported jobs: the row still occupies its place. */
  job?: JobInfo;
  slots: SkillSlot[];
}

export interface EngineOptions {
  now?: () => number;
}

interface CastTarget {
  key: string;
  /** See ResolvedSkill.effectOnTimerUse. */
  effectOnTimerUse: boolean;
  /** The member's level, for the effects of casts. */
  level: number;
}

/** One tracker entry per member and game recast timer (see {@link recastKey}). */
export const cooldownKey = (ownerId: string, key: string) => `${ownerId}:${key}`;

/**
 * Framework-agnostic orchestrator: party + settings → display rows, log lines → cooldowns.
 * UI layers subscribe to row changes and read per-skill state from {@link cooldowns}.
 */
export class MonitorEngine {
  readonly cooldowns = new CooldownTracker();
  private readonly now: () => number;

  private party: PartyMember[] = [];
  private selfId = "";
  private settings: Settings;
  private rows: MemberRow[] = [];
  private readonly rowListeners = new Set<(rows: readonly MemberRow[]) => void>();

  /** casterId → recast key → watched entry; the hot path for ability lines. */
  private castIndex = new Map<string, Map<string, CastTarget>>();
  private readonly consumers: GameEventConsumer[] = [];
  private consumerEventTypes = new Set<GameEventType>();
  private readonly gaugeContext: GaugeContext;

  constructor(settings: Settings, options: EngineOptions = {}) {
    this.settings = settings;
    this.now = options.now ?? Date.now;
    this.gaugeContext = {
      now: this.now,
      adjustCooldown: (ownerId, actionId, deltaMs) => {
        const key = recastKey(actionId);
        if (key) this.cooldowns.adjust(cooldownKey(ownerId, key), deltaMs, this.now());
      },
    };
  }

  // ---------- inputs ----------

  setParty(members: readonly PartyMember[]): void {
    this.party = members.map((m) => ({ ...m, id: m.id.toUpperCase() }));
    this.rebuild();
  }

  setSelf(id: string): void {
    const upper = id.toUpperCase();
    if (upper === this.selfId) return;
    this.selfId = upper;
    this.rebuild();
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.rebuild();
  }

  addConsumer(consumer: GameEventConsumer): void {
    this.consumers.push(consumer);
    this.consumerEventTypes = new Set(this.consumers.flatMap((c) => [...c.eventTypes]));
  }

  /**
   * Called for every OverlayPlugin log line (hundreds per second in raids), so lines that
   * nobody cares about are rejected before any parsing or allocation.
   */
  handleLogLine(line: readonly string[]): void {
    const type = line[0];
    if (type === LineType.Ability || type === LineType.AOEAbility) this.handleAbility(line);
    else if (type === LineType.ActorControl && WIPE_COMMANDS.has(line[ActorControlField.command] ?? "")) this.reset();

    if (this.consumers.length === 0) return;
    const eventType = eventTypeOfLine(type);
    if (!eventType || !this.consumerEventTypes.has(eventType)) return;
    const event = parseLogLine(line);
    if (!event) return;
    for (const c of this.consumers) if (c.eventTypes.has(event.type)) c.onEvent(event, this.gaugeContext);
  }

  /** Zone change or wipe. */
  reset(): void {
    this.cooldowns.resetAll();
    for (const c of this.consumers) c.reset();
  }

  /** Demo helper: behaves exactly like seeing the cast in the log. */
  simulateCast(ownerId: string, actionId: number): void {
    this.useSkill(ownerId.toUpperCase(), actionId);
  }

  // ---------- outputs ----------

  getRows(): readonly MemberRow[] {
    return this.rows;
  }

  onRowsChange(listener: (rows: readonly MemberRow[]) => void): () => void {
    this.rowListeners.add(listener);
    return () => this.rowListeners.delete(listener);
  }

  // ---------- internals ----------

  private handleAbility(line: readonly string[]): void {
    // AOE abilities log one line per target; only the first one counts as the cast.
    if (line[0] === LineType.AOEAbility && line[AbilityField.targetIndex] !== "0") return;
    const sourceId = line[AbilityField.sourceId];
    if (!sourceId) return;
    const actionId = Number.parseInt(line[AbilityField.id] ?? "", 16);
    if (Number.isFinite(actionId)) this.useSkill(sourceId.toUpperCase(), actionId);
  }

  private useSkill(ownerId: string, actionId: number): void {
    const action = getAction(actionId);
    const target = action && this.castIndex.get(ownerId)?.get(recastKey(actionId)!);
    if (!target) return;
    if (timerOwner(action) === action) {
      this.cooldowns.use(target.key, this.now(), target.effectOnTimerUse);
      return;
    }
    // A stand-in (e.g. 四色技巧舞步结束) does not spend the timer: the action whose button it
    // replaces already did. For a slot that shows a stand-in, a stand-in with an effect of its
    // own starts the countdown (any of the four finishes; not 提拉纳, which has none).
    if (!target.effectOnTimerUse && evalLevelValue(shownDuration(action), target.level) > 0) {
      this.cooldowns.startEffect(target.key, this.now());
    }
  }

  private rebuild(): void {
    const now = this.now();
    const { partySort, manualOrders, watchActions, skillOverrides } = this.settings;
    const ordered = sortParty(this.party, this.selfId, partySort, manualOrders).slice(0, MAX_ROWS);
    const overrideOf = (id: number) => skillOverrides[id];

    const keys = new Set<string>();
    const castIndex = new Map<string, Map<string, CastTarget>>();
    const rows: MemberRow[] = ordered.map((member) => {
      const job = getJob(member.job);
      const actionIds = job ? (watchActions[toAdvancedJob(member.job)] ?? []) : [];
      const byRecast = new Map<string, CastTarget>();
      const level = member.level || 100;
      const slots = actionIds.map((slotActionId): SkillSlot => {
        const skill = resolveSkill(slotActionId, member.job, level, overrideOf);
        if (!skill) return {};
        const key = cooldownKey(member.id, skill.recastKey);
        const { recastMs, maxCharges, durationMs } = skill;
        this.cooldowns.ensure(key, { recastMs, maxCharges, durationMs }, now);
        keys.add(key);
        byRecast.set(skill.recastKey, { key, effectOnTimerUse: skill.effectOnTimerUse, level });
        return { skill, key };
      });
      castIndex.set(member.id, byRecast);
      return { member, job, slots };
    });

    this.cooldowns.retain(keys);
    this.castIndex = castIndex;
    this.rows = rows;
    for (const l of this.rowListeners) l(rows);
  }
}
