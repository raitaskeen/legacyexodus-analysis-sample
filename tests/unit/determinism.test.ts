import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeSource, serializeAnalysisResult } from "../../src";
import { IF_ELSE_SOURCE, WHILE_LOOP_SOURCE } from "../fixtures/test-cases";

describe("Deterministic Serialization", () => {
  test("produces byte-for-byte identical output over 5 repeated runs", () => {
    const outputs: string[] = [];

    for (let i = 0; i < 5; i++) {
      const result = analyzeSource(IF_ELSE_SOURCE, { filePath: "repeated.ts" });
      const serialized = serializeAnalysisResult(result);
      outputs.push(serialized);
    }

    const first = outputs[0];
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toBe(first);
    }
  });

  test("produces deterministic output across different scope ordering", () => {
    const run1 = serializeAnalysisResult(
      analyzeSource(WHILE_LOOP_SOURCE, { filePath: "order.ts" })
    );
    const run2 = serializeAnalysisResult(
      analyzeSource(WHILE_LOOP_SOURCE, { filePath: "order.ts" })
    );

    expect(run1).toBe(run2);
  });

  test("matches golden fixture for basic-branch.ts", () => {
    const sourcePath = resolve(import.meta.dir, "../../examples/basic-branch.ts");
    const goldenPath = resolve(import.meta.dir, "../../examples/expected/basic-branch.json");

    const source = readFileSync(sourcePath, "utf-8");
    const golden = readFileSync(goldenPath, "utf-8");

    const result = analyzeSource(source, { filePath: "examples/basic-branch.ts" });
    const serialized = serializeAnalysisResult(result);

    expect(serialized.replace(/\r\n/g, "\n")).toBe(golden.replace(/\r\n/g, "\n"));
  });

  test("matches golden fixture for unreachable.ts", () => {
    const sourcePath = resolve(import.meta.dir, "../../examples/unreachable.ts");
    const goldenPath = resolve(import.meta.dir, "../../examples/expected/unreachable.json");

    const source = readFileSync(sourcePath, "utf-8");
    const golden = readFileSync(goldenPath, "utf-8");

    const result = analyzeSource(source, { filePath: "examples/unreachable.ts" });
    const serialized = serializeAnalysisResult(result);

    expect(serialized.replace(/\r\n/g, "\n")).toBe(golden.replace(/\r\n/g, "\n"));
  });
});

describe("Portability, Determinism & Line-Ending Invariants", () => {
  test("produces byte-for-byte identical output over 10 repeated runs", () => {
    const outputs: string[] = [];

    for (let i = 0; i < 10; i++) {
      const result = analyzeSource(IF_ELSE_SOURCE, { filePath: "run.ts" });
      const serialized = serializeAnalysisResult(result);
      outputs.push(serialized);
    }

    const first = outputs[0];
    if (!first) {
      throw new Error("Expected outputs[0] to be defined");
    }
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toBe(first);
    }
  });

  test("produces equivalent control-flow graphs for LF and CRLF line endings", () => {
    const lfSource =
      "function test(x: number) {\n  if (x > 0) {\n    return 1;\n  }\n  return 0;\n}";
    const crlfSource =
      "function test(x: number) {\r\n  if (x > 0) {\r\n    return 1;\r\n  }\r\n  return 0;\r\n}";

    const lfResult = analyzeSource(lfSource, { filePath: "test.ts" });
    const crlfResult = analyzeSource(crlfSource, { filePath: "test.ts" });

    expect(lfResult.state).toBe("RESOLVED");
    expect(crlfResult.state).toBe("RESOLVED");

    const lfFn = lfResult.controlFlowGraphs.find((c) => c.scopeName.startsWith("test@"));
    const crlfFn = crlfResult.controlFlowGraphs.find((c) => c.scopeName.startsWith("test@"));
    if (!lfFn || !crlfFn) {
      throw new Error("Expected test CFGs to be defined");
    }

    expect(lfFn.blocks.length).toBe(crlfFn.blocks.length);
    expect(lfFn.edges.length).toBe(crlfFn.edges.length);
    expect(lfFn.edges.map((e) => e.kind)).toEqual(crlfFn.edges.map((e) => e.kind));
  });

  test("handles path normalization with forward slashes across operating systems", () => {
    const winPath = "src\\nested\\module.ts";
    const result = analyzeSource("const x = 1;", { filePath: winPath.replace(/\\/g, "/") });
    expect(result.filePath).toBe("src/nested/module.ts");
    expect(result.controlFlowGraphs[0]?.id).toBe("cfg:src/nested/module.ts:module");
  });
});
