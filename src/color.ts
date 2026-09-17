/**
 * Colour conversion, written from the specifications and carrying no
 * dependencies.
 *
 * sRGB transfer function: IEC 61966-2-1.
 * OKLab and OKLCh matrices: Björn Ottosson, "A perceptual color space for
 * image processing" (2020).
 *
 * Every function here is pure. Nothing reads the DOM, the filesystem or the
 * environment, which is what lets the same code run in a build gate, in a
 * test and in the browser.
 */

/** Gamma-encoded sRGB, one channel per entry, 0 to 255. */
export type RGB = readonly [number, number, number];

/**
 * Linear-light sRGB, 0 to 1. Values may fall outside that range: an OKLCh
 * colour outside the sRGB gamut produces them, and `isInGamut` is how you
 * find out before clamping throws the information away.
 */
export type LinearRGB = readonly [number, number, number];

export interface Oklab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface Oklch {
  /** Perceptual lightness, 0 to 1. */
  readonly l: number;
  /** Chroma. Unbounded in principle, roughly 0 to 0.37 inside sRGB. */
  readonly c: number;
  /** Hue angle in degrees. */
  readonly h: number;
}

/** Anything the parser accepts, or an already-parsed RGB triple. */
export type ColorInput = string | RGB;

const HEX = /^#?(?:([0-9a-f]{3})|([0-9a-f]{6}))$/i;
const RGB_FN = /^rgba?\(\s*([+-]?[\d.]+)\s*[, ]\s*([+-]?[\d.]+)\s*[, ]\s*([+-]?[\d.]+)/i;
const OKLCH_FN = /^oklch\(\s*([+-]?[\d.]+)(%?)\s+([+-]?[\d.]+)(%?)\s+([+-]?[\d.]+)(?:deg)?/i;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Gamma-encoded channel (0 to 1) to linear-light. */
export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Linear-light channel (0 to 1) to gamma-encoded. */
export function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

export function hexToRgb(hex: string): RGB {
  const match = HEX.exec(hex.trim());
  if (!match) throw new TypeError(`Not a hex colour: ${JSON.stringify(hex)}`);
  const body = match[2] ?? expandShorthand(match[1] as string);
  const n = Number.parseInt(body, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function expandShorthand(short: string): string {
  return [...short].map((ch) => ch + ch).join("");
}

export function rgbToHex(rgb: RGB): string {
  const hex = rgb
    .map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
}

export function rgbToLinearRgb(rgb: RGB): LinearRGB {
  const [r, g, b] = rgb;
  return [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
}

/** Clamps into the sRGB cube. Use `isInGamut` first when that matters. */
export function linearRgbToRgb(lin: LinearRGB): RGB {
  const [r, g, b] = lin;
  return [
    Math.round(clamp(linearToSrgb(clamp(r, 0, 1)), 0, 1) * 255),
    Math.round(clamp(linearToSrgb(clamp(g, 0, 1)), 0, 1) * 255),
    Math.round(clamp(linearToSrgb(clamp(b, 0, 1)), 0, 1) * 255),
  ];
}

export function oklchToOklab(colour: Oklch): Oklab {
  const rad = (colour.h * Math.PI) / 180;
  return { l: colour.l, a: colour.c * Math.cos(rad), b: colour.c * Math.sin(rad) };
}

export function oklabToOklch(lab: Oklab): Oklch {
  const h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return { l: lab.l, c: Math.hypot(lab.a, lab.b), h: h < 0 ? h + 360 : h };
}

export function oklabToLinearRgb(lab: Oklab): LinearRGB {
  const lRoot = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mRoot = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sRoot = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function linearRgbToOklab(lin: LinearRGB): Oklab {
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklchToRgb(colour: Oklch): RGB {
  return linearRgbToRgb(oklabToLinearRgb(oklchToOklab(colour)));
}

export function rgbToOklab(rgb: RGB): Oklab {
  return linearRgbToOklab(rgbToLinearRgb(rgb));
}

export function rgbToOklch(rgb: RGB): Oklch {
  return oklabToOklch(rgbToOklab(rgb));
}

/**
 * Whether an OKLCh colour survives the trip to sRGB without being clamped.
 *
 * This matters more than it looks. A token written outside the gamut gets
 * silently clipped by the browser, so the colour that ships is not the colour
 * that was measured, and a gate that checks the written value passes while
 * the rendered one fails.
 */
export function isInGamut(colour: Oklch, epsilon = 5e-4): boolean {
  return oklabToLinearRgb(oklchToOklab(colour)).every(
    (channel) => channel >= -epsilon && channel <= 1 + epsilon,
  );
}

/** Accepts `#abc`, `#aabbcc`, `rgb(r g b)`, `rgba(r, g, b, a)` and `oklch(l c h)`. */
export function parseColor(input: ColorInput): RGB {
  if (typeof input !== "string") return input;
  const value = input.trim();

  if (HEX.test(value)) return hexToRgb(value);

  const rgbMatch = RGB_FN.exec(value);
  if (rgbMatch) {
    return [
      clamp(Number(rgbMatch[1]), 0, 255),
      clamp(Number(rgbMatch[2]), 0, 255),
      clamp(Number(rgbMatch[3]), 0, 255),
    ];
  }

  const oklchMatch = OKLCH_FN.exec(value);
  if (oklchMatch) {
    const l = Number(oklchMatch[1]) / (oklchMatch[2] ? 100 : 1);
    const c = Number(oklchMatch[3]) * (oklchMatch[4] ? 0.004 : 1);
    return oklchToRgb({ l, c, h: Number(oklchMatch[5]) });
  }

  throw new TypeError(`Unrecognised colour: ${JSON.stringify(input)}`);
}

/** Same as `parseColor`, but keeps the OKLCh triple when the input was one. */
export function parseOklch(input: string): Oklch | undefined {
  const match = OKLCH_FN.exec(input.trim());
  if (!match) return undefined;
  return {
    l: Number(match[1]) / (match[2] ? 100 : 1),
    c: Number(match[3]) * (match[4] ? 0.004 : 1),
    h: Number(match[5]),
  };
}
