export interface CooldownSpec {
  recastMs: number;
  /** 1 for ordinary cooldowns. */
  maxCharges: number;
  /** Effect duration; 0 = none. */
  durationMs: number;
}

/**
 * Immutable state of one tracked skill. A new object is produced on every change, so UI layers
 * can compare by reference.
 *
 * Time only matters lazily: `charges` is the count at `rechargeStartAt`; charges that recover
 * afterwards are derived by {@link viewAt} instead of being pushed by a timer.
 */
export interface CooldownState extends CooldownSpec {
  charges: number;
  /** Start of the charge currently recovering; null when full. */
  rechargeStartAt: number | null;
  /** Last cast that touched this entry (spent the timer or started the effect). */
  lastUsedAt: number | null;
  /** Start of the effect being counted down; usually the cast that spent the timer. */
  effectStartAt: number | null;
}

export interface CooldownView {
  charges: number;
  maxCharges: number;
  /** When the next charge comes back; null when full. */
  nextReadyAt: number | null;
  /** Start of the recovery cycle in progress (for the sweep animation); null when full. */
  cycleStartAt: number | null;
  /** When the effect ends; null when not active. */
  activeUntil: number | null;
}

/**
 * Charges recover one at a time, as in game: the next charge starts recovering only after the
 * previous one is back. Pure function of state and time.
 */
function settle(state: CooldownState, now: number): CooldownState {
  const { rechargeStartAt, recastMs, maxCharges } = state;
  if (rechargeStartAt === null) return state;
  if (recastMs <= 0) return { ...state, charges: maxCharges, rechargeStartAt: null };
  const recovered = Math.floor((now - rechargeStartAt) / recastMs);
  if (recovered <= 0) return state;
  const charges = Math.min(maxCharges, state.charges + recovered);
  return {
    ...state,
    charges,
    rechargeStartAt: charges >= maxCharges ? null : rechargeStartAt + recovered * recastMs,
  };
}

export function viewAt(state: CooldownState, now: number): CooldownView {
  const s = settle(state, now);
  const activeUntil =
    s.effectStartAt !== null && s.durationMs > 0 && now < s.effectStartAt + s.durationMs
      ? s.effectStartAt + s.durationMs
      : null;
  return {
    charges: s.charges,
    maxCharges: s.maxCharges,
    nextReadyAt: s.rechargeStartAt === null ? null : s.rechargeStartAt + s.recastMs,
    cycleStartAt: s.rechargeStartAt,
    activeUntil,
  };
}

/**
 * The moment after which {@link viewAt} stops changing: all charges back and the effect over.
 * Lets the UI stop listening to the clock without polling. Returns -Infinity when already idle.
 */
export function settledAt(state: CooldownState): number {
  const recoveredAt =
    state.rechargeStartAt === null
      ? -Infinity
      : state.rechargeStartAt + (state.maxCharges - state.charges) * state.recastMs;
  const effectEndsAt =
    state.effectStartAt !== null && state.durationMs > 0 ? state.effectStartAt + state.durationMs : -Infinity;
  return Math.max(recoveredAt, effectEndsAt);
}

const full = (maxCharges: number) =>
  ({ charges: maxCharges, rechargeStartAt: null, lastUsedAt: null, effectStartAt: null }) as const;

export type CooldownListener = (key: string, state: CooldownState | undefined) => void;

/**
 * The single source of truth for cooldowns, keyed by `${ownerId}:${recastKey}`.
 * Clock-agnostic: every mutation takes `now`, which keeps it deterministic under test.
 */
export class CooldownTracker {
  private readonly states = new Map<string, CooldownState>();
  private readonly listeners = new Set<CooldownListener>();

  subscribe(listener: CooldownListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get(key: string): CooldownState | undefined {
    return this.states.get(key);
  }

  /**
   * Creates the entry, or updates its spec while keeping progress (level up, level sync).
   * A timer that is not running means every charge is there, so a full entry stays full when
   * the maximum changes; one that is running keeps its recovery and only clamps its charges.
   */
  ensure(key: string, spec: CooldownSpec, now: number): void {
    const prev = this.states.get(key);
    if (!prev) {
      this.commit(key, { ...spec, ...full(spec.maxCharges) });
      return;
    }
    if (
      prev.recastMs === spec.recastMs &&
      prev.maxCharges === spec.maxCharges &&
      prev.durationMs === spec.durationMs
    ) {
      return;
    }
    const s = settle(prev, now);
    const charges = s.rechargeStartAt === null ? spec.maxCharges : Math.min(spec.maxCharges, s.charges);
    this.commit(
      key,
      settle(
        {
          ...s,
          ...spec,
          charges,
          rechargeStartAt: charges >= spec.maxCharges ? null : (s.rechargeStartAt ?? now),
        },
        now,
      ),
    );
  }

  /** Drops entries not in `keep` (members who left, slots removed). */
  retain(keep: ReadonlySet<string>): void {
    for (const key of [...this.states.keys()]) {
      if (!keep.has(key)) {
        this.states.delete(key);
        this.emit(key, undefined);
      }
    }
  }

  /**
   * Records a cast of the timer's own action: spends a charge, and starts the effect unless the
   * effect comes from a later cast (`startsEffect` false, see {@link startEffect}).
   * A cast while we believe no charge is left means our simulation drifted (the game says it
   * was ready), so the recovery cycle restarts from now.
   */
  use(key: string, now: number, startsEffect = true): boolean {
    const prev = this.states.get(key);
    if (!prev || prev.recastMs <= 0) return false;
    const s = settle(prev, now);
    const effectStartAt = startsEffect ? now : s.effectStartAt;
    const next: CooldownState =
      s.charges > 0
        ? { ...s, charges: s.charges - 1, rechargeStartAt: s.rechargeStartAt ?? now, lastUsedAt: now, effectStartAt }
        : { ...s, charges: 0, rechargeStartAt: now, lastUsedAt: now, effectStartAt };
    this.commit(key, next);
    return true;
  }

  /** Records a cast that starts the effect without spending the timer (a button stand-in). */
  startEffect(key: string, now: number): void {
    const prev = this.states.get(key);
    if (!prev) return;
    this.commit(key, { ...settle(prev, now), lastUsedAt: now, effectStartAt: now });
  }

  /** Shortens (positive delta) the recovery in progress, e.g. 坦培拉涂层 breaking early. */
  adjust(key: string, deltaMs: number, now: number): void {
    const prev = this.states.get(key);
    if (!prev || prev.rechargeStartAt === null) return;
    this.commit(key, settle({ ...prev, rechargeStartAt: prev.rechargeStartAt - deltaMs }, now));
  }

  /** Wipe / zone change: everything back to full. */
  resetAll(): void {
    for (const [key, s] of this.states) {
      if (s.rechargeStartAt === null && s.lastUsedAt === null && s.charges === s.maxCharges) continue;
      this.commit(key, { ...s, ...full(s.maxCharges) });
    }
  }

  private commit(key: string, state: CooldownState): void {
    this.states.set(key, state);
    this.emit(key, state);
  }

  private emit(key: string, state: CooldownState | undefined): void {
    for (const l of this.listeners) l(key, state);
  }
}
