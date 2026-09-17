/**
 * The gate.
 *
 * A pair is a claim: "this token, on this token, is readable". Writing the
 * claim down is the point. A colour system with no list of pairs has no
 * failing state, so nothing stops a token from drifting, and the drift is
 * only found when somebody squints at a screen months later.
 */

import type { ColorInput, Oklch } from "./color.js";
import { isInGamut, parseColor, parseOklch, rgbToHex } from "./color.js";
import type { Level, TextSize } from "./contrast.js";
import { contrastRatio, minimumFor, oklabDistance } from "./contrast.js";

export interface PairSpec {
  /** Shown in the report. Defaults to `fg / bg`. */
  readonly name?: string;
  /** A token name present in `tokens`, or a literal colour. */
  readonly fg: string;
  readonly bg: string;
  /** What the pair is used for. Picks the minimum from the level. */
  readonly size?: TextSize;
  /** Overrides the level entirely for this one pair. */
  readonly min?: number;
}

export interface GateOptions {
  readonly level?: Level;
  /** Token name to colour. Values may be hex, rgb() or oklch(). */
  readonly tokens?: Readonly<Record<string, string>>;
  /** Label for the token set being checked, such as a theme name. */
  readonly theme?: string;
  /** Fail a pair whose OKLCh source falls outside the sRGB gamut. */
  readonly requireInGamut?: boolean;
}

export interface PairResult {
  readonly name: string;
  readonly theme: string | undefined;
  readonly fg: string;
  readonly bg: string;
  readonly fgHex: string;
  readonly bgHex: string;
  readonly ratio: number;
  readonly minimum: number;
  readonly distance: number;
  readonly inGamut: boolean;
  readonly pass: boolean;
}

export class ContrastGateError extends Error {
  readonly results: readonly PairResult[];
  readonly failures: readonly PairResult[];

  constructor(results: readonly PairResult[]) {
    const failures = results.filter((result) => !result.pass);
    super(
      `Contrast gate failed on ${failures.length} of ${results.length} pair(s).\n` +
        formatReport(failures),
    );
    this.name = "ContrastGateError";
    this.results = results;
    this.failures = failures;
  }
}

function resolve(reference: string, tokens: Readonly<Record<string, string>>): string {
  const seen = new Set<string>();
  let current = reference;
  while (Object.hasOwn(tokens, current) && !seen.has(current)) {
    seen.add(current);
    current = tokens[current] as string;
  }
  return current;
}

export function checkPairs(
  pairs: readonly PairSpec[],
  options: GateOptions = {},
): PairResult[] {
  const tokens = options.tokens ?? {};

  return pairs.map((pair) => {
    const fgValue = resolve(pair.fg, tokens);
    const bgValue = resolve(pair.bg, tokens);
    const fgRgb = parseColor(fgValue as ColorInput);
    const bgRgb = parseColor(bgValue as ColorInput);

    const ratio = contrastRatio(fgRgb, bgRgb);
    const minimum =
      pair.min ?? minimumFor({ level: options.level ?? "AA", size: pair.size ?? "body" });

    const sources: (Oklch | undefined)[] = [parseOklch(fgValue), parseOklch(bgValue)];
    const inGamut = sources.every((source) => source === undefined || isInGamut(source));

    const pass = ratio >= minimum && (!options.requireInGamut || inGamut);

    return {
      name: pair.name ?? `${pair.fg} / ${pair.bg}`,
      theme: options.theme,
      fg: pair.fg,
      bg: pair.bg,
      fgHex: rgbToHex(fgRgb),
      bgHex: rgbToHex(bgRgb),
      ratio,
      minimum,
      distance: oklabDistance(fgRgb, bgRgb),
      inGamut,
      pass,
    };
  });
}

/** Throws `ContrastGateError` when any pair misses. Built to stop a build. */
export function assertPairs(pairs: readonly PairSpec[], options: GateOptions = {}): void {
  const results = checkPairs(pairs, options);
  if (results.some((result) => !result.pass)) throw new ContrastGateError(results);
}

export interface ReportOptions {
  /** Include the passing pairs as well. Defaults to true. */
  readonly verbose?: boolean;
}

export function formatReport(
  results: readonly PairResult[],
  options: ReportOptions = {},
): string {
  const shown = options.verbose === false ? results.filter((r) => !r.pass) : results;
  if (shown.length === 0) return "";

  const nameWidth = Math.max(...shown.map((r) => label(r).length));

  return shown
    .map((result) => {
      const verdict = result.pass ? "pass" : "FAIL";
      const gamut = result.inGamut ? "" : "  out of sRGB gamut";
      return (
        `  ${verdict}  ${label(result).padEnd(nameWidth)}  ` +
        `${result.ratio.toFixed(2).padStart(6)}:1  ` +
        `min ${result.minimum.toFixed(1)}  ` +
        `${result.fgHex} on ${result.bgHex}${gamut}`
      );
    })
    .join("\n");
}

function label(result: PairResult): string {
  return result.theme ? `${result.theme}: ${result.name}` : result.name;
}
