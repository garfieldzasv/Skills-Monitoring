import { getRoleGroup, toAdvancedJob, type RoleGroup } from "@/core/game/jobs";

export interface PartyMember {
  /** Actor ID, uppercase hex. */
  id: string;
  name: string;
  job: number;
  level: number;
}

export interface SortPreset {
  /** Order of role groups, e.g. ["tank", "healer", "dps"]. */
  roleOrder: RoleGroup[];
  /** Advanced jobs in order; base classes sort as their advanced job. */
  jobOrder: number[];
}

export interface PartySortSettings {
  selfFirst: boolean;
  /** Chosen by the local player's own role, mirroring the three in-game presets. */
  presets: Record<RoleGroup, SortPreset>;
  /** Tie-break for members with the same job (in-game order ignores join order). */
  sameJobTieBreak: "actorIdDesc" | "actorIdAsc";
}

export interface ManualOrder {
  /** {@link memberKey} of the party the order was saved for. */
  memberKey: string;
  order: string[];
  savedAt: number;
}

export const MAX_MANUAL_ORDERS = 20;

/** Identifies a party by its member set, independent of order and jobs. */
export function memberKey(members: readonly Pick<PartyMember, "id">[]): string {
  return members
    .map((m) => m.id)
    .sort()
    .join(",");
}

const indexOr = (list: readonly unknown[], item: unknown, fallback: number) => {
  const i = list.indexOf(item);
  return i >= 0 ? i : fallback;
};

/** Sorts by the rule-based order only (no manual overrides). */
function sortByRules(
  members: readonly PartyMember[],
  selfId: string,
  settings: PartySortSettings,
): PartyMember[] {
  const self = members.find((m) => m.id === selfId);
  const presetGroup: RoleGroup = (self && getRoleGroup(self.job)) || "dps";
  const preset = settings.presets[presetGroup];
  const tieSign = settings.sameJobTieBreak === "actorIdAsc" ? 1 : -1;

  const rank = (m: PartyMember) => {
    const group = getRoleGroup(m.job);
    return {
      self: settings.selfFirst && m.id === selfId ? 0 : 1,
      role: group ? indexOr(preset.roleOrder, group, 98) : 99,
      job: indexOr(preset.jobOrder, toAdvancedJob(m.job), 999),
      actor: Number.parseInt(m.id, 16) || 0,
    };
  };
  const ranks = new Map(members.map((m) => [m, rank(m)]));

  return [...members].sort((a, b) => {
    const ra = ranks.get(a)!;
    const rb = ranks.get(b)!;
    return ra.self - rb.self || ra.role - rb.role || ra.job - rb.job || tieSign * (ra.actor - rb.actor);
  });
}

/**
 * Final display order: rule-based order, replaced by a saved manual order when one exists for
 * this exact member set. Members missing from the saved order keep their rule position at the end.
 */
export function sortParty(
  members: readonly PartyMember[],
  selfId: string,
  settings: PartySortSettings,
  manualOrders: readonly ManualOrder[],
): PartyMember[] {
  const ruled = sortByRules(members, selfId, settings);
  const manual = manualOrders.find((o) => o.memberKey === memberKey(members));
  if (!manual) return ruled;
  const pos = new Map(manual.order.map((id, i) => [id, i]));
  return ruled
    .map((m, i) => ({ m, key: pos.get(m.id) ?? manual.order.length + i }))
    .sort((a, b) => a.key - b.key)
    .map(({ m }) => m);
}

/** Returns the new manual-order list after saving `order` for the current party (LRU, capped). */
export function saveManualOrder(
  orders: readonly ManualOrder[],
  order: readonly string[],
  now: number,
): ManualOrder[] {
  const key = memberKey(order.map((id) => ({ id })));
  const rest = orders.filter((o) => o.memberKey !== key);
  return [{ memberKey: key, order: [...order], savedAt: now }, ...rest].slice(0, MAX_MANUAL_ORDERS);
}

export function clearManualOrder(orders: readonly ManualOrder[], key: string): ManualOrder[] {
  return orders.filter((o) => o.memberKey !== key);
}
