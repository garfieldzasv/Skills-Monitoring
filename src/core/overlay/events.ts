/**
 * Subset of OverlayPlugin events used by this app.
 *
 * Verified in OverlayPlugin's source (FFXIVRequiredEventSource / FFXIVOptionalEventSource):
 * - PartyChanged and ChangePrimaryPlayer are cached: a new subscriber receives the current value
 *   immediately, so an overlay opened mid-session needs no further events.
 * - While solo, PartyChanged carries a one-member party (the player), never an empty one.
 * - Member `id` is uppercase hex, the same format as source IDs in log lines.
 */
export interface OverlayPartyMember {
  id: string;
  name: string;
  worldId: number;
  job: number;
  level: number;
  inParty: boolean;
}

export interface OverlayEventMap {
  LogLine: { type: "LogLine"; line: string[]; rawLine: string };
  PartyChanged: { type: "PartyChanged"; party: OverlayPartyMember[] };
  ChangePrimaryPlayer: { type: "ChangePrimaryPlayer"; charID: number; charName: string };
  ChangeZone: { type: "ChangeZone"; zoneID: number; zoneName: string };
}

export type OverlayEventName = keyof OverlayEventMap;

export type OverlayHandler<E extends OverlayEventName> = (event: OverlayEventMap[E]) => void;
