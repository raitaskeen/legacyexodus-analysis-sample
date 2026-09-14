/**
 * LegacyExodus Static Analysis Sample
 * Deterministic Control-Flow Graph Construction & Reachability Analysis.
 *
 * @packageDocumentation
 */

export { analyzeSource, type AnalyzeSourceOptions } from "./application/analyze-source";
export { serializeAnalysisResult } from "./core/serialization/serialize-analysis";

export type {
  SourcePosition,
  SourceLocation,
  StatementNode,
  ControlFlowEdgeKind,
  BasicBlock,
  ControlFlowEdge,
  ControlFlowGraph,
} from "./domain/graph";

export type {
  AnalysisState,
  AnalysisSummary,
  AnalysisResult,
} from "./domain/analysis-result";

export type {
  ScopeKind,
  ScopeInfo,
} from "./domain/scope";

export {
  SourceParseError,
  ControlFlowInvariantError,
} from "./domain/errors";
