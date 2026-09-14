import { DeterministicControlFlowGraphBuilder } from "../core/control-flow/control-flow-builder";
import { assertGraphInvariants } from "../core/control-flow/graph-validator";
import { SourceParser } from "../core/parser/parser";
import type { AnalysisResult, AnalysisState, AnalysisSummary } from "../domain/analysis-result";

/**
 * Configuration options for the `analyzeSource` pipeline.
 */
export interface AnalyzeSourceOptions {
  /**
   * Virtual or relative file path associated with the source code.
   * Used for diagnostics and canonical scope identification.
   * @defaultValue "source.ts"
   */
  readonly filePath?: string;
}

/**
 * Analyzes JavaScript or TypeScript source code and returns a deterministic,
 * immutable control-flow and reachability analysis result.
 *
 * The analysis pipeline executes the following stages:
 * 1. Parses source code into a normalized AST using `@babel/parser`.
 * 2. Isolates independent scopes (module scope and function declarations).
 * 3. Builds an intraprocedural Control-Flow Graph (CFG) for each scope with deterministic structural IDs.
 * 4. Prunes literal `false` branches (`if (false)`, `while (false)`).
 * 5. Computes reachability from `ENTRY` via a worklist algorithm to isolate unreachable dead code.
 * 6. Detects unsupported control flow (short-circuiting `&&`/`||`/`??`, ternary `?:`, `break`, `continue`, `throw`) and assigns explicit state (`RESOLVED` or `UNSUPPORTED`).
 * 7. Asserts structural, relational, and reachability graph invariants via `assertGraphInvariants`.
 *
 * @param source - Raw JavaScript or TypeScript source code string.
 * @param options - Analysis configuration options (e.g. `filePath`).
 * @returns Frozen {@link AnalysisResult} containing all scoped CFGs and aggregate summary metrics.
 * @throws {@link SourceParseError} If the input contains invalid syntax that Babel cannot parse.
 * @throws {@link ControlFlowInvariantError} If internal control-flow structural invariants are violated.
 *
 * @example
 * ```ts
 * import { analyzeSource } from "legacyexodus-analysis-sample";
 *
 * const code = `
 *   function classify(x: number) {
 *     if (x > 0) return "pos";
 *     return "zero-or-neg";
 *   }
 * `;
 * const result = analyzeSource(code, { filePath: "classify.ts" });
 * console.log(`State: ${result.state}, Scopes: ${result.summary.totalScopes}`);
 * ```
 */
export function analyzeSource(source: string, options: AnalyzeSourceOptions = {}): AnalysisResult {
  const filePath = options.filePath ?? "source.ts";
  const parser = new SourceParser();
  const ast = parser.parse(source, filePath);

  const builder = new DeterministicControlFlowGraphBuilder();
  const cfgs = builder.buildAll(ast, filePath);

  // Assert structural and relational invariants across all generated control-flow graphs
  for (const cfg of cfgs) {
    assertGraphInvariants(cfg);
  }

  let totalBlocks = 0;
  let totalEdges = 0;
  let totalUnreachableBlocks = 0;
  let hasUnsupported = false;

  for (const cfg of cfgs) {
    totalBlocks += cfg.blocks.length;
    totalEdges += cfg.edges.length;
    totalUnreachableBlocks += cfg.unreachableBlockIds.length;
    if (cfg.state === "UNSUPPORTED") {
      hasUnsupported = true;
    }
  }

  const overallState: AnalysisState = hasUnsupported ? "UNSUPPORTED" : "RESOLVED";

  const summary: AnalysisSummary = Object.freeze({
    totalScopes: cfgs.length,
    totalBlocks,
    totalEdges,
    totalReachableBlocks: totalBlocks - totalUnreachableBlocks,
    totalUnreachableBlocks,
    state: overallState,
  });

  return Object.freeze({
    filePath,
    state: overallState,
    controlFlowGraphs: cfgs,
    summary,
  });
}
