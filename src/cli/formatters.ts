import { SourceParser } from "../core/parser/parser";
import type { AnalysisResult } from "../domain/analysis-result";
import type { BasicBlock, ControlFlowGraph, StatementNode } from "../domain/graph";
import { colorize, renderKeyValueTable, renderTable } from "./table";

export interface FormatOptions {
  readonly verbose?: boolean;
  readonly source?: string;
}

/**
 * Normalizes a block ID to a compact display label relative to its scope.
 * e.g., 'classifyScore@1:0:b1' -> 'b1', 'module:entry' -> 'entry'.
 */
function formatBlockLabel(blockId: string, cfg: ControlFlowGraph): string {
  if (blockId === cfg.entryBlockId) return "entry";
  if (blockId === cfg.exitBlockId) return "exit";
  const prefix = `${cfg.scopeName}:`;
  if (blockId.startsWith(prefix)) {
    return blockId.slice(prefix.length);
  }
  const parts = blockId.split(":");
  return parts[parts.length - 1] ?? blockId;
}

/**
 * Formats statements for compact display.
 * Shows type for 1, 'Type1 + Type2' for 2, '<n> statements' for > 2, and '—' for empty/synthetic.
 */
function formatBlockStatements(statements: readonly StatementNode[]): string {
  if (statements.length === 0) {
    return "—";
  }
  if (statements.length === 1) {
    return statements[0]?.type ?? "—";
  }
  if (statements.length === 2) {
    return `${statements[0]?.type} + ${statements[1]?.type}`;
  }
  return `${statements.length} statements`;
}

/**
 * Formats outgoing transitions for compact display.
 * e.g., 'b1 [true], b2 [false]' or 'exit [return]'.
 */
function formatNextEdges(block: BasicBlock, cfg: ControlFlowGraph): string {
  const outgoing = cfg.edges.filter((e) => e.fromBlockId === block.id);
  if (outgoing.length === 0) {
    return "—";
  }
  return outgoing.map((e) => `${formatBlockLabel(e.toBlockId, cfg)} [${e.kind}]`).join(", ");
}

/**
 * Collects concrete unsupported AST feature descriptions from source.
 */
export function collectUnsupportedFeatures(source: string, filePath = "source.ts"): string[] {
  try {
    const parser = new SourceParser();
    const ast = parser.parse(source, filePath);
    const features = new Set<string>();

    const visit = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;

      if (n.type === "LogicalExpression") {
        const op = typeof n.operator === "string" ? n.operator : "&&";
        features.add(`LogicalExpression (${op})`);
      } else if (n.type === "ConditionalExpression") {
        features.add("ConditionalExpression (?:)");
      } else if (n.type === "OptionalMemberExpression") {
        features.add("OptionalMemberExpression (?.)");
      } else if (n.type === "OptionalCallExpression") {
        features.add("OptionalCallExpression (?.())");
      } else if (
        n.type === "AssignmentExpression" &&
        typeof n.operator === "string" &&
        ["&&=", "||=", "??="].includes(n.operator)
      ) {
        features.add(`LogicalAssignment (${n.operator})`);
      } else if (n.type === "BreakStatement") {
        features.add("BreakStatement");
      } else if (n.type === "ContinueStatement") {
        features.add("ContinueStatement");
      } else if (n.type === "ThrowStatement") {
        features.add("ThrowStatement");
      }

      for (const key of Object.keys(n)) {
        if (key === "loc") continue;
        const val = n[key];
        if (Array.isArray(val)) {
          for (const item of val) visit(item);
        } else if (typeof val === "object" && val !== null) {
          visit(val);
        }
      }
    };

    visit(ast);
    return Array.from(features);
  } catch {
    return ["LogicalExpression (&&)"];
  }
}

/**
 * Formats an AnalysisResult into human-readable, table-driven terminal output.
 */
