import { describe, expect, test } from "bun:test";
import { unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runCli } from "../../src/cli/index";
import {
  renderKeyValueTable,
  renderTable,
  stripAnsi,
  truncateCell,
  visibleLength,
} from "../../src/cli/table";

function captureCli(args: readonly string[]): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  let stdout = "";
  let stderr = "";
  const origLog = console.log;
  const origErr = console.error;
  const origWrite = process.stdout.write;

  try {
    console.log = (...msgs: unknown[]) => {
      stdout += `${msgs.map(String).join(" ")}\n`;
    };
    console.error = (...msgs: unknown[]) => {
      stderr += `${msgs.map(String).join(" ")}\n`;
    };
    process.stdout.write = (chunk: string | Uint8Array) => {
      stdout += String(chunk);
      return true;
    };

    const exitCode = runCli(args);
    return { exitCode, stdout, stderr };
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.stdout.write = origWrite;
  }
}

describe("CLI Integration & Table Presentation", () => {
  describe("Default Output", () => {
    test("renders compact table output for canonical sample.ts without verbose diagnostics", () => {
      const { exitCode, stdout } = captureCli(["sample.ts"]);
      expect(exitCode).toBe(0);

      // Heading present
      expect(stdout).toContain("LegacyExodus Analysis Sample");
      expect(stdout).toContain("Deterministic control-flow analysis");

      // Summary table present
      expect(stdout).toContain("File");
      expect(stdout).toContain("sample.ts");
      expect(stdout).toContain("State");
      expect(stdout).toContain("RESOLVED");
      expect(stdout).toContain("Scopes");
      expect(stdout).toContain("Blocks");

      // Scope table present
      expect(stdout).toContain("Scopes");
      expect(stdout).toContain("module");
      expect(stdout).toContain("classifyScore@1:0");

      // Primary CFG table present
      expect(stdout).toContain("Control Flow · classifyScore@1:0");
      expect(stdout).toContain("entry");
      expect(stdout).toContain("b1");
      expect(stdout).toContain("b2");
      expect(stdout).toContain("exit");
      expect(stdout).toContain("b1 [true], b2 [false]");
      expect(stdout).toContain("exit [return]");

      // Full predecessor/successor dumps absent in default mode
      expect(stdout).not.toContain("Predecessors:");
      expect(stdout).not.toContain("Successors:");
      expect(stdout).not.toContain("DETAILED GRAPH DIAGNOSTICS");

      // Completion message
      expect(stdout).toContain("Analysis complete");
    });
  });

  describe("Verbose Mode", () => {
    test("renders full graph diagnostics with --verbose flag", () => {
      const { exitCode, stdout } = captureCli(["sample.ts", "--verbose"]);
      expect(exitCode).toBe(0);

      // Verbose section present
      expect(stdout).toContain("DETAILED GRAPH DIAGNOSTICS (--verbose)");

      // Full block IDs present
      expect(stdout).toContain("classifyScore@1:0:entry");
      expect(stdout).toContain("classifyScore@1:0:b1");
      expect(stdout).toContain("classifyScore@1:0:exit");

      // Predecessor and successor details present
      expect(stdout).toContain("Predecessors:");
      expect(stdout).toContain("Successors:");
      expect(stdout).toContain("Terminator:");
      expect(stdout).toContain("Edges (4):");
    });
  });

  describe("JSON Mode", () => {
    test("outputs strictly valid JSON with no ANSI, headings, or table borders", () => {
      const { exitCode, stdout } = captureCli(["sample.ts", "--json"]);
      expect(exitCode).toBe(0);

      // Must be valid JSON
      const parsed = JSON.parse(stdout);
      expect(parsed.filePath).toBe("sample.ts");
      expect(parsed.state).toBe("RESOLVED");
      expect(parsed.summary.totalScopes).toBe(2);

      // No headers, tables, or ANSI escape codes
      expect(stdout).not.toContain("LegacyExodus Analysis Sample");
      expect(stdout).not.toContain("┌");
      expect(stdout).not.toContain("│");
      expect(stdout).not.toContain("\x1b");
    });
  });

  describe("Unsupported Control Flow", () => {
    test("displays UNSUPPORTED state and precision notice with detected features", () => {
      const { exitCode, stdout } = captureCli(["examples/unsupported.ts"]);
      expect(exitCode).toBe(0);

      expect(stdout).toContain("UNSUPPORTED");
      expect(stdout).toContain("Partial control-flow precision");
      expect(stdout).toContain("Unsupported control-flow semantics were detected");
      expect(stdout).toContain("LogicalExpression (&&)");
      expect(stdout).toContain("Use --verbose for graph details");
    });

    test("displays UNSUPPORTED state and generic notice for break statement", () => {
      const tempPath = resolve(import.meta.dir, "../../temp_cli_break.ts");
      writeFileSync(tempPath, "function testBreak() { while (true) { break; } }");
      try {
        const { exitCode, stdout } = captureCli([tempPath]);
        expect(exitCode).toBe(0);
        expect(stdout).toContain("UNSUPPORTED");
        expect(stdout).toContain("BreakStatement");
        expect(stdout).toContain("Unsupported control-flow semantics were detected");
        expect(stdout).not.toContain("Expression-level conditional execution was detected");
      } finally {
        unlinkSync(tempPath);
      }
    });

    test("displays UNSUPPORTED state and generic notice for throw statement", () => {
      const tempPath = resolve(import.meta.dir, "../../temp_cli_throw.ts");
      writeFileSync(tempPath, "function testThrow() { throw new Error('fail'); }");
      try {
        const { exitCode, stdout } = captureCli([tempPath]);
        expect(exitCode).toBe(0);
        expect(stdout).toContain("UNSUPPORTED");
        expect(stdout).toContain("ThrowStatement");
        expect(stdout).toContain("Unsupported control-flow semantics were detected");
        expect(stdout).not.toContain("Expression-level conditional execution was detected");
      } finally {
        unlinkSync(tempPath);
      }
    });
  });

  describe("Dead Code Presentation", () => {
    test("highlights UNREACHABLE blocks and shows summary count", () => {
      const { exitCode, stdout } = captureCli(["examples/unreachable.ts"]);
      expect(exitCode).toBe(0);

      const plain = stripAnsi(stdout);
      expect(plain).toContain("UNREACHABLE");
      expect(plain).toContain("Unreachable blocks: 2");
      expect(plain).toContain("│ b1");
      expect(plain).toContain("│ b3");

      const b1Line = plain.split("\n").find((line) => line.includes("│ b1"));
      const b3Line = plain.split("\n").find((line) => line.includes("│ b3"));
      expect(b1Line).toBeDefined();
      expect(b1Line).toContain("UNREACHABLE");
      expect(b3Line).toBeDefined();
      expect(b3Line).toContain("UNREACHABLE");
    });

    test("handles colorized terminal output gracefully when TTY is active", () => {
      const origIsTTY = process.stdout.isTTY;
      const origNoColor = process.env.NO_COLOR;
      const origCI = process.env.CI;
      try {
        Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
        // biome-ignore lint/performance/noDelete: Environment variable deletion required in Node.js
        delete process.env.NO_COLOR;
        // biome-ignore lint/performance/noDelete: Environment variable deletion required in Node.js
        delete process.env.CI;

        const { exitCode, stdout } = captureCli(["examples/unreachable.ts"]);
        expect(exitCode).toBe(0);
        // Expect ANSI codes to be present in color-enabled mode
        expect(stdout).toContain("\x1b[31m2\x1b[0m");

        // Strip ANSI and verify exact human message
        const plain = stripAnsi(stdout);
        expect(plain).toContain("Unreachable blocks: 2");
        expect(plain).toContain("UNREACHABLE");
      } finally {
        Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
        if (origNoColor !== undefined) process.env.NO_COLOR = origNoColor;
        if (origCI !== undefined) process.env.CI = origCI;
      }
    });
  });

  describe("Error Handling", () => {
    test("returns code 1 with clean message when file does not exist", () => {
      const { exitCode, stderr } = captureCli(["non-existent-file.ts"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("File not found");
      expect(stderr).toContain("non-existent-file.ts");
      expect(stderr).not.toContain("Error:");
    });

    test("returns code 1 when no arguments are provided", () => {
      const { exitCode, stdout } = captureCli([]);
      expect(exitCode).toBe(1);
      expect(stdout).toContain("Usage:");
      expect(stdout).toContain("Options:");
    });

    test("returns code 2 with file, location, and reason on syntax errors", () => {
      const tempFile = resolve(process.cwd(), "temp-invalid-syntax.ts");
      writeFileSync(tempFile, "function ( { broken syntax", "utf-8");
      try {
        const { exitCode, stderr } = captureCli([tempFile]);
        expect(exitCode).toBe(2);
        expect(stderr).toContain("Analysis failed");
        expect(stderr).toContain("File      ");
        expect(stderr).toContain("temp-invalid-syntax.ts");
        expect(stderr).toContain("Location  1:9");
        expect(stderr).toContain("Reason    Unexpected token");
      } finally {
        unlinkSync(tempFile);
      }
    });

    test("handles file paths containing spaces correctly", () => {
      const tempFile = resolve(process.cwd(), "temp file with spaces.ts");
      writeFileSync(tempFile, "function test() { return 1; }", "utf-8");
      try {
        const { exitCode } = captureCli([tempFile]);
        expect(exitCode).toBe(0);
      } finally {
        unlinkSync(tempFile);
      }
    });
  });

  describe("Help Output", () => {
    test("returns code 0 and documents --json, --verbose, and --help", () => {
      const { exitCode, stdout } = captureCli(["--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage:");
      expect(stdout).toContain("--json");
      expect(stdout).toContain("--verbose");
      expect(stdout).toContain("--help");
      expect(stdout).toContain("Examples:");
    });
  });

  describe("Table Formatter Primitives", () => {
    test("calculates visible length correctly ignoring ANSI escape sequences", () => {
      expect(visibleLength("hello")).toBe(5);
      expect(visibleLength("\x1b[32mhello\x1b[0m")).toBe(5);
      expect(stripAnsi("\x1b[31;1mError\x1b[0m")).toBe("Error");
    });

    test("truncates cells exceeding maximum column width", () => {
      expect(truncateCell("short", 10)).toBe("short");
      expect(truncateCell("a very long text that exceeds limit", 10)).toBe("a very lo…");
      expect(truncateCell("text", 1)).toBe("…");
    });

    test("renders well-formed key/value table with Unicode borders", () => {
      const rendered = renderKeyValueTable([
        ["Key1", "Val1"],
        ["KeyLong", "ValLong"],
      ]);
      expect(rendered).toContain("┌");
      expect(rendered).toContain("┐");
      expect(rendered).toContain("│ Key1");
      expect(rendered).toContain("Val1");
      expect(rendered).toContain("└");
      expect(rendered).toContain("┘");
    });

    test("renders well-formed multi-column table with header separator", () => {
      const rendered = renderTable(
        ["Col1", "Col2"],
        [
          ["A", "B"],
          ["C", "D"],
        ]
      );
      expect(rendered).toContain("┌");
      expect(rendered).toContain("┬");
      expect(rendered).toContain("├");
      expect(rendered).toContain("┼");
      expect(rendered).toContain("└");
      expect(rendered).toContain("┴");
    });
  });
});
