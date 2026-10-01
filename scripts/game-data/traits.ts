/**
 * Reads the effects of traits from their (English) descriptions. The client applies trait effects
 * in code, so the description is the only place the game data states them. The wording is
 * templated, so a few strict patterns cover it; sentences that look relevant but match no pattern
 * are reported by the import script for review.
 */

/** "A", "A and B", "A, B, and C" → names. */
export function splitNames(list: string): string[] {
  return list
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface TraitUpgrade {
  from: string;
  to: string;
}

/**
 * "Upgrades A to B." / "Upgrades A and B to C and D respectively." / "Upgrades A to B and C to D."
 *
 * Skipped: upgrades limited to a status ("while under the effect of …", temporary replacements)
 * and ones "executed by your simulacrum" (a pet's action); neither is a level upgrade.
 * The target list may run on into another clause ("… to Broil II and increases …"), so only as
 * many names as the source list has are taken from it.
 */
export function parseUpgrades(description: string): TraitUpgrade[] {
  const out: TraitUpgrade[] = [];
  for (const sentence of sentences(description)) {
    const m = /^Upgrades (.+?) to (.+?)(?: respectively)?$/.exec(sentence);
    if (!m || /\b(while|when|upon|executed by)\b/.test(sentence)) continue;
    // "A to B, C to D, and E to F": several single upgrades in one sentence. Names are
    // capitalised, so a clause starting in lower case ("… and increases the potency of …") ends
    // the upgrade list.
    const body = `${m[1]} to ${m[2]}`.replace(/(?: and|,) (?!the |and )[a-z].*$/, "");
    const pairs = splitNames(body);
    if (pairs.length > 1 && pairs.every((p) => p.includes(" to "))) {
      for (const p of pairs) {
        const [from, to] = p.split(" to ") as [string, string];
        out.push({ from: from.trim(), to: splitNames(to)[0]! });
      }
      continue;
    }
    const from = splitNames(m[1]!);
    const to = splitNames(m[2]!).slice(0, from.length);
    if (to.length !== from.length) continue;
    from.forEach((f, i) => out.push({ from: f, to: to[i]! }));
  }
  return out;
}

export interface TraitRecast {
  action: string;
  seconds: number;
}

/** "Reduces A recast time to N seconds." / "Reduces recast time of A to N seconds." */
export function parseRecasts(description: string): TraitRecast[] {
  const out: TraitRecast[] = [];
  for (const sentence of sentences(description)) {
    const m =
      /^Reduces (?:the )?(.+?) recast (?:time|timer) to (\d+) seconds?(?: and .*)?$/.exec(sentence) ??
      /^Reduces (?:the )?recast time of (.+?) to (\d+) seconds?(?: and .*)?$/.exec(sentence);
    if (!m) continue;
    for (const action of splitNames(m[1]!)) out.push({ action, seconds: Number(m[2]) });
  }
  return out;
}

export interface TraitCharges {
  action: string;
  charges: number;
}

/**
 * "Allows the accumulation of charges for consecutive uses of A. Maximum Charges: N"
 * "Allows a third charge of A and B."
 */
export function parseCharges(description: string): TraitCharges[] {
  const out: TraitCharges[] = [];
  const ORDINAL: Record<string, number> = { second: 2, third: 3, fourth: 4 };
  const text = description.replace(/\s+/g, " ");
  for (const m of text.matchAll(/consecutive uses of (.+?)\. Maximum Charges: (\d+)/g)) {
    for (const action of splitNames(m[1]!)) out.push({ action, charges: Number(m[2]) });
  }
  for (const m of text.matchAll(/Allows a (second|third|fourth) charge of (.+?)\./g)) {
    for (const action of splitNames(m[2]!)) out.push({ action, charges: ORDINAL[m[1]!]! });
  }
  return out;
}

/** Sentences of a description, without the final period. */
export function sentences(description: string): string[] {
  return description
    .split(/\n|(?<=\.)\s+/)
    .map((s) => s.trim().replace(/\.$/, "").replace(/\s+/g, " "))
    .filter(Boolean);
}
