#!/usr/bin/env node
/**
 * Command line entry point.
 *
 *   contrast-gate contrast.config.json
 *   contrast-gate contrast.config.json --json
 *
 * Exits 0 when every pair clears its minimum, 1 when any pair misses, and 2
 * when the configuration itself is wrong. The three codes are different on
 * purpose: a broken config failing the same way as a failing colour would
 * hide the bug.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { argv, exit, stderr, stdout } from "node:process";
import type { Level } from "./contrast.js";
import type { PairResult, PairSpec } from "./gate.js";
import { checkPairs, formatReport } from "./gate.js";

interface Config {
  readonly level?: Level;
  readonly requireInGamut?: boolean;
  /** One token set, when there is no theming. */
  readonly tokens?: Record<string, string>;
  /** Several token sets, checked one after the other. */
  readonly themes?: Record<string, Record<string, string>>;
  readonly pairs: PairSpec[];
}

const USAGE = `contrast-gate <config.json> [--json] [--quiet]

Checks every documented colour pair against its WCAG minimum, across every
theme in the config. Exit code 1 means at least one pair missed.`;

function fail(message: string): never {
  stderr.write(`${message}\n`);
  exit(2);
}

function loadConfig(path: string): Config {
  let raw: string;
  try {
    raw = readFileSync(resolvePath(path), "utf8");
  } catch {
    return fail(`Cannot read config: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    return fail(`Config is not valid JSON: ${(error as Error).message}`);
  }

  const config = parsed as Config;
  if (!Array.isArray(config.pairs) || config.pairs.length === 0) {
    return fail(`Config has no "pairs" array, so there is nothing to check.`);
  }
  if (!config.tokens && !config.themes) {
    return fail(`Config needs either "tokens" or "themes".`);
  }
  return config;
}

function main(): void {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    stdout.write(`${USAGE}\n`);
    exit(args.length === 0 ? 2 : 0);
  }

  const asJson = args.includes("--json");
  const quiet = args.includes("--quiet");
  const path = args.find((arg) => !arg.startsWith("-"));
  if (!path) fail(USAGE);

  const config = loadConfig(path);
  const themes: Record<string, Record<string, string>> =
    config.themes ?? { default: config.tokens ?? {} };

  const results: PairResult[] = [];
  for (const [theme, tokens] of Object.entries(themes)) {
    const options = {
      level: config.level ?? ("AA" as Level),
      tokens,
      theme: Object.keys(themes).length > 1 ? theme : undefined,
      requireInGamut: config.requireInGamut ?? false,
    };
    try {
      results.push(...checkPairs(config.pairs, options));
    } catch (error) {
      fail(`${theme}: ${(error as Error).message}`);
    }
  }

  const failures = results.filter((result) => !result.pass);

  if (asJson) {
    stdout.write(`${JSON.stringify({ passed: failures.length === 0, results }, null, 2)}\n`);
    exit(failures.length === 0 ? 0 : 1);
  }

  if (failures.length === 0) {
    if (!quiet) stdout.write(`${formatReport(results)}\n`);
    stdout.write(
      `contrast-gate: ${results.length} pair(s) across ` +
        `${Object.keys(themes).length} theme(s), 0 failures\n`,
    );
    exit(0);
  }

  stderr.write(`${formatReport(failures)}\n`);
  stderr.write(
    `contrast-gate: ${failures.length} of ${results.length} pair(s) below the minimum\n`,
  );
  exit(1);
}

main();
