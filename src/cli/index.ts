#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SourceParseError, analyzeSource, serializeAnalysisResult } from "../index";
import { formatHumanSummary } from "./formatters";
import { colorize } from "./table";

function printUsage(): void {
  console.log(`LegacyExodus Analysis Sample
Deterministic control-flow analysis

Usage:
  bun run analyze <file> [options]

Options:
  --json        Output canonical JSON only
  --verbose     Show full graph diagnostics
  --help        Show this help message

Examples:
  bun run analyze sample.ts
  bun run analyze sample.ts --verbose
  bun run analyze sample.ts --json`);
}

export function runCli(args: readonly string[]): number {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return 0;
  }

  if (args.length === 0) {
    printUsage();
    return 1;
  }

  const jsonMode = args.includes("--json");
  const verboseMode = args.includes("--verbose");
  const fileArgs = args.filter((arg) => !arg.startsWith("--") && !arg.startsWith("-"));

  const targetPath = fileArgs[0];
  if (!targetPath) {
    const errorSymbol = colorize("✗", "31");
    console.error(`${errorSymbol} No target source file specified\n`);
    printUsage();
    return 1;
  }

  const fullPath = resolve(process.cwd(), targetPath);

  if (!existsSync(fullPath)) {
    const errorSymbol = colorize("✗", "31");
    console.error(`${errorSymbol} File not found\n\n  ${targetPath}`);
    return 1;
  }

  let source: string;
  try {
    source = readFileSync(fullPath, "utf-8");
  } catch (err) {
    const errorSymbol = colorize("✗", "31");
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${errorSymbol} Error reading file\n\n  ${targetPath}\n  ${msg}`);
    return 1;
  }

  try {
    const result = analyzeSource(source, { filePath: targetPath.replace(/\\/g, "/") });

    if (jsonMode) {
      process.stdout.write(serializeAnalysisResult(result));
    } else {
      console.log(formatHumanSummary(result, { verbose: verboseMode, source }));
    }

    return 0;
  } catch (error) {
    const errorSymbol = colorize("✗", "31");

    if (error instanceof SourceParseError) {
      const locationStr = error.location ? `${error.location.line}:${error.location.column}` : "";
      const reason = error.message.replace(/\s*\(\d+:\d+\).*/g, "").trim() || error.message;

      let out = `${errorSymbol} Analysis failed\n\n`;
      out += `File      ${targetPath}\n`;
      if (locationStr) {
        out += `Location  ${locationStr}\n`;
      }
      out += `Reason    ${reason}`;
      console.error(out);
      return 2;
    }

    const msg = error instanceof Error ? error.message : String(error);
    console.error(`${errorSymbol} Analysis failed\n\nFile      ${targetPath}\nReason    ${msg}`);
    return 1;
  }
}

// Only auto-run if executed directly as entrypoint
if (import.meta.main) {
  const exitCode = runCli(process.argv.slice(2));
  process.exit(exitCode);
}
