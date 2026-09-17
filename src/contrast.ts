/**
 * Two different questions, kept apart on purpose.
 *
 * `contrastRatio` answers "can this be read", which is what WCAG 1.4.3 and
 * 1.4.11 are about. It works on relative luminance, so two colours of the same
 * lightness always score 1:1 no matter how far apart their hues are.
 *
 * `oklabDistance` answers "can these two be told apart", which is a different
 * question and the one that matters for a status colour sitting next to
 * another status colour. A pair can pass contrast against the background and
 * still be indistinguishable from its neighbour.
 */

import type { ColorInput, RGB } from "./color.js";
import { linearRgbToOklab, parseColor, rgbToLinearRgb } from "./color.js";

export type TextSize = "body" | "large" | "nonText";
export type Level = "AA" | "AAA";

/**
 * Minimums by conformance level.
 *
 * `body` is WCAG 1.4.3 and 1.4.6 for normal text.
 * `large` is text at 18pt, or 14pt bold, and above.
 * `nonText` is WCAG 1.4.11: interface component boundaries, focus rings,
 * chart strokes, icons carrying meaning. It has no AAA level of its own, so
 * the AA value stands.
 */
export const MINIMUM: Readonly<Record<Level, Readonly<Record<TextSize, number>>>> = {
  AA: { body: 4.5, large: 3, nonText: 3 },
  AAA: { body: 7, large: 4.5, nonText: 3 },
};

/** WCAG 2.1 relative luminance, from linear-light sRGB. */
export function relativeLuminance(colour: ColorInput): number {
  const [r, g, b] = rgbToLinearRgb(parseColor(colour));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.1 contrast ratio, between 1 and 21. Order does not matter: the
 * lighter colour always goes on top.
 */
export function contrastRatio(a: ColorInput, b: ColorInput): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Euclidean distance in OKLab, which is close enough to uniform that the
 * number can be compared across hues. Identical colours give 0.
 *
 * There is no threshold in any standard for this. It is a measuring tool, not
 * a pass mark: use it to compare a before and an after on the same pair.
 */
export function oklabDistance(a: ColorInput, b: ColorInput): number {
  const first = linearRgbToOklab(rgbToLinearRgb(parseColor(a)));
  const second = linearRgbToOklab(rgbToLinearRgb(parseColor(b)));
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b);
}

export interface MeetsOptions {
  readonly level?: Level;
  readonly size?: TextSize;
}

/** Whether a ratio clears the minimum for a level and a kind of content. */
export function meets(ratio: number, options: MeetsOptions = {}): boolean {
  return ratio >= minimumFor(options);
}

export function minimumFor(options: MeetsOptions = {}): number {
  const level = options.level ?? "AA";
  const size = options.size ?? "body";
  return MINIMUM[level][size];
}

/** Convenience for the common case: is this text readable on this background. */
export function isReadable(
  foreground: ColorInput,
  background: ColorInput,
  options: MeetsOptions = {},
): boolean {
  return meets(contrastRatio(foreground, background), options);
}

export type { ColorInput, RGB };
