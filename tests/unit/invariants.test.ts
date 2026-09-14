import { describe, expect, test } from "bun:test";
import { ControlFlowInvariantError, analyzeSource, serializeAnalysisResult } from "../../src";
import {
  assertGraphInvariants,
  validateGraphInvariants,
} from "../../src/core/control-flow/graph-validator";
import type { ControlFlowGraph } from "../../src/domain/graph";

function createValidGraph(): ControlFlowGraph {
  return {
    id: "cfg:test.ts:test",
    filePath: "test.ts",
    scopeName: "test",
    state: "RESOLVED",
    entryBlockId: "test:entry",
    exitBlockId: "test:exit",
    blocks: [
      {
        id: "test:entry",
        statements: [],
        predecessorIds: [],
        successorIds: ["test:b1"],
      },
      {
        id: "test:b1",
        statements: [
          {
            id: "test:stmt:1:0",
            type: "ExpressionStatement",
          },
        ],
        predecessorIds: ["test:entry"],
        successorIds: ["test:exit"],
      },
      {
        id: "test:exit",
        statements: [],
        predecessorIds: ["test:b1"],
        successorIds: [],
      },
    ],
    edges: [
      {
        id: "test:entry->test:b1:next",
        fromBlockId: "test:entry",
        toBlockId: "test:b1",
        kind: "next",
      },
      {
        id: "test:b1->test:exit:next",
        fromBlockId: "test:b1",
        toBlockId: "test:exit",
        kind: "next",
      },
    ],
    unreachableBlockIds: [],
    deadCodeStatementIds: [],
  };
}

