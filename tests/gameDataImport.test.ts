import { describe, expect, it } from "vitest";
import { compileTooltip } from "../scripts/game-data/seString";
import { cnRows, parseCsv } from "../scripts/game-data/sources";
import { parseCharges, parseRecasts, parseUpgrades } from "../scripts/game-data/traits";

describe("tooltip macros", () => {
  // Shape of the CN export's 促进 description, trimmed.
  const acceleration =
    "<UIForeground>F201F8</UIForeground><UIGlow>F201F9</UIGlow>持续时间：<UIGlow>01</UIGlow><UIForeground>01</UIForeground>20秒" +
    "<If(Equal(PlayerParameter(68),35))><If(GreaterThanOrEqualTo(PlayerParameter(72),88))>\n积蓄次数：2<Else/></If><Else/></If>";

  it("evaluates job and level conditions like the game", () => {
    const render = compileTooltip(acceleration);
    expect(render({ job: 35, level: 88 })).toBe("持续时间：20秒\n积蓄次数：2");
    expect(render({ job: 35, level: 87 })).toBe("持续时间：20秒");
    expect(render({ job: 19, level: 100 })).toBe("持续时间：20秒");
  });

  it("rejects macros it does not know", () => {
    expect(() => compileTooltip("<If(LessThan(PlayerParameter(72),50))>a</If>")).toThrow();
    expect(() => compileTooltip("<If(Equal(PlayerParameter(11),1))>a</If>")).toThrow();
    expect(() => compileTooltip("<Sheet(Status,1,0)/>")).toThrow();
    expect(() => compileTooltip("<If(Equal(PlayerParameter(68),1))>a")).toThrow();
  });
});

describe("trait texts", () => {
  it("reads upgrades in every wording", () => {
    expect(parseUpgrades("Upgrades Sentinel to Guardian.")).toEqual([{ from: "Sentinel", to: "Guardian" }]);
    expect(parseUpgrades("Upgrades Venomous Bite and Windbite to Caustic Bite and Stormbite respectively.")).toEqual([
      { from: "Venomous Bite", to: "Caustic Bite" },
      { from: "Windbite", to: "Stormbite" },
    ]);
    expect(parseUpgrades("Upgrades Dosis to Dosis II, Phlegma to Phlegma II, and Eukrasian Dosis to Eukrasian Dosis II.")).toHaveLength(3);
    expect(parseUpgrades("Upgrades Ruin to Broil and increases the potency of Ruin II to 160, and Art of War to 165.")).toEqual([
      { from: "Ruin", to: "Broil" },
    ]);
    expect(parseUpgrades("Upgrades Katon and Hyoton to Goka Mekkyaku and Hyosho Ranryu while under the effect of Kassatsu.")).toEqual([]);
  });

  it("reads fixed recast changes only", () => {
    expect(parseRecasts("Reduces Troubadour recast time to 90 seconds.")).toEqual([{ action: "Troubadour", seconds: 90 }]);
    expect(parseRecasts("Reduces Hissatsu: Guren and Hissatsu: Senei recast time to 60 seconds.")).toHaveLength(2);
    expect(parseRecasts("Reduces Infuriate recast time by 5 seconds upon landing Fell Cleave.")).toEqual([]);
  });

  it("reads charge counts", () => {
    expect(parseCharges("Allows the accumulation of charges for consecutive uses of Acceleration.\nMaximum Charges: 2")).toEqual([
      { action: "Acceleration", charges: 2 },
    ]);
    expect(parseCharges("Allows a third charge of Bloodletter and Rain of Death.")).toEqual([
      { action: "Bloodletter", charges: 3 },
      { action: "Rain of Death", charges: 3 },
    ]);
  });
});

describe("CN export CSV", () => {
  it("parses quoted fields with commas, quotes and newlines", () => {
    expect(parseCsv('1,"a,b","say ""hi""\nthere"\n')).toEqual([["1", "a,b", 'say "hi"\nthere']]);
  });

  it("skips the three header lines and keys rows by id", () => {
    const rows = cnRows("\uFEFFkey,0\n#,Name\nint32,str\n7518,促进\n");
    expect(rows.get(7518)).toEqual(["7518", "促进"]);
  });
});
