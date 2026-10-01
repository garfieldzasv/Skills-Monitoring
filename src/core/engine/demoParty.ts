import type { PartyMember } from "@/core/party/sortParty";

/** A typical 8-person composition for calibration and demo mode. The first member is "self". */
export const DEMO_PARTY: readonly PartyMember[] = [
  { id: "10000001", name: "演示·骑士", job: 19, level: 100 },
  { id: "10000002", name: "演示·暗黑骑士", job: 32, level: 100 },
  { id: "10000003", name: "演示·白魔法师", job: 24, level: 100 },
  { id: "10000004", name: "演示·贤者", job: 40, level: 100 },
  { id: "10000005", name: "演示·钐镰客", job: 39, level: 100 },
  { id: "10000006", name: "演示·龙骑士", job: 22, level: 100 },
  { id: "10000007", name: "演示·舞者", job: 38, level: 100 },
  { id: "10000008", name: "演示·绘灵法师", job: 42, level: 100 },
];

export const DEMO_SELF_ID = DEMO_PARTY[0]!.id;
