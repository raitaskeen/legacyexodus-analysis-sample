import { describe, expect, test } from "bun:test";
import { analyzeSource } from "../../src";
import { DeterministicControlFlowGraphBuilder } from "../../src/core/control-flow/control-flow-builder";
import { assertGraphInvariants } from "../../src/core/control-flow/graph-validator";
import { SourceParser } from "../../src/core/parser/parser";
import { computeReachability } from "../../src/core/reachability/reachability";
import { SourceParseError } from "../../src/domain/errors";
import type { BasicBlock, ControlFlowEdge } from "../../src/domain/graph";
import {
  IF_ELSE_SOURCE,
  SEQUENTIAL_SOURCE,
  SHORT_CIRCUIT_SOURCE,
  UNREACHABLE_BRANCH_SOURCE,
  UNREACHABLE_LOOP_SOURCE,
  WHILE_LOOP_SOURCE,
} from "../fixtures/test-cases";

describe("DeterministicControlFlowGraphBuilder", () => {
  const parser = new SourceParser();
  const builder = new DeterministicControlFlowGraphBuilder();

  test("models sequential statements within a basic block", () => {
    const ast = parser.parse(SEQUENTIAL_SOURCE, "seq.ts");
    const cfg = builder.build(ast, "seq.ts");

    expect(cfg.scopeName).toBe("module");
    expect(cfg.state).toBe("RESOLVED");
    expect(cfg.blocks.length).toBeGreaterThanOrEqual(2);
    expect(cfg.unreachableBlockIds).toHaveLength(0);
    expect(cfg.deadCodeStatementIds).toHaveLength(0);
  });

  test("models if/else branching with true, false, and join edges", () => {
    const ast = parser.parse(IF_ELSE_SOURCE, "if-else.ts");
    const cfgs = builder.buildAll(ast, "if-else.ts");
    const fnCfg = cfgs.find((c) => c.scopeName.startsWith("computeDiscount@"));

    expect(fnCfg).toBeDefined();
    expect(fnCfg?.state).toBe("RESOLVED");

    const edgeKinds = fnCfg?.edges.map((e) => e.kind) ?? [];
    expect(edgeKinds).toContain("true");
    expect(edgeKinds).toContain("false");
    expect(edgeKinds).toContain("return");
    expect(fnCfg?.unreachableBlockIds).toHaveLength(0);
  });

  test("models while loops with header, true, false, and loop-back edges", () => {
    const ast = parser.parse(WHILE_LOOP_SOURCE, "loop.ts");
    const cfgs = builder.buildAll(ast, "loop.ts");
    const fnCfg = cfgs.find((c) => c.scopeName.startsWith("retrySync@"));

    expect(fnCfg).toBeDefined();
    expect(fnCfg?.state).toBe("RESOLVED");

    const edgeKinds = fnCfg?.edges.map((e) => e.kind) ?? [];
    expect(edgeKinds).toContain("true");
    expect(edgeKinds).toContain("false");
    expect(edgeKinds).toContain("loop-back");
    expect(edgeKinds).toContain("return");
    expect(fnCfg?.unreachableBlockIds).toHaveLength(0);
  });

  test("marks compile-time false if branch as unreachable dead code", () => {
    const ast = parser.parse(UNREACHABLE_BRANCH_SOURCE, "unreachable-branch.ts");
    const cfgs = builder.buildAll(ast, "unreachable-branch.ts");
    const fnCfg = cfgs.find((c) => c.scopeName.startsWith("evaluateFeatureGate@"));

    expect(fnCfg).toBeDefined();
    expect(fnCfg?.unreachableBlockIds.length).toBeGreaterThan(0);
    expect(fnCfg?.deadCodeStatementIds.length).toBeGreaterThan(0);

    const edgeKinds = fnCfg?.edges.map((e) => e.kind) ?? [];
    expect(edgeKinds).not.toContain("true");
    expect(edgeKinds).toContain("false");
  });

  test("marks compile-time false while loop body as unreachable dead code", () => {
    const ast = parser.parse(UNREACHABLE_LOOP_SOURCE, "unreachable-loop.ts");
    const cfgs = builder.buildAll(ast, "unreachable-loop.ts");
    const fnCfg = cfgs.find((c) => c.scopeName.startsWith("drainPendingBuffer@"));

    expect(fnCfg).toBeDefined();
    expect(fnCfg?.unreachableBlockIds.length).toBeGreaterThan(0);
    expect(fnCfg?.deadCodeStatementIds.length).toBeGreaterThan(0);

    const edgeKinds = fnCfg?.edges.map((e) => e.kind) ?? [];
    expect(edgeKinds).not.toContain("true");
    expect(edgeKinds).toContain("false");
  });

  test("marks scopes containing unsupported short-circuit expressions as UNSUPPORTED", () => {
    const ast = parser.parse(SHORT_CIRCUIT_SOURCE, "short-circuit.ts");
    const cfgs = builder.buildAll(ast, "short-circuit.ts");
    const fnCfg = cfgs.find((c) => c.scopeName.startsWith("verifyAccess@"));

    expect(fnCfg).toBeDefined();
    expect(fnCfg?.state).toBe("UNSUPPORTED");
  });

  test.each([
    ["logical OR", "function f(a: boolean) { a || fallback(); return a; }"],
    ["nullish coalescing", "function f(a: any) { a ?? defaultValue(); return a; }"],
    ["conditional ternary", "function f(a: boolean) { return a ? 1 : 2; }"],
    ["optional member", "function f(a: any) { return a?.prop; }"],
    ["optional call", "function f(a: any) { return a?.(); }"],
    ["logical AND assignment", "function f(a: boolean) { a &&= true; return a; }"],
    ["while + break", "function f(x: number) { while (x > 0) { break; } return x; }"],
    ["while + continue", "function f(x: number) { while (x > 0) { continue; } return x; }"],
    [
      "nested while + if + break",
      "function f(x: number) { while (x > 0) { if (x === 5) { break; } x = x - 1; } return x; }",
    ],
    [
      "nested while + if + continue",
      "function f(x: number) { while (x > 0) { if (x === 5) { continue; } return 1; } return 0; }",
    ],
    ["bare throw", "function f() { throw new Error('err'); }"],
    ["throw followed by statement", "function f() { throw new Error('err'); return 1; }"],
    [
      "throw inside if",
      "function f(x: number) { if (x < 0) { throw new Error('neg'); } return x; }",
    ],
    [
      "throw inside while",
      "function f(x: number) { while (x > 0) { throw new Error('abort'); } return 0; }",
    ],
  ])("marks %s control as unsupported rather than fabricating unverified paths", (_desc, code) => {
    const ast = parser.parse(code, "test.ts");
    const cfgs = builder.buildAll(ast, "test.ts");
    const fnCfg = cfgs.find((c) => c.scopeName.startsWith("f@"));

    expect(fnCfg).toBeDefined();
    expect(fnCfg?.state).toBe("UNSUPPORTED");
  });

  test("preserves scope isolation with break in nested function", () => {
    const source = `
      function outer() {
        function inner() {
          while (true) {
            break;
          }
        }
        return 1;
      }
    `;
    const ast = parser.parse(source, "nested-break.ts");
    const cfgs = builder.buildAll(ast, "nested-break.ts");
    const outerCfg = cfgs.find((c) => c.scopeName.startsWith("outer@"));
    const innerCfg = cfgs.find((c) => c.scopeName.startsWith("inner@"));

    expect(outerCfg).toBeDefined();
    expect(innerCfg).toBeDefined();
    expect(outerCfg?.state).toBe("RESOLVED");
    expect(innerCfg?.state).toBe("UNSUPPORTED");
  });

  test("preserves scope isolation with throw in nested function", () => {
    const source = `
      function outer() {
        function inner() {
          throw new Error("fail");
        }
        return 1;
      }
    `;
    const ast = parser.parse(source, "nested-throw.ts");
    const cfgs = builder.buildAll(ast, "nested-throw.ts");
    const outerCfg = cfgs.find((c) => c.scopeName.startsWith("outer@"));
    const innerCfg = cfgs.find((c) => c.scopeName.startsWith("inner@"));

    expect(outerCfg).toBeDefined();
    expect(innerCfg).toBeDefined();
    expect(outerCfg?.state).toBe("RESOLVED");
    expect(innerCfg?.state).toBe("UNSUPPORTED");
  });

  test("isolates module scope from child function declarations", () => {
    const source = `
      const x = 10;
      function helper() { return 42; }
      const y = x + 1;
    `;
    const ast = parser.parse(source, "scopes.ts");
    const cfgs = builder.buildAll(ast, "scopes.ts");

    expect(cfgs).toHaveLength(2);
    const moduleCfg = cfgs.find((c) => c.scopeName === "module");
    const helperCfg = cfgs.find((c) => c.scopeName.startsWith("helper@"));

    expect(moduleCfg).toBeDefined();
    expect(helperCfg).toBeDefined();
    expect(moduleCfg?.id).not.toBe(helperCfg?.id);
  });

  test("proves return terminates block and marks following statements as unreachable dead code", () => {
    const source = `
      function finalizeCheckout() {
        return "approved";
        const discardedReceipt = "unreachable";
      }
    `;
    const ast = parser.parse(source, "return-term.ts");
    const cfgs = builder.buildAll(ast, "return-term.ts");
    const fnCfg = cfgs.find((c) => c.scopeName.startsWith("finalizeCheckout@"));

    expect(fnCfg).toBeDefined();
    expect(fnCfg?.unreachableBlockIds.length).toBe(1);
    expect(fnCfg?.deadCodeStatementIds.length).toBe(1);

    const returnBlock = fnCfg?.blocks.find((b) => b.terminator === "ReturnStatement");
    expect(returnBlock).toBeDefined();
    expect(returnBlock?.successorIds).toEqual([fnCfg?.exitBlockId ?? ""]);

    // Ensure no fallthrough edge exists from the return block to the dead block
    const fallthroughEdge = fnCfg?.edges.find(
      (e) => e.fromBlockId === returnBlock?.id && e.kind === "next"
    );
    expect(fallthroughEdge).toBeUndefined();
  });

  test("preserves scope isolation: nested function unsupported control flow does not downgrade outer scope", () => {
    const source = `
      function processSession() {
        function recordAudit(isActive: boolean) {
          isActive && sendMetricEvent();
        }
        return true;
      }
    `;
    const ast = parser.parse(source, "nested-scope.ts");
    const cfgs = builder.buildAll(ast, "nested-scope.ts");

    const outerCfg = cfgs.find((c) => c.scopeName.startsWith("processSession@"));
    const innerCfg = cfgs.find((c) => c.scopeName.startsWith("recordAudit@"));

    expect(outerCfg).toBeDefined();
    expect(innerCfg).toBeDefined();
    expect(outerCfg?.state).toBe("RESOLVED");
    expect(innerCfg?.state).toBe("UNSUPPORTED");
  });

  test("produces deterministic canonical scope ordering regardless of source declaration sequence", () => {
    const source = `
      function validatePayload() { return 3; }
      function authenticateUser() { return 1; }
      function checkPermissions() { return 2; }
    `;
    const ast = parser.parse(source, "order.ts");
    const cfgs1 = builder.buildAll(ast, "order.ts");
    const cfgs2 = builder.buildAll(ast, "order.ts");

    expect(cfgs1.map((c) => c.scopeName)).toEqual(cfgs2.map((c) => c.scopeName));
    expect(cfgs1[0]?.scopeName).toBe("module");
    expect(cfgs1[1]?.scopeName.startsWith("authenticateUser@")).toBe(true);
    expect(cfgs1[2]?.scopeName.startsWith("checkPermissions@")).toBe(true);
    expect(cfgs1[3]?.scopeName.startsWith("validatePayload@")).toBe(true);
  });
});

