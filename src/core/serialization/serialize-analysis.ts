import type { AnalysisResult } from "../../domain/analysis-result";

/**
 * Serializes an {@link AnalysisResult} into a canonical, deterministic JSON string.
 *
 * All identifiers, predecessor lists, successor lists, and dead-code collections
 * are sorted deterministically so that repeated invocations yield byte-for-byte identical output.
 *
 * @param result - The analysis result object to serialize.
 * @returns Formatted JSON string with 2-space indentation and a trailing newline.
 *
 * @example
 * ```ts
 * import { analyzeSource, serializeAnalysisResult } from "legacyexodus-analysis-sample";
 *
 * const result = analyzeSource("let x = 1;");
 * const jsonOutput = serializeAnalysisResult(result);
 * console.log(jsonOutput);
 * ```
 */
export function serializeAnalysisResult(result: AnalysisResult): string {
  const canonicalResult = {
    filePath: result.filePath,
    state: result.state,
    summary: {
      totalScopes: result.summary.totalScopes,
      totalBlocks: result.summary.totalBlocks,
      totalEdges: result.summary.totalEdges,
      totalReachableBlocks: result.summary.totalReachableBlocks,
      totalUnreachableBlocks: result.summary.totalUnreachableBlocks,
      state: result.summary.state,
    },
    controlFlowGraphs: result.controlFlowGraphs.map((cfg) => ({
      id: cfg.id,
      filePath: cfg.filePath,
      scopeName: cfg.scopeName,
      state: cfg.state,
      entryBlockId: cfg.entryBlockId,
      exitBlockId: cfg.exitBlockId,
      blocks: cfg.blocks.map((block) => ({
        id: block.id,
        statements: block.statements.map((stmt) => ({
          id: stmt.id,
          type: stmt.type,
          ...(stmt.location !== undefined
            ? {
                location: {
                  line: stmt.location.line,
                  column: stmt.location.column,
                },
              }
            : {}),
        })),
        predecessorIds: [...block.predecessorIds].sort((a, b) => a.localeCompare(b)),
        successorIds: [...block.successorIds].sort((a, b) => a.localeCompare(b)),
        ...(block.terminator !== undefined ? { terminator: block.terminator } : {}),
      })),
      edges: cfg.edges.map((edge) => ({
        id: edge.id,
        fromBlockId: edge.fromBlockId,
        toBlockId: edge.toBlockId,
        kind: edge.kind,
      })),
      unreachableBlockIds: [...cfg.unreachableBlockIds].sort((a, b) => a.localeCompare(b)),
      deadCodeStatementIds: [...cfg.deadCodeStatementIds].sort((a, b) => a.localeCompare(b)),
    })),
  };

  return `${JSON.stringify(canonicalResult, null, 2)}\n`;
}