describe("Graph Invariant Validator", () => {
  test("passes on a well-formed control-flow graph", () => {
    const graph = createValidGraph();
    const violations = validateGraphInvariants(graph);
    expect(violations).toEqual([]);
    expect(() => assertGraphInvariants(graph)).not.toThrow();
  });

  test("detects duplicate block IDs", () => {
    const graph = createValidGraph();
    (graph.blocks as unknown as unknown[]).push({
      id: "test:b1",
      statements: [],
      predecessorIds: [],
      successorIds: [],
    });

    const violations = validateGraphInvariants(graph);
    expect(violations.some((v) => v.rule === "unique-block-ids")).toBe(true);
    expect(() => assertGraphInvariants(graph)).toThrow();
  });

  test("detects missing entry block", () => {
    const graph: ControlFlowGraph = {
      ...createValidGraph(),
      entryBlockId: "test:nonexistent",
    };

    const violations = validateGraphInvariants(graph);
    expect(violations.some((v) => v.rule === "entry-exists")).toBe(true);
  });

  test("detects entry block having unexpected predecessors", () => {
    const graph = createValidGraph();
    const entry = graph.blocks.find((b) => b.id === "test:entry");
    if (entry) {
      (entry.predecessorIds as unknown as string[]).push("test:b1");
    }

    const violations = validateGraphInvariants(graph);
    expect(violations.some((v) => v.rule === "entry-no-predecessors")).toBe(true);
  });

  test("detects dangling edge referencing non-existent block", () => {
    const graph = createValidGraph();
    (graph.edges as unknown as unknown[]).push({
      id: "test:b1->test:ghost:next",
      fromBlockId: "test:b1",
      toBlockId: "test:ghost",
      kind: "next",
    });

    const violations = validateGraphInvariants(graph);
    expect(violations.some((v) => v.rule === "edge-to-exists")).toBe(true);
  });

  test("detects edge not recorded in successorIds or predecessorIds", () => {
    const graph = createValidGraph();
    (graph.edges as unknown as unknown[]).push({
      id: "test:entry->test:exit:next",
      fromBlockId: "test:entry",
      toBlockId: "test:exit",
      kind: "next",
    });

    const violations = validateGraphInvariants(graph);
    expect(violations.some((v) => v.rule === "edge-in-successors")).toBe(true);
  });

  test("detects duplicate statement IDs within a scope", () => {
    const graph = createValidGraph();
    const entry = graph.blocks.find((b) => b.id === "test:entry");
    if (entry) {
      (entry.statements as unknown as unknown[]).push({
        id: "test:stmt:1:0",
        type: "ExpressionStatement",
      });
    }

    const violations = validateGraphInvariants(graph);
    expect(violations.some((v) => v.rule === "unique-statement-ids")).toBe(true);
  });

  test("detects duplicate predecessor entries in a block", () => {
    const graph = createValidGraph();
    const b1 = graph.blocks.find((b) => b.id === "test:b1");
    if (b1) {
      (b1.predecessorIds as unknown as string[]).push("test:entry");
    }

    const violations = validateGraphInvariants(graph);
    expect(violations.some((v) => v.rule === "unique-predecessors")).toBe(true);
    expect(() => assertGraphInvariants(graph)).toThrow();
  });

  test("detects duplicate successor entries in a block", () => {
    const graph = createValidGraph();
    const b1 = graph.blocks.find((b) => b.id === "test:b1");
    if (b1) {
      (b1.successorIds as unknown as string[]).push("test:exit");
    }

    const violations = validateGraphInvariants(graph);
    expect(violations.some((v) => v.rule === "unique-successors")).toBe(true);
    expect(() => assertGraphInvariants(graph)).toThrow();
  });

  test("detects duplicate semantic edges", () => {
    const graph = createValidGraph();
    (graph.edges as unknown as unknown[]).push({
      id: "test:b1->test:exit:next:dup",
      fromBlockId: "test:b1",
      toBlockId: "test:exit",
      kind: "next",
    });

    const violations = validateGraphInvariants(graph);
    expect(violations.some((v) => v.rule === "unique-semantic-edges")).toBe(true);
    expect(() => assertGraphInvariants(graph)).toThrow();
  });

  test("detects entry block marked as unreachable", () => {
    const graph: ControlFlowGraph = {
      ...createValidGraph(),
      unreachableBlockIds: ["test:entry"],
    };

    const violations = validateGraphInvariants(graph);
    expect(violations.some((v) => v.rule === "entry-always-reachable")).toBe(true);
    expect(() => assertGraphInvariants(graph)).toThrow();
  });

  test("detects dead statement attributed to a reachable block", () => {
    const graph: ControlFlowGraph = {
      ...createValidGraph(),
      deadCodeStatementIds: ["test:stmt:1:0"],
      unreachableBlockIds: [],
    };

    const violations = validateGraphInvariants(graph);
    expect(violations.some((v) => v.rule === "dead-statement-attribution")).toBe(true);
    expect(() => assertGraphInvariants(graph)).toThrow();
  });

  test("detects statement in unreachable block missing from deadCodeStatementIds", () => {
    const valid = createValidGraph();
    const deadBlock = {
      id: "test:b_dead",
      statements: [{ id: "test:stmt:dead", type: "ExpressionStatement" }],
      predecessorIds: [],
      successorIds: [],
    };
    const graph: ControlFlowGraph = {
      ...valid,
      blocks: [...valid.blocks, deadBlock],
      unreachableBlockIds: ["test:b_dead"],
      deadCodeStatementIds: [], // missing
    };

    const violations = validateGraphInvariants(graph);
    expect(violations.some((v) => v.rule === "unreachable-statement-recorded")).toBe(true);
    expect(() => assertGraphInvariants(graph)).toThrow();
  });

  test("missingBlock error formats referenced block without misleading text", () => {
    const err = ControlFlowInvariantError.missingBlock("test:b_missing");
    expect(err).toBeInstanceOf(ControlFlowInvariantError);
    expect(err.code).toBe("CFG_INVARIANT_ERROR");
    expect(err.blockId).toBe("test:b_missing");
    expect(err.message).toBe(
      "Control-flow invariant violated: referenced block 'test:b_missing' does not exist."
    );
  });

  test("violation error preserves rule, scope, and detail", () => {
    const err = ControlFlowInvariantError.violation(
      "entry-no-predecessors",
      "testScope@1:0",
      "Entry block has unexpected predecessors"
    );
    expect(err).toBeInstanceOf(ControlFlowInvariantError);
    expect(err.code).toBe("CFG_INVARIANT_ERROR");
    expect(err.rule).toBe("entry-no-predecessors");
    expect(err.scopeName).toBe("testScope@1:0");
    expect(err.message).toBe(
      "Control-flow invariant violation [entry-no-predecessors] in scope 'testScope@1:0': Entry block has unexpected predecessors"
    );
    expect(err.message).not.toContain("referenced block");
  });

  test("assertGraphInvariants throws structured ControlFlowInvariantError with rule and scope details", () => {
    const valid = createValidGraph();
    const entry = valid.blocks.find((b) => b.id === "test:entry");
    if (!entry) throw new Error("Missing test entry");
    const otherBlocks = valid.blocks.filter((b) => b.id !== "test:entry");
    const badGraph: ControlFlowGraph = {
      ...valid,
      blocks: [
        {
          ...entry,
          predecessorIds: ["test:b1"], // entry has predecessor
        },
        ...otherBlocks,
      ],
    };

    let caught: unknown;
    try {
      assertGraphInvariants(badGraph);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ControlFlowInvariantError);
    const invErr = caught as ControlFlowInvariantError;
    expect(invErr.rule).toBe("entry-no-predecessors");
    expect(invErr.scopeName).toBe("test");
    expect(invErr.message).toContain("[entry-no-predecessors]");
    expect(invErr.message).toContain("in scope 'test'");
    expect(invErr.message).toContain("unexpected predecessors");
    expect(invErr.message).not.toContain("referenced block");
  });
});

