import type { GameEvent, GameEventType } from "@/core/logline/parse";

/**
 * Job gauge trackers (DESIGN §8, milestone M6). Only the contract is defined for now; the
 * engine already routes parsed events to any registered {@link GameEventConsumer}.
 */
export interface GaugeContext {
  now(): number;
  /** Shortens the recovery in progress of a member's skill (e.g. 坦培拉涂层 breaking early). */
  adjustCooldown(ownerId: string, actionId: number, deltaMs: number): void;
}

export interface GaugeView {
  /** Current resource amount, shown bottom-left. */
  value?: number;
  /** False when the resource is insufficient; the icon is dimmed. */
  ready: boolean;
  extraText?: string;
}

/** Anything that wants parsed log events. `eventTypes` lets the engine skip parsing otherwise. */
export interface GameEventConsumer {
  readonly eventTypes: ReadonlySet<GameEventType>;
  onEvent(event: GameEvent, ctx: GaugeContext): void;
  /** Wipe or zone change. */
  reset(): void;
}

export interface GaugeTracker extends GameEventConsumer {
  readonly job: number;
  setPlayers(ids: readonly string[]): void;
  /** Demo mode: fill every tracked player's resource. */
  fill?(): void;
  getView(ownerId: string, actionId: number, now: number): GaugeView | undefined;
}
