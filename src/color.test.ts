import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hexToRgb,
  isInGamut,
  oklchToRgb,
  parseColor,
  parseOklch,
  rgbToHex,
  rgbToOklch,
  srgbToLinear,
} from "./color.js";

describe("hex parsing", () => {
  it("reads six digits, with or without the hash", () => {
    assert.deepEqual(hexToRgb("#1a212a"), [26, 33, 42]);
    assert.deepEqual(hexToRgb("1a212a"), [26, 33, 42]);
  });

  it("expands the three digit shorthand", () => {
    assert.deepEqual(hexToRgb("#fff"), [255, 255, 255]);
    assert.deepEqual(hexToRgb("#0a4"), [0, 170, 68]);
  });

  it("is case insensitive", () => {
    assert.deepEqual(hexToRgb("#AABBCC"), hexToRgb("#aabbcc"));
  });

  it("refuses anything else", () => {
    assert.throws(() => hexToRgb("#12345"), TypeError);
    assert.throws(() => hexToRgb("rebeccapurple"), TypeError);
  });

  it("round trips", () => {
    for (const hex of ["#000000", "#ffffff", "#11644c", "#f9aa60"]) {
      assert.equal(rgbToHex(hexToRgb(hex)), hex);
    }
  });
});

describe("sRGB transfer function", () => {
  it("is continuous at the join", () => {
    const below = srgbToLinear(0.04045 - 1e-9);
    const above = srgbToLinear(0.04045 + 1e-9);
    assert.ok(Math.abs(below - above) < 1e-6);
  });

  it("maps the endpoints exactly", () => {
    assert.equal(srgbToLinear(0), 0);
    assert.ok(Math.abs(srgbToLinear(1) - 1) < 1e-12);
  });
});

describe("OKLCh", () => {
  it("converts the tokens the portfolio actually ships", () => {
    assert.equal(rgbToHex(oklchToRgb({ l: 0.982, c: 0.004, h: 248 })), "#f7f9fc");
    assert.equal(rgbToHex(oklchToRgb({ l: 0.245, c: 0.02, h: 252 })), "#1a212a");
    assert.equal(rgbToHex(oklchToRgb({ l: 0.45, c: 0.085, h: 168 })), "#11644c");
  });

  it("puts white and black where they belong", () => {
    assert.equal(rgbToHex(oklchToRgb({ l: 1, c: 0, h: 0 })), "#ffffff");
    assert.equal(rgbToHex(oklchToRgb({ l: 0, c: 0, h: 0 })), "#000000");
  });

  it("round trips through RGB within a rounding step", () => {
    const source = { l: 0.62, c: 0.12, h: 145 };
    const back = rgbToOklch(oklchToRgb(source));
    assert.ok(Math.abs(back.l - source.l) < 0.01, `l drifted to ${back.l}`);
    assert.ok(Math.abs(back.c - source.c) < 0.01, `c drifted to ${back.c}`);
    assert.ok(Math.abs(back.h - source.h) < 1.5, `h drifted to ${back.h}`);
  });

  it("detects colours the browser would silently clamp", () => {
    assert.equal(isInGamut({ l: 0.45, c: 0.085, h: 168 }), true);
    assert.equal(isInGamut({ l: 0.45, c: 0.1, h: 168 }), false);
    assert.equal(isInGamut({ l: 0.8, c: 0.135, h: 56 }), false);
    assert.equal(isInGamut({ l: 0.8, c: 0.115, h: 56 }), true);
  });
});

describe("parseColor", () => {
  it("accepts every notation the token files use", () => {
    assert.deepEqual(parseColor("#ffffff"), [255, 255, 255]);
    assert.deepEqual(parseColor("rgb(255 255 255)"), [255, 255, 255]);
    assert.deepEqual(parseColor("rgba(255, 255, 255, 0.5)"), [255, 255, 255]);
    assert.equal(rgbToHex(parseColor("oklch(0.45 0.085 168)")), "#11644c");
  });

  it("passes an already parsed triple straight through", () => {
    assert.deepEqual(parseColor([1, 2, 3]), [1, 2, 3]);
  });

  it("names the offending value when it gives up", () => {
    assert.throws(() => parseColor("chartreuse"), /chartreuse/);
  });
});

describe("parseOklch", () => {
  it("keeps the triple so gamut can be checked on the source", () => {
    assert.deepEqual(parseOklch("oklch(0.8 0.115 56)"), { l: 0.8, c: 0.115, h: 56 });
  });

  it("returns undefined for other notations", () => {
    assert.equal(parseOklch("#ffffff"), undefined);
  });
});
