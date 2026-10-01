import { describe, expect, it } from "vitest";
import { memberKey, saveManualOrder, sortParty, type PartyMember } from "@/core/party/sortParty";
import { defaultPartySort } from "@/core/settings/schema";

const m = (id: string, job: number): PartyMember => ({ id, name: id, job, level: 100 });
const party = [m("10000005", 22), m("10000002", 24), m("10000001", 21), m("10000004", 19), m("10000003", 38)];
const ids = (list: PartyMember[]) => list.map((x) => x.id);

describe("sortParty", () => {
  it("puts self first, then role order, then job order", () => {
    const sorted = sortParty(party, "10000003", defaultPartySort(), []);
    // self (DNC) → tanks PLD, WAR → healer WHM → DPS DRG
    expect(ids(sorted)).toEqual(["10000003", "10000004", "10000001", "10000002", "10000005"]);
  });

  it("uses the preset of the local player's own role", () => {
    const settings = defaultPartySort();
    settings.presets.healer.roleOrder = ["healer", "dps", "tank"];
    const sorted = sortParty(party, "10000002", settings, []);
    expect(ids(sorted)).toEqual(["10000002", "10000005", "10000003", "10000004", "10000001"]);
  });

  it("can disable self-first", () => {
    const settings = { ...defaultPartySort(), selfFirst: false };
    expect(sortParty(party, "10000003", settings, [])[0]!.id).toBe("10000004");
  });

  it("orders same-job members by actor id, direction configurable", () => {
    const twins = [m("10000010", 19), m("10000020", 19)];
    expect(ids(sortParty(twins, "", defaultPartySort(), []))).toEqual(["10000020", "10000010"]);
    const asc = { ...defaultPartySort(), sameJobTieBreak: "actorIdAsc" as const };
    expect(ids(sortParty(twins, "", asc, []))).toEqual(["10000010", "10000020"]);
  });

  it("sorts base classes with their advanced job", () => {
    const sorted = sortParty([m("10000002", 21), m("10000001", 1)], "", defaultPartySort(), []);
    expect(ids(sorted)).toEqual(["10000001", "10000002"]); // GLA sorts as PLD, before WAR
  });

  it("applies a manual order only for the same member set", () => {
    const manual = saveManualOrder([], ["10000005", "10000004", "10000003", "10000002", "10000001"], 1);
    expect(ids(sortParty(party, "10000003", defaultPartySort(), manual))[0]).toBe("10000005");
    const other = [...party, m("10000009", 25)];
    expect(ids(sortParty(other, "10000003", defaultPartySort(), manual))[0]).toBe("10000003");
  });

  it("keeps the manual list bounded and most-recent first", () => {
    let orders = saveManualOrder([], ["a"], 1);
    for (let i = 0; i < 30; i++) orders = saveManualOrder(orders, [`x${i}`], i);
    expect(orders).toHaveLength(20);
    expect(orders[0]!.memberKey).toBe(memberKey([{ id: "x29" }]));
  });
});