describe("Adversarial CFG Semantics & Invariants", () => {
  test("models nested if statements with sound branch topologies", () => {
    const code = `
      function nested(a: boolean, b: boolean): number {
        if (a) {
          if (b) {
            return 1;
          }
          return 2;
        }
        return 3;
      }
    `;
    const result = analyzeSource(code, { filePath: "nested.ts" });
    expect(result.state).toBe("RESOLVED");
    expect(result.controlFlowGraphs.length).toBe(2);

    for (const cfg of result.controlFlowGraphs) {
      assertGraphInvariants(cfg);
    }

    const fnCfg = result.controlFlowGraphs.find((c) => c.scopeName.startsWith("nested@"));
    expect(fnCfg).toBeDefined();
    expect(fnCfg?.unreachableBlockIds.length).toBe(0);
    expect(fnCfg?.deadCodeStatementIds.length).toBe(0);
  });

  test("models if/else where both branches return and marks subsequent code as dead", () => {
    const code = `
      function bothReturn(flag: boolean): number {
        if (flag) {
          return 1;
        } else {
          return 2;
        }
        const unreachable = 99;
      }
    `;
    const result = analyzeSource(code, { filePath: "both-return.ts" });
    const fnCfg = result.controlFlowGraphs.find((c) => c.scopeName.startsWith("bothReturn@"));
    if (!fnCfg) {
      throw new Error("Expected fnCfg to be defined");
    }
    assertGraphInvariants(fnCfg);

    expect(fnCfg.unreachableBlockIds.length).toBeGreaterThan(0);
    expect(fnCfg.deadCodeStatementIds.length).toBe(1);
    expect(fnCfg.deadCodeStatementIds[0]).toContain("stmt:8:8");
  });

  test("models while loop with return inside body", () => {
    const code = `
      function whileWithReturn(flag: boolean): number {
        while (flag) {
          return 1;
        }
        return 2;
      }
    `;
    const result = analyzeSource(code, { filePath: "while-return.ts" });
    const fnCfg = result.controlFlowGraphs.find((c) => c.scopeName.startsWith("whileWithReturn@"));
    if (!fnCfg) {
      throw new Error("Expected fnCfg to be defined");
    }
    assertGraphInvariants(fnCfg);

    const returnEdges = fnCfg.edges.filter((e) => e.kind === "return");
    expect(returnEdges.length).toBe(2);
    expect(returnEdges.every((e) => e.toBlockId === fnCfg.exitBlockId)).toBe(true);
  });

  test("handles empty function without crashing or dangling edges", () => {
    const code = `
      function emptyFunction(): void {}
    `;
    const result = analyzeSource(code, { filePath: "empty-fn.ts" });
    const fnCfg = result.controlFlowGraphs.find((c) => c.scopeName.startsWith("emptyFunction@"));
    if (!fnCfg) {
      throw new Error("Expected fnCfg to be defined");
    }
    assertGraphInvariants(fnCfg);

    expect(fnCfg.blocks.length).toBe(2);
    expect(fnCfg.edges.length).toBe(1);
    const firstEdge = fnCfg.edges[0];
    if (!firstEdge) {
      throw new Error("Expected edge 0");
    }
    expect(firstEdge.fromBlockId).toBe(fnCfg.entryBlockId);
    expect(firstEdge.toBlockId).toBe(fnCfg.exitBlockId);
    expect(firstEdge.kind).toBe("next");
  });

  test("handles empty module and whitespace-only source", () => {
    const emptyResult = analyzeSource("", { filePath: "empty.ts" });
    expect(emptyResult.controlFlowGraphs.length).toBe(1);
    const emptyCfg = emptyResult.controlFlowGraphs[0];
    if (!emptyCfg) {
      throw new Error("Expected emptyCfg");
    }
    assertGraphInvariants(emptyCfg);

    const whitespaceResult = analyzeSource("   \n\n\t  \n", { filePath: "spaces.ts" });
    expect(whitespaceResult.controlFlowGraphs.length).toBe(1);
    const wsCfg = whitespaceResult.controlFlowGraphs[0];
    if (!wsCfg) {
      throw new Error("Expected wsCfg");
    }
    assertGraphInvariants(wsCfg);
  });

  test("handles comments and blank lines without affecting graph topology", () => {
    const code1 = `
      function calc(x: number) {
        if (x > 0) return 1;
        return 0;
      }
    `;
    const code2 = `
      // Lead comment
      /* Multi-line
         comment */

      function calc(x: number) {
        // Condition comment
        if (x > 0) return 1;

        // Fallthrough comment
        return 0;
      }
    `;
    const res1 = analyzeSource(code1, { filePath: "c1.ts" });
    const res2 = analyzeSource(code2, { filePath: "c2.ts" });

    const fn1 = res1.controlFlowGraphs.find((c) => c.scopeName.startsWith("calc@"));
    const fn2 = res2.controlFlowGraphs.find((c) => c.scopeName.startsWith("calc@"));
    if (!fn1 || !fn2) {
      throw new Error("Expected fn1 and fn2 to be defined");
    }

    assertGraphInvariants(fn1);
    assertGraphInvariants(fn2);

    expect(fn1.blocks.length).toBe(fn2.blocks.length);
    expect(fn1.edges.length).toBe(fn2.edges.length);
    expect(fn1.edges.map((e) => e.kind)).toEqual(fn2.edges.map((e) => e.kind));
  });

  test("isolates multiple functions with the same identifier at different coordinates", () => {
    const code = `
      function run(): void {
        function helper(): number { return 1; }
      }
      function helper(): number { return 2; }
    `;
    const result = analyzeSource(code, { filePath: "multi-helper.ts" });
    expect(result.controlFlowGraphs.length).toBe(4); // module, run, inner helper, outer helper

    const helperGraphs = result.controlFlowGraphs.filter((c) => c.scopeName.startsWith("helper@"));
    expect(helperGraphs.length).toBe(2);
    expect(helperGraphs[0]?.id).not.toBe(helperGraphs[1]?.id);

    for (const cfg of result.controlFlowGraphs) {
      assertGraphInvariants(cfg);
    }
  });

  test("throws structured SourceParseError on malformed JavaScript / TypeScript", () => {
    expect(() => analyzeSource("function { missingName() }")).toThrow(SourceParseError);
    expect(() => analyzeSource("const x: = ;")).toThrow(SourceParseError);
    expect(() => analyzeSource("if (true { unclosed paren")).toThrow(SourceParseError);
  });
});

