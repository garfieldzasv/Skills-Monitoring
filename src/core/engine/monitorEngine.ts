import { CooldownTracker } from "@/core/cooldown/cooldownTracker";
import { getJob, toAdvancedJob, type JobInfo } from "@/core/game/jobs";
import { evalLevelValue } from "@/core/game/levelValue";
import { resolveSkill, shownDuration, type ResolvedSkill } from "@/core/game/skillMeta";
import { getAction } from "@/core/game/actions";
import { firstTier, recastKey, timerOwner, upgradeFamily } from "@/core/game/upgrades";
import type { GameEventConsumer, GaugeContext } from "@/core/gauges/types";
import { AbilityField, ActorControlField, LineType, WIPE_COMMANDS } from "@/core/logline/fields";
import { eventTypeOfLine, parseLogLine, type GameEventType } from "@/core/logline/parse";
import { sortParty, type PartyMember } from "@/core/party/sortParty";
import type { Settings } from "@/core/settings/schema";

export const MAX_ROWS = 8;

export interface SkillSlot {
  /** Undefined when this member has no tier of the configured action, see `unavailable`. */
  skill?: ResolvedSkill;
  /** Cooldown tracker key; set together with `skill`. */
  key?: string;
  /**
   * Set instead of `skill` when the member cannot use the action (not learned at their level or
   * synced below it, or a job action for a base class). Shown greyed out, so rows stay aligned
   * and complete; it has no cooldown and is not announced.
   */
  unavailable?: UnavailableSkill;
}

export interface UnavailableSkill {
  /** The tier the member would learn first, or the configured action. */
  actionId: number;
  name: string;
  iconId: number;
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
  member: PartyMember;
  /** Every slot of the member on this timer (usually one; e.g. 失血箭 and 死亡箭雨 share one). */
  slots: ResolvedSkill[];
}

/** A watched slot was triggered by a real cast (see {@link MonitorEngine.onTrigger}). */
export interface SkillTrigger {
  member: PartyMember;
  /** The slot as resolved for this member. */
  skill: ResolvedSkill;
  /** The action actually cast: a lower tier, a shared-timer sibling or a stand-in of the slot. */
  castActionId: number;
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
  private readonly triggerListeners = new Set<(trigger: SkillTrigger) => void>();

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

  /**
   * Demo helper: behaves like seeing the cast in the log, except that it triggers nothing. A
   * stand-in is preceded by the action whose button it replaces, as in game (技巧舞步, then
   * 技巧舞步结束), so the timer runs and not only the effect.
   */
  simulateCast(ownerId: string, actionId: number): void {
    const id = ownerId.toUpperCase();
    const action = getAction(actionId);
    const owner = action && timerOwner(action);
    if (owner && owner !== action) this.useSkill(id, owner.id, true);
    this.useSkill(id, actionId, true);
  }

  // ---------- outputs ----------

  getRows(): readonly MemberRow[] {
    return this.rows;
  }

  onRowsChange(listener: (rows: readonly MemberRow[]) => void): () => void {
    this.rowListeners.add(listener);
    return () => this.rowListeners.delete(listener);
  }

  /**
   * A watched slot was triggered: the cast that starts the slot's effect, or for a slot without
   * a separate effect source, the cast that spends its timer. Exactly the casts the overlay shows
   * as "just used" (e.g. 四色技巧舞步结束, not the 技巧舞步 before it). Simulated casts are not
   * reported.
   */
  onTrigger(listener: (trigger: SkillTrigger) => void): () => void {
    this.triggerListeners.add(listener);
    return () => this.triggerListeners.delete(listener);
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

  private useSkill(ownerId: string, actionId: number, simulated = false): void {
    const action = getAction(actionId);
    const target = action && this.castIndex.get(ownerId)?.get(recastKey(actionId)!);
    if (!target) return;
    const standIn = timerOwner(action) !== action;
    // Several slots on one timer: the cast belongs to the slot of its own upgrade chain, else to
    // a slot showing the same kind of action (a stand-in, or the timer's own action).
    const slot =
      target.slots.find((s) => upgradeFamily(s.actionId).includes(actionId)) ??
      target.slots.find((s) => s.effectOnTimerUse !== standIn) ??
      target.slots[0]!;
    const { effectOnTimerUse } = slot;
    let triggered: boolean;
    if (!standIn) {
      this.cooldowns.use(target.key, this.now(), effectOnTimerUse);
      triggered = effectOnTimerUse;
    } else {
      // A stand-in (e.g. 四色技巧舞步结束) does not spend the timer: the action whose button it
      // replaces already did. For a slot that shows a stand-in, a stand-in with an effect of its
      // own starts the countdown (any of the four finishes; not 提拉纳, which has none).
      const level = target.member.level || 100;
      triggered = !effectOnTimerUse && evalLevelValue(shownDuration(action), level) > 0;
      if (triggered) this.cooldowns.startEffect(target.key, this.now());
    }
    if (!triggered || simulated) return;
    const trigger: SkillTrigger = { member: target.member, skill: slot, castActionId: actionId };
    for (const l of this.triggerListeners) l(trigger);
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
        if (!skill) {
          const shown = getAction(firstTier(slotActionId, member.job) ?? slotActionId);
          return shown ? { unavailable: { actionId: shown.id, name: shown.name, iconId: shown.icon } } : {};
        }
        const key = cooldownKey(member.id, skill.recastKey);
        const { recastMs, maxCharges, durationMs } = skill;
        this.cooldowns.ensure(key, { recastMs, maxCharges, durationMs }, now);
        keys.add(key);
        const target = byRecast.get(skill.recastKey);
        if (target) target.slots.push(skill);
        else byRecast.set(skill.recastKey, { key, member, slots: [skill] });
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
