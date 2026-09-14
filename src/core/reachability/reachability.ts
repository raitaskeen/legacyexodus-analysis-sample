import type { BasicBlock, ControlFlowEdge } from "../../domain/graph";

export interface ReachabilityResult {
  readonly reachableBlockIds: readonly string[];
  readonly unreachableBlockIds: readonly string[];
  readonly deadCodeStatementIds: readonly string[];
}

export function blockOrderRank(id: string): number {
  if (id.endsWith(":entry")) return 0;
  if (id.endsWith(":exit")) return 999999;
  const match = id.match(/:b(\d+)$/);
  return match?.[1] ? Number.parseInt(match[1], 10) : 500000;
}

export function compareBlockIds(a: string, b: string): number {
  const diff = blockOrderRank(a) - blockOrderRank(b);
  if (diff !== 0) return diff;
  return a.localeCompare(b);
}

export function computeReachability(
  entryBlockId: string,
  blocks: readonly BasicBlock[],
  edges: readonly ControlFlowEdge[]
): ReachabilityResult {
  const successorsByBlock = new Map<string, string[]>();

  for (const block of blocks) {
    successorsByBlock.set(block.id, []);
  }

  for (const edge of edges) {
    const list = successorsByBlock.get(edge.fromBlockId);
    if (list) {
      list.push(edge.toBlockId);
    }
  }

  const reachableSet = new Set<string>();
  const worklist: string[] = [entryBlockId];

  while (worklist.length > 0) {
    const current = worklist.pop();
    if (current === undefined || reachableSet.has(current)) {
      continue;
    }
    reachableSet.add(current);

    const succs = successorsByBlock.get(current) ?? [];
    for (const next of succs) {
      if (!reachableSet.has(next)) {
        worklist.push(next);
      }
    }
  }

  const reachableBlockIds = Array.from(reachableSet).sort((a, b) => compareBlockIds(a, b));
  const unreachableBlockIds = blocks
    .filter((b) => !reachableSet.has(b.id))
    .map((b) => b.id)
    .sort((a, b) => compareBlockIds(a, b));

  const deadCodeStatementIds = blocks
    .filter((b) => !reachableSet.has(b.id))
    .flatMap((b) => b.statements.map((s) => s.id))
    .sort((a, b) => a.localeCompare(b));

  return Object.freeze({
    reachableBlockIds: Object.freeze(reachableBlockIds),
    unreachableBlockIds: Object.freeze(unreachableBlockIds),
    deadCodeStatementIds: Object.freeze(deadCodeStatementIds),
  });
}
