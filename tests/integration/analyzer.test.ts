import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ControlFlowInvariantError,
  SourceParseError,
  analyzeSource,
  serializeAnalysisResult,
} from "../../src";
import { DeterministicControlFlowGraphBuilder } from "../../src/core/control-flow/control-flow-builder";
import { validateGraphInvariants } from "../../src/core/control-flow/graph-validator";
import type { ControlFlowGraph } from "../../src/domain/graph";

describe("Analysis Pipeline Integration", () => {
  test("analyzes canonical sample.ts correctly and deterministically", () => {
    const samplePath = resolve(import.meta.dir, "../../sample.ts");
    const sampleCode = readFileSync(samplePath, "utf-8");

    const result = analyzeSource(sampleCode, { filePath: "sample.ts" });
    expect(result.state).toBe("RESOLVED");
    expect(result.summary.totalScopes).toBe(2); // module + classifyScore
    expect(result.summary.totalBlocks).toBe(6);
    expect(result.summary.totalEdges).toBe(5);
    expect(result.summary.totalReachableBlocks).toBe(6);
    expect(result.summary.totalUnreachableBlocks).toBe(0);

    const serialized = serializeAnalysisResult(result);
    expect(typeof serialized).toBe("string");
    expect(serialized).toContain('"scopeName": "classifyScore@1:0"');
    expect(serialized).toContain('"state": "RESOLVED"');

    // Repeated analysis produces byte-for-byte identical output
    const repeated = serializeAnalysisResult(analyzeSource(sampleCode, { filePath: "sample.ts" }));
    expect(serialized).toBe(repeated);
  });

  test("analyzes complete TypeScript sample end-to-end", () => {
    const tsCode = `
      interface User { id: number; name: string; }
      function greet(user: User): string {
        if (user.id > 0) {
          return "Hello, " + user.name;
        }
        return "Anonymous";
      }
    `;

    const result = analyzeSource(tsCode, { filePath: "greet.ts" });
    expect(result.state).toBe("RESOLVED");
    expect(result.summary.totalScopes).toBe(2); // module + greet
    expect(result.summary.totalReachableBlocks).toBeGreaterThan(0);
  });

  test("analyzes standard JavaScript with multiple functions", () => {
    const jsCode = `
      function add(a, b) {
        return a + b;
      }
      function sub(a, b) {
        return a - b;
      }
    `;

    const result = analyzeSource(jsCode, { filePath: "math.js" });
    expect(result.state).toBe("RESOLVED");
    expect(result.summary.totalScopes).toBe(3); // module + add + sub
  });

  test("throws structured SourceParseError on invalid syntax", () => {
    const brokenCode = "function broken( { return 1;";

    expect(() => {
      analyzeSource(brokenCode, { filePath: "broken.ts" });
    }).toThrow(SourceParseError);
  });

  test("proves analyzeSource pipeline executes and satisfies graph invariants on representative cases", () => {
    const cases = [
      // Canonical sample
      readFileSync(resolve(import.meta.dir, "../../sample.ts"), "utf-8"),
      // Branching
      "function branch(x: number) { if (x > 0) { return 1; } else { return -1; } }",
      // Loop
      "function loop(n: number) { let i = 0; while (i < n) { i = i + 1; } return i; }",
      // Dead code after return
      "function dead() { return 1; const x = 2; }",
      // Literal false dead code
      readFileSync(resolve(import.meta.dir, "../../examples/unreachable.ts"), "utf-8"),
    ];

    for (const code of cases) {
      const result = analyzeSource(code);
      expect(result.controlFlowGraphs.length).toBeGreaterThan(0);
      for (const cfg of result.controlFlowGraphs) {
        const violations = validateGraphInvariants(cfg);
        expect(violations).toEqual([]);
      }
    }
  });

  test("handles cyclic control flow and loop reachability correctly in production pipeline", () => {
    const loopCode = `
      function computeFactorial(n: number): number {
        let result = 1;
        let i = 1;
        while (i <= n) {
          result = result * i;
          i = i + 1;
        }
        return result;
      }
    `;

    const result = analyzeSource(loopCode, { filePath: "loop.ts" });
    expect(result.state).toBe("RESOLVED");

    const fnCfg = result.controlFlowGraphs.find((g) => g.scopeName.startsWith("computeFactorial@"));
    expect(fnCfg).toBeDefined();

    // Verify loop-back edge is preserved
    const loopBackEdge = fnCfg?.edges.find((e) => e.kind === "loop-back");
    expect(loopBackEdge).toBeDefined();

    // Verify all loop blocks are reachable and 0 dead code
    expect(fnCfg?.unreachableBlockIds).toHaveLength(0);
    expect(fnCfg?.deadCodeStatementIds).toHaveLength(0);
    expect(fnCfg?.blocks.length).toBeGreaterThanOrEqual(4);
  });

  test("fails closed with ControlFlowInvariantError when internally-generated graph violates invariants", () => {
    const malformedGraph: ControlFlowGraph = {
      id: "cfg:broken.ts:module",
      filePath: "broken.ts",
      scopeName: "module",
      state: "RESOLVED",
      entryBlockId: "module:entry",
      exitBlockId: "module:exit",
      blocks: [], // violates entry-exists and exit-exists invariants
      edges: [],
      unreachableBlockIds: [],
      deadCodeStatementIds: [],
    };

    const spy = spyOn(DeterministicControlFlowGraphBuilder.prototype, "buildAll").mockReturnValue([
      malformedGraph,
    ]);

    try {
      expect(() => {
        analyzeSource("const x = 1;", { filePath: "broken.ts" });
      }).toThrow(ControlFlowInvariantError);
    } finally {
      spy.mockRestore();
    }
  });
});
