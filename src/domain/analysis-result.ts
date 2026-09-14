import type { ControlFlowGraph } from "./graph";

export type AnalysisState = "RESOLVED" | "UNSUPPORTED";

export interface AnalysisSummary {
  readonly totalScopes: number;
  readonly totalBlocks: number;
  readonly totalEdges: number;
  readonly totalReachableBlocks: number;
  readonly totalUnreachableBlocks: number;
  readonly state: AnalysisState;
}

export interface AnalysisResult {
  readonly filePath: string;
  readonly state: AnalysisState;
  readonly controlFlowGraphs: readonly ControlFlowGraph[];
  readonly summary: AnalysisSummary;
}
