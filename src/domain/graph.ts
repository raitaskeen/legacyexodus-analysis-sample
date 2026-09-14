import type { AnalysisState } from "./analysis-result";

export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

export interface SourceLocation {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export interface StatementNode {
  readonly id: string;
  readonly type: string;
  readonly location?: SourcePosition;
}

export type ControlFlowEdgeKind = "next" | "true" | "false" | "loop-back" | "return";

export interface BasicBlock {
  readonly id: string;
  readonly statements: readonly StatementNode[];
  readonly predecessorIds: readonly string[];
  readonly successorIds: readonly string[];
  readonly terminator?: string;
}

export interface ControlFlowEdge {
  readonly id: string;
  readonly fromBlockId: string;
  readonly toBlockId: string;
  readonly kind: ControlFlowEdgeKind;
}

export interface ControlFlowGraph {
  readonly id: string;
  readonly filePath: string;
  readonly scopeName: string;
  readonly state: AnalysisState;
  readonly entryBlockId: string;
  readonly exitBlockId: string;
  readonly blocks: readonly BasicBlock[];
  readonly edges: readonly ControlFlowEdge[];
  readonly unreachableBlockIds: readonly string[];
  readonly deadCodeStatementIds: readonly string[];
}