const COMBINATORIAL_FIXTURES: readonly { name: string; code: string }[] = Object.freeze([
  {
    name: "sequence + if",
    code: `
      function test(x: number) {
        const a = x + 1;
        let b = 0;
        if (a > 5) {
          b = 10;
        }
        return b;
      }
    `,
  },
  {
    name: "sequence + while",
    code: `
      function test(limit: number) {
        let sum = 0;
        let i = 0;
        while (i < limit) {
          sum = sum + i;
          i = i + 1;
        }
        return sum;
      }
    `,
  },
  {
    name: "while loop as first statement",
    code: `
      function test(limit: number) {
        while (limit > 0) {
          limit = limit - 1;
        }
        return limit;
      }
    `,
  },
  {
    name: "if + return (single-sided)",
    code: `
      function test(flag: boolean) {
        if (flag) {
          return 100;
        }
        return 200;
      }
    `,
  },
  {
    name: "if/else + return (two-sided)",
    code: `
      function test(flag: boolean) {
        if (flag) {
          return 1;
        } else {
          return 2;
        }
      }
    `,
  },
  {
    name: "while + return inside body",
    code: `
      function test(flag: boolean) {
        while (flag) {
          return -1;
        }
        return 0;
      }
    `,
  },
  {
    name: "nested supported scopes",
    code: `
      function outer(n: number) {
        function inner(m: number) {
          if (m > 0) {
            return m;
          }
          return 0;
        }
        return inner(n);
      }
    `,
  },
  {
    name: "sequence + if + while + return composite",
    code: `
      function pipeline(items: number[]) {
        let count = 0;
        if (items.length > 0) {
          while (count < items.length) {
            count = count + 1;
          }
          return count;
        }
        return 0;
      }
    `,
  },
]);

describe("Combinatorial Program Matrix & Invariant Verification", () => {
  for (const fixture of COMBINATORIAL_FIXTURES) {
    test(`satisfies all structural invariants for: ${fixture.name}`, () => {
      const result = analyzeSource(fixture.code, { filePath: `${fixture.name}.ts` });

      for (const cfg of result.controlFlowGraphs) {
        assertGraphInvariants(cfg);

        const allIds = new Set(cfg.blocks.map((b) => b.id));
        for (const unreachId of cfg.unreachableBlockIds) {
          expect(allIds.has(unreachId)).toBe(true);
        }

        expect(allIds.has(cfg.entryBlockId)).toBe(true);
        expect(allIds.has(cfg.exitBlockId)).toBe(true);
      }

      const run1 = serializeAnalysisResult(result);
      const reResult = analyzeSource(fixture.code, { filePath: `${fixture.name}.ts` });
      const run2 = serializeAnalysisResult(reResult);
      expect(run1).toBe(run2);
    });
  }
});
