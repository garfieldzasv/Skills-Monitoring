import { describe, expect, it } from "vitest";
import { eventTypeOfLine, parseLogLine } from "@/core/logline/parse";

function abilityLine(type: "21" | "22", source: string, actionHex: string, targetIndex = "0") {
  const line = Array.from({ length: 48 }, () => "");
  line[0] = type;
  line[1] = "2026-10-01T20:00:00.0000000+08:00";
  line[2] = source;
  line[4] = actionHex;
  line[6] = "40001234";
  line[36] = "8000";
  line[45] = targetIndex;
  return line;
}

describe("parseLogLine", () => {
  it("parses single-target abilities", () => {
    expect(parseLogLine(abilityLine("21", "10abcdef", "1D6F"))).toMatchObject({
      type: "ability",
      sourceId: "10ABCDEF",
      actionId: 0x1d6f,
      targetId: "40001234",
      sourceMp: 8000,
    });
  });

  it("keeps only the first target of AOE lines", () => {
    expect(parseLogLine(abilityLine("22", "10000001", "1D6F", "0"))).toBeDefined();
    expect(parseLogLine(abilityLine("22", "10000001", "1D6F", "1"))).toBeUndefined();
  });

  it("recognizes wipe commands only", () => {
    expect(parseLogLine(["33", "t", "8003", "40000010"])).toMatchObject({ type: "wipe" });
    expect(parseLogLine(["33", "t", "8003", "40000001"])).toBeUndefined();
  });

  it("parses effect lines", () => {
    const line = ["26", "2026-10-01T20:00:00Z", "E66", "x", "15.00", "10000001", "a", "10000002", "b"];
    expect(parseLogLine(line)).toMatchObject({ type: "gainEffect", effectId: 0xe66, duration: 15, targetId: "10000002" });
  });

  it("ignores unrelated or malformed lines", () => {
    expect(parseLogLine(["00", "chat"])).toBeUndefined();
    expect(parseLogLine(abilityLine("21", "", "1D6F"))).toBeUndefined();
    expect(eventTypeOfLine("00")).toBeUndefined();
    expect(eventTypeOfLine("22")).toBe("ability");
  });
});