describe("computeReachability", () => {
  test("computes reachability for a linear graph", () => {
    const blocks: BasicBlock[] = [
      { id: "b0", statements: [], predecessorIds: [], successorIds: ["b1"] },
      { id: "b1", statements: [], predecessorIds: ["b0"], successorIds: ["b2"] },
      { id: "b2", statements: [], predecessorIds: ["b1"], successorIds: [] },
    ];
    const edges: ControlFlowEdge[] = [
      { id: "e0", fromBlockId: "b0", toBlockId: "b1", kind: "next" },
      { id: "e1", fromBlockId: "b1", toBlockId: "b2", kind: "next" },
    ];

    const result = computeReachability("b0", blocks, edges);
    expect(result.reachableBlockIds).toEqual(["b0", "b1", "b2"]);
    expect(result.unreachableBlockIds).toEqual([]);
    expect(result.deadCodeStatementIds).toEqual([]);
  });

  test("isolates disconnected unreachable blocks and dead code statements", () => {
    const blocks: BasicBlock[] = [
      { id: "b0", statements: [], predecessorIds: [], successorIds: ["b1"] },
      { id: "b1", statements: [], predecessorIds: ["b0"], successorIds: [] },
      {
        id: "b_dead",
        statements: [{ id: "stmt_dead_1", type: "ExpressionStatement" }],
        predecessorIds: [],
        successorIds: [],
      },
    ];
    const edges: ControlFlowEdge[] = [
      { id: "e0", fromBlockId: "b0", toBlockId: "b1", kind: "next" },
    ];

    const result = computeReachability("b0", blocks, edges);
    expect(result.reachableBlockIds).toEqual(["b0", "b1"]);
    expect(result.unreachableBlockIds).toEqual(["b_dead"]);
    expect(result.deadCodeStatementIds).toEqual(["stmt_dead_1"]);
  });

  test("correctly traverses loops without infinite recursion", () => {
    const blocks: BasicBlock[] = [
      { id: "b0", statements: [], predecessorIds: [], successorIds: ["b1"] },
      { id: "b1", statements: [], predecessorIds: ["b0", "b1"], successorIds: ["b1", "b2"] },
      { id: "b2", statements: [], predecessorIds: ["b1"], successorIds: [] },
    ];
    const edges: ControlFlowEdge[] = [
      { id: "e0", fromBlockId: "b0", toBlockId: "b1", kind: "next" },
      { id: "e1", fromBlockId: "b1", toBlockId: "b1", kind: "loop-back" },
      { id: "e2", fromBlockId: "b1", toBlockId: "b2", kind: "false" },
    ];

    const result = computeReachability("b0", blocks, edges);
    expect(result.reachableBlockIds).toEqual(["b0", "b1", "b2"]);
    expect(result.unreachableBlockIds).toHaveLength(0);
  });
});
