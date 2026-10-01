/**
 * Evaluates the level/job macros in action descriptions, as the in-game tooltip does.
 *
 * SaintCoinach writes the client's SeString payloads as tags. Action descriptions only use:
 *   <If(cond)>A<Else/>B</If>   with cond = Equal(PlayerParameter(68),N)                 (class/job)
 *                                        | GreaterThanOrEqualTo(PlayerParameter(72),N)  (level)
 *   <UIForeground>hex</UIForeground>, <UIGlow>hex</UIGlow>   (colour push/pop; no visible text)
 *
 * Anything else throws, so a new macro in a future patch fails the import instead of silently
 * producing wrong numbers.
 */

export interface TooltipContext {
  job: number;
  level: number;
}

const PARAM_JOB = 68;
const PARAM_LEVEL = 72;

type Node = string | { cond: (ctx: TooltipContext) => boolean; then: Node[]; else: Node[] };

function parseCondition(text: string): (ctx: TooltipContext) => boolean {
  const m = /^(Equal|GreaterThanOrEqualTo)\(PlayerParameter\((\d+)\),(\d+)\)$/.exec(text);
  if (!m) throw new Error(`Unsupported condition: ${text}`);
  const [, op, param, raw] = m;
  const value = Number(raw);
  const read =
    Number(param) === PARAM_JOB ? (c: TooltipContext) => c.job
    : Number(param) === PARAM_LEVEL ? (c: TooltipContext) => c.level
    : undefined;
  if (!read) throw new Error(`Unsupported PlayerParameter(${param}) in ${text}`);
  return op === "Equal" ? (c) => read(c) === value : (c) => read(c) >= value;
}

function parse(input: string): Node[] {
  let pos = 0;

  // Parses until one of `stops` (a closing tag) is next; the caller consumes it.
  const parseNodes = (stops: readonly string[]): Node[] => {
    const nodes: Node[] = [];
    let text = "";
    while (pos < input.length) {
      if (input[pos] !== "<") {
        text += input[pos++];
        continue;
      }
      const end = input.indexOf(">", pos);
      if (end < 0) throw new Error(`Unclosed tag at ${pos}`);
      const tag = input.slice(pos, end + 1);
      if (stops.includes(tag)) break;
      if (text) nodes.push(text);
      text = "";
      pos = end + 1;

      const colour = /^<(UIForeground|UIGlow)>$/.exec(tag);
      if (colour) {
        const close = `</${colour[1]}>`;
        const closeAt = input.indexOf(close, pos);
        if (closeAt < 0 || !/^[0-9A-F]*$/i.test(input.slice(pos, closeAt))) throw new Error(`Bad ${tag} at ${pos}`);
        pos = closeAt + close.length;
        continue;
      }
      const cond = /^<If\((.*)\)>$/.exec(tag);
      if (cond) {
        const test = parseCondition(cond[1]!);
        const thenNodes = parseNodes(["<Else/>", "</If>"]);
        let elseNodes: Node[] = [];
        if (input.startsWith("<Else/>", pos)) {
          pos += "<Else/>".length;
          elseNodes = parseNodes(["</If>"]);
        }
        if (!input.startsWith("</If>", pos)) throw new Error(`Missing </If> at ${pos}`);
        pos += "</If>".length;
        nodes.push({ cond: test, then: thenNodes, else: elseNodes });
        continue;
      }
      throw new Error(`Unsupported tag ${tag}`);
    }
    if (text) nodes.push(text);
    return nodes;
  };

  const nodes = parseNodes([]);
  if (pos !== input.length) throw new Error(`Unexpected ${input.slice(pos, pos + 20)} at ${pos}`);
  return nodes;
}

const render = (nodes: readonly Node[], ctx: TooltipContext): string =>
  nodes.map((n) => (typeof n === "string" ? n : render(n.cond(ctx) ? n.then : n.else, ctx))).join("");

/** Parses once; the returned function renders the plain tooltip text for a job and level. */
export function compileTooltip(description: string): (ctx: TooltipContext) => string {
  const nodes = parse(description);
  return (ctx) => render(nodes, ctx);
}
