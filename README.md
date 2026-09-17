# contrast-gate

A WCAG 2.1 contrast gate for design tokens. Zero runtime dependencies. It
reads the colour pairs you say matter, measures them across every theme, and
exits non-zero when one of them drops below its minimum.

The point is not to have a checker. Plenty of those exist, and they all run
after the fact, on a screen someone remembered to look at. The point is to
turn "these colours are readable" from an opinion into a claim the build can
refuse to ship.

```
  pass  dark: body text on card        14.47:1  min 4.5  #f3f0e9 on #1a1f2b
  pass  dark: placeholder in field      4.91:1  min 4.5  #908c83 on #1a1f2b
  FAIL  light: placeholder in field     2.03:1  min 4.5  #b3b3b3 on #ffffff
contrast-gate: 1 of 34 pair(s) below the minimum
```

That failing line is real. It came from my own portfolio, where the token set
was fully validated and the placeholder colour was not a token at all, so it
fell through to the browser default and sat at 2:1 in the light theme. A gate
only covers what you write down, which is an argument for writing down more,
not for trusting the eye.

## Install

```sh
npm install --save-dev @kaykesiquara/contrast-gate
```

Node 20 or newer. No dependencies, runtime or otherwise, beyond TypeScript for
building from source.

## Use it as a build gate

Create `contrast.config.json`:

```json
{
  "level": "AA",
  "requireInGamut": true,
  "themes": {
    "light": {
      "bg": "oklch(0.975 0.006 85)",
      "ink": "oklch(0.235 0.026 266)",
      "accent": "oklch(0.480 0.110 52)",
      "border": "oklch(0.615 0.016 266)"
    },
    "dark": {
      "bg": "oklch(0.190 0.022 266)",
      "ink": "oklch(0.955 0.010 85)",
      "accent": "oklch(0.800 0.130 62)",
      "border": "oklch(0.530 0.022 266)"
    }
  },
  "pairs": [
    { "name": "body text", "fg": "ink", "bg": "bg" },
    { "name": "accent text", "fg": "accent", "bg": "bg" },
    { "name": "control border", "fg": "border", "bg": "bg", "size": "nonText" }
  ]
}
```

Then wire it into the scripts that already run:

```json
{
  "scripts": {
    "gate": "contrast-gate contrast.config.json",
    "build": "npm run gate && vite build"
  }
}
```

Every pair is checked against every theme, so the config above runs six
checks. Exit codes are `0` for a clean run, `1` when a pair misses, and `2`
when the configuration itself is wrong. Those are deliberately different: a
malformed config failing the same way as a failing colour would hide the bug.

`--json` prints machine-readable results for a CI annotation step. `--quiet`
suppresses the passing lines and prints only the summary.

## Use it from code

```ts
import { assertPairs, contrastRatio, oklabDistance } from "@kaykesiquara/contrast-gate";

contrastRatio("#767676", "#ffffff"); // 4.54
contrastRatio("oklch(0.45 0.085 168)", "#f7f9fc"); // 6.75

assertPairs(
  [
    { name: "body text", fg: "ink", bg: "bg" },
    { name: "focus ring", fg: "accent", bg: "bg", size: "nonText" },
  ],
  { tokens, level: "AA", theme: "light" },
); // throws ContrastGateError listing every failure
```

`checkPairs` returns the same results without throwing, which is what you want
inside a test or a documentation page that renders its own audit.

## Two different questions

`contrastRatio` answers **can this be read**. It works on relative luminance,
which is why two colours of the same lightness score close to 1:1 no matter
how far apart their hues are.

`oklabDistance` answers **can these two be told apart**. Different question,
and the one that matters when a status colour sits next to another status
colour in the same table.

```ts
const red = "oklch(0.72 0.15 20)";
const teal = "oklch(0.72 0.15 200)";

contrastRatio(red, teal); // 1.17, contrast is nearly blind here
oklabDistance(red, teal); // 0.27, OKLab sees them clearly
```

This is not academic. A user on a system I built reported that she could not
tell an orange amount from a red one in a number set at 14 pixels. Both passed
contrast against the background, so the audit was clean. Measuring the
perceptual distance between them in OKLab is what found the problem, and
moving orange to 56 degrees and red to 20, opening 36 between them, is what
fixed it.

There is no threshold in any standard for this number. It is a measuring tool,
not a pass mark: use it to compare a before and an after on the same pair.

## Gamut

`requireInGamut` fails any pair whose OKLCh source falls outside sRGB.

This catches a quiet class of bug. A token written outside the gamut gets
clamped by the browser, so the colour that ships is not the colour that was
measured, and a gate checking the written value passes while the rendered one
does not.

```ts
isInGamut({ l: 0.45, c: 0.085, h: 168 }); // true
isInGamut({ l: 0.45, c: 0.1, h: 168 }); // false, the browser will clamp it
```

The check only applies to values written as `oklch()`. Hex and `rgb()` are in
gamut by construction.

## Thresholds

| kind | what it covers | AA | AAA |
| --- | --- | --- | --- |
| `body` | normal text, WCAG 1.4.3 and 1.4.6 | 4.5 | 7 |
| `large` | 18pt, or 14pt bold, and up | 3 | 4.5 |
| `nonText` | control borders, focus rings, icons that carry meaning, WCAG 1.4.11 | 3 | 3 |

`nonText` has no AAA level of its own, so the AA value stands. A single pair
can override the level entirely with `min`.

## API

**Colour**
`parseColor`, `parseOklch`, `hexToRgb`, `rgbToHex`, `oklchToRgb`, `rgbToOklch`,
`rgbToOklab`, `oklchToOklab`, `oklabToOklch`, `oklabToLinearRgb`,
`linearRgbToOklab`, `srgbToLinear`, `linearToSrgb`, `isInGamut`

**Measurement**
`contrastRatio`, `relativeLuminance`, `oklabDistance`, `meets`, `minimumFor`,
`isReadable`, `MINIMUM`

**Gate**
`checkPairs`, `assertPairs`, `formatReport`, `ContrastGateError`

Everything is pure. Nothing reads the DOM, the filesystem or the environment,
which is what lets the same code run in a build gate, in a test and in the
browser.

## Notes on the maths

The sRGB transfer function follows IEC 61966-2-1. The OKLab and OKLCh matrices
are Björn Ottosson's, from *A perceptual color space for image processing*
(2020). Relative luminance and the contrast formula are WCAG 2.1, section 1.4.

The test suite asserts against the values everyone quotes: 21:1 for black on
white, 4.54:1 for `#767676` on white, which is the darkest grey that still
clears AA body text, and 3.03:1 for `#949494`.

## Develop

```sh
npm install
npm test            # builds, then runs the suite on node:test
npx tsc --noEmit    # type check only
npm run gate        # runs the gate against the example token set
```

Tests use Node's built-in runner, so the dependency count stays at zero for
consumers and at two for contributors.

## Licence

MIT. See [LICENSE](LICENSE).