export function formatHumanSummary(result: AnalysisResult, options: FormatOptions = {}): string {
  const isVerbose = options.verbose ?? false;
  const sections: string[] = [];

  // 1. Heading
  sections.push("LegacyExodus Analysis Sample\nDeterministic control-flow analysis\n");

  // 2. Summary Table
  const stateDisplay =
    result.state === "RESOLVED" ? colorize("RESOLVED", "32") : colorize("UNSUPPORTED", "33");

  const summaryEntries: [string, string][] = [
    ["File", result.filePath],
    ["State", stateDisplay],
    ["Scopes", String(result.summary.totalScopes)],
    ["Blocks", String(result.summary.totalBlocks)],
    ["Edges", String(result.summary.totalEdges)],
    ["Reachable", String(result.summary.totalReachableBlocks)],
    ["Unreachable", String(result.summary.totalUnreachableBlocks)],
  ];

  sections.push(renderKeyValueTable(summaryEntries));

  // 3. Scopes Table
  sections.push("\nScopes\n");

  const scopeHeaders = ["Scope", "State", "Blocks", "Edges", "Unreachable"];
  const scopeRows = result.controlFlowGraphs.map((cfg) => {
    const scopeState =
      cfg.state === "RESOLVED" ? colorize("RESOLVED", "32") : colorize("UNSUPPORTED", "33");
    const unreachVal =
      cfg.unreachableBlockIds.length > 0
        ? colorize(String(cfg.unreachableBlockIds.length), "31")
        : "0";

    return [
      cfg.scopeName,
      scopeState,
      String(cfg.blocks.length),
      String(cfg.edges.length),
      unreachVal,
    ];
  });

  sections.push(renderTable(scopeHeaders, scopeRows));

  // 4. Unsupported Warning Banner (if unsupported)
  if (result.state === "UNSUPPORTED") {
    const features = options.source
      ? collectUnsupportedFeatures(options.source, result.filePath)
      : ["LogicalExpression (&&)"];

    const warningSymbol = colorize("!", "33");
    let notice = `\n${warningSymbol} Partial control-flow precision\n\n`;
    notice += "Unsupported control-flow semantics were detected.\n";
    notice += "This sample does not fabricate CFG edges for unsupported semantics.\n\n";
    notice += "Unsupported:\n";
    for (const feat of features) {
      notice += `  • ${feat}\n`;
    }
    notice += "\nUse --verbose for graph details.";
    sections.push(notice);
  }

  // 5. Default Control Flow Table (when not verbose and resolved)
  if (!isVerbose && result.state === "RESOLVED") {
    // Prefer first non-module function scope; fallback to module
    const primaryCfg =
      result.controlFlowGraphs.find((g) => g.scopeName !== "module") ?? result.controlFlowGraphs[0];

    if (primaryCfg) {
      sections.push(`\nControl Flow · ${primaryCfg.scopeName}\n`);

      const cfHeaders = ["Block", "Reachable", "Statement", "Next"];
      const cfRows = primaryCfg.blocks.map((b) => {
        const isDead = primaryCfg.unreachableBlockIds.includes(b.id);
        const reachableDisplay = isDead ? colorize("UNREACHABLE", "31") : colorize("yes", "32");

        return [
          formatBlockLabel(b.id, primaryCfg),
          reachableDisplay,
          formatBlockStatements(b.statements),
          formatNextEdges(b, primaryCfg),
        ];
      });

      sections.push(renderTable(cfHeaders, cfRows));

      if (primaryCfg.unreachableBlockIds.length > 0) {
        const deadCountStr = colorize(String(primaryCfg.unreachableBlockIds.length), "31");
        sections.push(`\nUnreachable blocks: ${deadCountStr}`);
      }
    }
  }

  // 6. Verbose Diagnostics Mode
  if (isVerbose) {
    sections.push("\n============================================================");
    sections.push("DETAILED GRAPH DIAGNOSTICS (--verbose)");
    sections.push("============================================================");

    for (const cfg of result.controlFlowGraphs) {
      sections.push(`\nSCOPE: ${cfg.scopeName} [${cfg.state}]`);
      sections.push(`  Entry: ${cfg.entryBlockId} | Exit: ${cfg.exitBlockId}`);
      sections.push(`  Blocks (${cfg.blocks.length}):`);

      for (const b of cfg.blocks) {
        const isDead = cfg.unreachableBlockIds.includes(b.id);
        const mark = isDead
          ? colorize(" [UNREACHABLE / DEAD CODE]", "31")
          : colorize(" [REACHABLE]", "32");

        const stmtsDetail =
          b.statements.length > 0
            ? b.statements
                .map((s) =>
                  s.location ? `${s.type} [${s.location.line}:${s.location.column}]` : s.type
                )
                .join(", ")
            : "(empty / synthetic)";

        sections.push(`    - Block ${b.id}${mark}`);
        sections.push(`        Statements:   ${stmtsDetail}`);
        sections.push(`        Predecessors: [${b.predecessorIds.join(", ")}]`);
        sections.push(`        Successors:   [${b.successorIds.join(", ")}]`);
        if (b.terminator) {
          sections.push(`        Terminator:   ${b.terminator}`);
        }
      }

      sections.push(`  Edges (${cfg.edges.length}):`);
      for (const e of cfg.edges) {
        sections.push(`    - ${e.fromBlockId} ──(${e.kind})──> ${e.toBlockId}`);
      }

      if (cfg.unreachableBlockIds.length > 0) {
        sections.push(`  Unreachable Blocks: ${cfg.unreachableBlockIds.join(", ")}`);
        sections.push(`  Dead Statements:    ${cfg.deadCodeStatementIds.join(", ")}`);
      }
      sections.push("------------------------------------------------------------");
    }
  }

  // 7. Completion status
  const completeSymbol = colorize("✓", "32");
  sections.push(`\n${completeSymbol} Analysis complete`);

  return sections.join("\n");
}
