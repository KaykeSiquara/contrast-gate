import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MINIMUM, contrastRatio, isReadable, meets, oklabDistance } from "./contrast.js";
import { ContrastGateError, assertPairs, checkPairs, formatReport } from "./gate.js";

const near = (actual: number, expected: number, tolerance = 0.01) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected} within ${tolerance}, got ${actual}`,
  );

describe("contrastRatio", () => {
  it("hits the extremes of the scale", () => {
    assert.equal(contrastRatio("#000000", "#ffffff"), 21);
    assert.equal(contrastRatio("#4a4a4a", "#4a4a4a"), 1);
  });

  it("agrees with the values everyone quotes", () => {
    // #767676 is the darkest grey that still clears 4.5:1 on white.
    near(contrastRatio("#767676", "#ffffff"), 4.54);
    near(contrastRatio("#777777", "#ffffff"), 4.48);
    near(contrastRatio("#949494", "#ffffff"), 3.03);
    near(contrastRatio("#595959", "#ffffff"), 7.0);
  });

  it("does not care which colour comes first", () => {
    assert.equal(contrastRatio("#11644c", "#f7f9fc"), contrastRatio("#f7f9fc", "#11644c"));
  });

  it("works straight off an oklch token", () => {
    near(contrastRatio("oklch(0.45 0.085 168)", "oklch(0.982 0.004 248)"), 6.75);
  });
});

describe("meets", () => {
  it("uses AA body text by default", () => {
    assert.equal(meets(4.5), true);
    assert.equal(meets(4.49), false);
  });

  it("knows the other thresholds", () => {
    assert.equal(meets(3, { size: "large" }), true);
    assert.equal(meets(3, { size: "nonText" }), true);
    assert.equal(meets(4.5, { level: "AAA" }), false);
    assert.equal(meets(7, { level: "AAA" }), true);
    assert.equal(MINIMUM.AAA.large, 4.5);
  });

  it("isReadable is the same question, asked about two colours", () => {
    assert.equal(isReadable("#767676", "#ffffff"), true);
    assert.equal(isReadable("#777777", "#ffffff"), false);
  });
});

describe("oklabDistance", () => {
  it("is zero for a colour against itself", () => {
    assert.equal(oklabDistance("#f9aa60", "#f9aa60"), 0);
  });

  it("measures what contrast cannot see", () => {
    // Same perceptual lightness, opposite hues. Relative luminance is not a
    // function of OKLab lightness alone, so the ratio is not exactly 1, but it
    // stays far below any threshold: contrast has no opinion about hue.
    const red = "oklch(0.72 0.15 20)";
    const teal = "oklch(0.72 0.15 200)";
    assert.ok(contrastRatio(red, teal) < 1.3, "contrast should be near blind here");
    assert.ok(oklabDistance(red, teal) > 0.2, "OKLab should see them clearly");
  });

  it("reproduces the hue separation shipped in the design system", () => {
    // Orange moved to 56 degrees, red to 20, opening 36 between them.
    near(oklabDistance("oklch(0.8 0.115 56)", "oklch(0.72 0.15 20)"), 0.119, 0.002);
  });
});

describe("checkPairs", () => {
  const tokens = {
    bg: "oklch(0.982 0.004 248)",
    ink: "oklch(0.245 0.02 252)",
    accent: "oklch(0.45 0.085 168)",
    faint: "#bbbbbb",
  };

  it("resolves token names and reports both hexes", () => {
    const [result] = checkPairs([{ fg: "ink", bg: "bg" }], { tokens });
    assert.ok(result);
    assert.equal(result.pass, true);
    assert.equal(result.fgHex, "#1a212a");
    assert.equal(result.bgHex, "#f7f9fc");
    assert.equal(result.name, "ink / bg");
  });

  it("accepts a literal colour where a token name would go", () => {
    const [result] = checkPairs([{ fg: "#000000", bg: "#ffffff" }], {});
    assert.equal(result?.ratio, 21);
  });

  it("applies the minimum for the kind of content", () => {
    const [body, nonText] = checkPairs(
      [
        { name: "faint as text", fg: "faint", bg: "bg" },
        { name: "faint as a border", fg: "faint", bg: "bg", size: "nonText" },
      ],
      { tokens },
    );
    assert.equal(body?.minimum, 4.5);
    assert.equal(nonText?.minimum, 3);
    assert.equal(body?.pass, false);
  });

  it("lets a single pair override the level", () => {
    const [result] = checkPairs([{ fg: "faint", bg: "bg", min: 1.5 }], { tokens });
    assert.equal(result?.minimum, 1.5);
    assert.equal(result?.pass, true);
  });

  it("can fail a token the browser would clamp", () => {
    const outside = { bad: "oklch(0.45 0.1 168)", bg: "#f7f9fc" };
    const [lenient] = checkPairs([{ fg: "bad", bg: "bg" }], { tokens: outside });
    const [strict] = checkPairs([{ fg: "bad", bg: "bg" }], {
      tokens: outside,
      requireInGamut: true,
    });
    assert.equal(lenient?.pass, true);
    assert.equal(strict?.inGamut, false);
    assert.equal(strict?.pass, false);
  });

  it("tags every result with the theme it came from", () => {
    const [result] = checkPairs([{ fg: "ink", bg: "bg" }], { tokens, theme: "light" });
    assert.equal(result?.theme, "light");
  });
});

describe("assertPairs", () => {
  const tokens = { ink: "#1a212a", bg: "#f7f9fc", faint: "#dddddd" };

  it("stays quiet when everything clears", () => {
    assert.doesNotThrow(() => assertPairs([{ fg: "ink", bg: "bg" }], { tokens }));
  });

  it("throws a typed error carrying every result", () => {
    try {
      assertPairs(
        [
          { name: "ink on bg", fg: "ink", bg: "bg" },
          { name: "faint on bg", fg: "faint", bg: "bg" },
        ],
        { tokens },
      );
      assert.fail("the gate should have thrown");
    } catch (error) {
      assert.ok(error instanceof ContrastGateError);
      assert.equal(error.results.length, 2);
      assert.equal(error.failures.length, 1);
      assert.equal(error.failures[0]?.name, "faint on bg");
      assert.match(error.message, /1 of 2 pair\(s\)/);
      assert.match(error.message, /faint on bg/);
    }
  });
});

describe("formatReport", () => {
  const results = checkPairs(
    [
      { name: "ink / bg", fg: "#1a212a", bg: "#f7f9fc" },
      { name: "faint / bg", fg: "#dddddd", bg: "#f7f9fc" },
    ],
    {},
  );

  it("prints the verdict, the ratio and the resolved colours", () => {
    const report = formatReport(results);
    assert.match(report, /pass {2}ink \/ bg/);
    assert.match(report, /FAIL {2}faint \/ bg/);
    assert.match(report, /#1a212a on #f7f9fc/);
  });

  it("can show only what failed", () => {
    const report = formatReport(results, { verbose: false });
    assert.doesNotMatch(report, /ink \/ bg/);
    assert.match(report, /faint \/ bg/);
  });

  it("returns an empty string when there is nothing to show", () => {
    assert.equal(formatReport([]), "");
  });
});
