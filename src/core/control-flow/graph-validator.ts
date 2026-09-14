import { ControlFlowInvariantError } from "../../domain/errors";
import type { ControlFlowGraph } from "../../domain/graph";

export interface GraphInvariantViolation {
  readonly rule: string;
  readonly message: string;
  readonly details?: unknown;
}

/**
 * Validates structural, relational, and reachability invariants on a ControlFlowGraph.
 * Returns an array of violations (empty if the graph satisfies all invariants).
 */
export function validateGraphInvariants(cfg: ControlFlowGraph): readonly GraphInvariantViolation[] {
  const violations: GraphInvariantViolation[] = [];
  const blockMap = new Map(cfg.blocks.map((b) => [b.id, b]));

  // 1. Block ID uniqueness
  if (blockMap.size !== cfg.blocks.length) {
    violations.push({
      rule: "unique-block-ids",
      message: `Duplicate block IDs detected in scope ${cfg.scopeName}`,
    });
  }

  // 2. Exactly one ENTRY and one EXIT block existing in blocks
  const entryBlock = blockMap.get(cfg.entryBlockId);
  if (!entryBlock) {
    violations.push({
      rule: "entry-exists",
      message: `Entry block '${cfg.entryBlockId}' does not exist in graph blocks`,
    });
  } else if (entryBlock.predecessorIds.length > 0) {
    violations.push({
      rule: "entry-no-predecessors",
      message: `Entry block '${cfg.entryBlockId}' has unexpected predecessors`,
      details: entryBlock.predecessorIds,
    });
  }

  const exitBlock = blockMap.get(cfg.exitBlockId);
  if (!exitBlock) {
    violations.push({
      rule: "exit-exists",
      message: `Exit block '${cfg.exitBlockId}' does not exist in graph blocks`,
    });
  } else if (exitBlock.successorIds.length > 0) {
    violations.push({
      rule: "exit-no-successors",
      message: `Exit block '${cfg.exitBlockId}' has unexpected successors`,
      details: exitBlock.successorIds,
    });
  }

  // 3. Edge ID uniqueness and valid endpoints
  const edgeIds = new Set<string>();
  const semanticEdgeTriples = new Set<string>();
  for (const edge of cfg.edges) {
    if (edgeIds.has(edge.id)) {
      violations.push({
        rule: "unique-edge-ids",
        message: `Duplicate edge ID '${edge.id}' in scope ${cfg.scopeName}`,
      });
    }
    edgeIds.add(edge.id);

    const triple = `${edge.fromBlockId}->${edge.toBlockId}:${edge.kind}`;
    if (semanticEdgeTriples.has(triple)) {
      violations.push({
        rule: "unique-semantic-edges",
        message: `Duplicate semantic edge '${triple}' in scope ${cfg.scopeName}`,
      });
    }
    semanticEdgeTriples.add(triple);

    const fromBlock = blockMap.get(edge.fromBlockId);
    if (!fromBlock) {
      violations.push({
        rule: "edge-from-exists",
        message: `Edge '${edge.id}' references non-existent fromBlockId '${edge.fromBlockId}'`,
      });
    }

    const toBlock = blockMap.get(edge.toBlockId);
    if (!toBlock) {
      violations.push({
        rule: "edge-to-exists",
        message: `Edge '${edge.id}' references non-existent toBlockId '${edge.toBlockId}'`,
      });
    }
  }

  // 4. Predecessor / Successor consistency with edges
  for (const block of cfg.blocks) {
    if (new Set(block.predecessorIds).size !== block.predecessorIds.length) {
      violations.push({
        rule: "unique-predecessors",
        message: `Block '${block.id}' contains duplicate predecessor entries`,
        details: block.predecessorIds,
      });
    }

    if (new Set(block.successorIds).size !== block.successorIds.length) {
      violations.push({
        rule: "unique-successors",
        message: `Block '${block.id}' contains duplicate successor entries`,
        details: block.successorIds,
      });
    }

    for (const succId of block.successorIds) {
      const hasEdge = cfg.edges.some((e) => e.fromBlockId === block.id && e.toBlockId === succId);
      if (!hasEdge) {
        violations.push({
          rule: "successor-has-edge",
          message: `Block '${block.id}' lists successor '${succId}' without a matching edge`,
        });
      }
    }

    for (const predId of block.predecessorIds) {
      const hasEdge = cfg.edges.some((e) => e.fromBlockId === predId && e.toBlockId === block.id);
      if (!hasEdge) {
        violations.push({
          rule: "predecessor-has-edge",
          message: `Block '${block.id}' lists predecessor '${predId}' without a matching edge`,
        });
      }
    }
  }

  for (const edge of cfg.edges) {
    const fromBlock = blockMap.get(edge.fromBlockId);
    if (fromBlock && !fromBlock.successorIds.includes(edge.toBlockId)) {
      violations.push({
        rule: "edge-in-successors",
        message: `Edge '${edge.id}' not recorded in fromBlock '${fromBlock.id}' successorIds`,
      });
    }
    const toBlock = blockMap.get(edge.toBlockId);
    if (toBlock && !toBlock.predecessorIds.includes(edge.fromBlockId)) {
      violations.push({
        rule: "edge-in-predecessors",
        message: `Edge '${edge.id}' not recorded in toBlock '${toBlock.id}' predecessorIds`,
      });
    }
  }

  // 5. Reachable and unreachable blocks partition the graph blocks
  const allBlockIds = new Set(cfg.blocks.map((b) => b.id));
  for (const unreachId of cfg.unreachableBlockIds) {
    if (!allBlockIds.has(unreachId)) {
      violations.push({
        rule: "unreachable-exists",
        message: `unreachableBlockId '${unreachId}' does not exist in graph blocks`,
      });
    }
  }

  if (cfg.unreachableBlockIds.includes(cfg.entryBlockId)) {
    violations.push({
      rule: "entry-always-reachable",
      message: `Entry block '${cfg.entryBlockId}' is marked as unreachable in scope ${cfg.scopeName}`,
    });
  }

  // 6. Statement ID uniqueness and dead code statement attribution
  const stmtIds = new Set<string>();
  for (const block of cfg.blocks) {
    for (const stmt of block.statements) {
      if (stmtIds.has(stmt.id)) {
        violations.push({
          rule: "unique-statement-ids",
          message: `Duplicate statement ID '${stmt.id}' in scope ${cfg.scopeName}`,
        });
      }
      stmtIds.add(stmt.id);
    }
  }

  for (const deadStmtId of cfg.deadCodeStatementIds) {
    if (!stmtIds.has(deadStmtId)) {
      violations.push({
        rule: "dead-statement-exists",
        message: `Dead code statement '${deadStmtId}' does not exist in any block`,
      });
    }
  }

  const unreachableBlockIdSet = new Set(cfg.unreachableBlockIds);
  const unreachableStatementIds = new Set(
    cfg.blocks
      .filter((b) => unreachableBlockIdSet.has(b.id))
      .flatMap((b) => b.statements.map((s) => s.id))
  );

  for (const deadStmtId of cfg.deadCodeStatementIds) {
    if (!unreachableStatementIds.has(deadStmtId)) {
      violations.push({
        rule: "dead-statement-attribution",
        message: `Dead code statement '${deadStmtId}' does not belong to an unreachable block`,
      });
    }
  }

  for (const stmtId of unreachableStatementIds) {
    if (!cfg.deadCodeStatementIds.includes(stmtId)) {
      violations.push({
        rule: "unreachable-statement-recorded",
        message: `Statement '${stmtId}' in unreachable block is missing from deadCodeStatementIds`,
      });
    }
  }

  return violations;
}

/**
 * Asserts that a ControlFlowGraph satisfies all structural invariants, throwing a ControlFlowInvariantError if not.
 */
export function assertGraphInvariants(cfg: ControlFlowGraph): void {
  const violations = validateGraphInvariants(cfg);
  const first = violations[0];
  if (first) {
    throw ControlFlowInvariantError.violation(first.rule, cfg.scopeName, first.message);
  }
}
