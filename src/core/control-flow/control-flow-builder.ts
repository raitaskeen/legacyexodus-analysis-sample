import { ControlFlowInvariantError } from "../../domain/errors";
import type {
  BasicBlock,
  ControlFlowEdge,
  ControlFlowEdgeKind,
  ControlFlowGraph,
  StatementNode,
} from "../../domain/graph";
import type {
  BooleanLiteralSyntaxNode,
  FunctionDeclarationSyntaxNode,
  IfStatementSyntaxNode,
  SyntaxNode,
  WhileStatementSyntaxNode,
} from "../parser/ast";
import { compareBlockIds, computeReachability } from "../reachability/reachability";
import { detectUnsupportedControlFlow } from "./unsupported-detector";

interface MutableBlock {
  readonly id: string;
  readonly statements: StatementNode[];
  terminator?: string;
}

interface ControlContext {
  readonly entryBlockId: string;
  readonly exitBlockId: string;
}

export class DeterministicControlFlowGraphBuilder {
  public build(root: SyntaxNode, filePath = "source.ts"): ControlFlowGraph {
    const moduleStatements = getStatementChildren(root);
    return this.buildScope(filePath, "module", moduleStatements);
  }

  public buildAll(root: SyntaxNode, filePath = "source.ts"): readonly ControlFlowGraph[] {
    const moduleGraph = this.build(root, filePath);
    const functionCandidates = collectFunctions(root);

    const functionGraphs = functionCandidates.map((fn) => {
      const statements = getStatementChildren(fn.node.body);
      return this.buildScope(filePath, fn.name, statements);
    });

    return sortGraphsSemantically([moduleGraph, ...functionGraphs]);
  }

  private buildScope(
    filePath: string,
    scopeName: string,
    nodes: readonly SyntaxNode[]
  ): ControlFlowGraph {
    const isUnsupported = detectUnsupportedControlFlow(nodes);
    const compiler = new ScopeCFGCompiler(filePath, scopeName, isUnsupported);

    const entryId = compiler.createBlock("entry");
    const exitId = compiler.createBlock("exit");

    const lastBlockId = compiler.compileStatements(nodes, entryId, {
      entryBlockId: entryId,
      exitBlockId: exitId,
    });

    if (
      lastBlockId !== exitId &&
      compiler.getBlock(lastBlockId).terminator === undefined &&
      (compiler.hasIncomingEdges(lastBlockId) || lastBlockId === entryId)
    ) {
      compiler.addEdge(lastBlockId, exitId, "next");
    }

    return compiler.finish(entryId, exitId);
  }
}

class ScopeCFGCompiler {
  private readonly blocks: MutableBlock[] = [];
  private readonly edges: ControlFlowEdge[] = [];
  private blockSequence = 0;
  private statementSequence = 0;

  public constructor(
    private readonly filePath: string,
    private readonly scopeName: string,
    private readonly isUnsupported: boolean
  ) {}

  public createBlock(label?: string): string {
    const id =
      label !== undefined
        ? `${this.scopeName}:${label}`
        : `${this.scopeName}:b${++this.blockSequence}`;
    this.blocks.push({ id, statements: [] });
    return id;
  }

  public addEdge(fromBlockId: string, toBlockId: string, kind: ControlFlowEdgeKind): void {
    const id = `${fromBlockId}->${toBlockId}:${kind}`;
    if (this.edges.some((existing) => existing.id === id)) {
      return;
    }
    this.edges.push({ id, fromBlockId, toBlockId, kind });
  }

  public hasIncomingEdges(blockId: string): boolean {
    return this.edges.some((edge) => edge.toBlockId === blockId);
  }

  public getBlock(id: string): MutableBlock {
    const block = this.blocks.find((b) => b.id === id);
    if (!block) {
      throw ControlFlowInvariantError.missingBlock(id);
    }
    return block;
  }

  public compileStatements(
    nodes: readonly SyntaxNode[],
    currentBlockId: string,
    context: ControlContext
  ): string {
    let current = currentBlockId;

    for (const [i, node] of nodes.entries()) {
      // Function declarations establish their own isolated scopes
      if (node.type === "FunctionDeclaration") {
        continue;
      }

      if (node.type === "ReturnStatement") {
        this.addStatementToBlock(current, node);
        this.getBlock(current).terminator = "ReturnStatement";
        this.addEdge(current, context.exitBlockId, "return");

        // If subsequent statements exist after a return, place them in an isolated dead block
        if (i + 1 < nodes.length) {
          current = this.createBlock();
        }
        continue;
      }

      if (node.type === "IfStatement") {
        current = this.compileIf(node as IfStatementSyntaxNode, current, context);
        continue;
      }

      if (node.type === "WhileStatement") {
        current = this.compileWhile(node as WhileStatementSyntaxNode, current, context);
        continue;
      }

      // Normal sequential statement
      this.addStatementToBlock(current, node);
    }

    return current;
  }

  private compileIf(
    node: IfStatementSyntaxNode,
    currentBlockId: string,
    context: ControlContext
  ): string {
    this.addStatementToBlock(currentBlockId, node);

    const consequentBlockId = this.createBlock();
    const joinBlockId = this.createBlock();

    const staticCond = evaluateStaticBoolean(node.test);
    const hasAlternate = Boolean(node.alternate);
    let alternateBlockId: string | undefined;

    if (hasAlternate) {
      alternateBlockId = this.createBlock();
    }

    // Connect true branch if condition is not literal false
    if (staticCond !== false) {
      this.addEdge(currentBlockId, consequentBlockId, "true");
    }

    // Connect false branch if condition is not literal true
    if (staticCond !== true) {
      if (alternateBlockId !== undefined) {
        this.addEdge(currentBlockId, alternateBlockId, "false");
      } else {
        this.addEdge(currentBlockId, joinBlockId, "false");
      }
    }

    // Build consequent statements
    const consequentNodes = getStatementChildren(node.consequent);
    const lastConsequent = this.compileStatements(consequentNodes, consequentBlockId, context);
    if (
      lastConsequent !== context.exitBlockId &&
      this.getBlock(lastConsequent).terminator === undefined
    ) {
      this.addEdge(lastConsequent, joinBlockId, "next");
    }

    // Build alternate statements if present
    if (hasAlternate && alternateBlockId !== undefined && node.alternate) {
      const alternateNodes = getStatementChildren(node.alternate);
      const lastAlternate = this.compileStatements(alternateNodes, alternateBlockId, context);
      if (
        lastAlternate !== context.exitBlockId &&
        this.getBlock(lastAlternate).terminator === undefined
      ) {
        this.addEdge(lastAlternate, joinBlockId, "next");
      }
    }

    return joinBlockId;
  }

  private compileWhile(
    node: WhileStatementSyntaxNode,
    currentBlockId: string,
    context: ControlContext
  ): string {
    let headerBlockId = currentBlockId;
    if (
      currentBlockId === context.entryBlockId ||
      this.getBlock(currentBlockId).statements.length > 0
    ) {
      headerBlockId = this.createBlock();
      this.addEdge(currentBlockId, headerBlockId, "next");
    }

    this.addStatementToBlock(headerBlockId, node);

    const bodyBlockId = this.createBlock();
    const afterBlockId = this.createBlock();

    const staticCond = evaluateStaticBoolean(node.test);

    if (staticCond !== false) {
      this.addEdge(headerBlockId, bodyBlockId, "true");
    }
    if (staticCond !== true) {
      this.addEdge(headerBlockId, afterBlockId, "false");
    }

    const bodyNodes = getStatementChildren(node.body);
    const lastBody = this.compileStatements(bodyNodes, bodyBlockId, context);

    if (
      lastBody !== context.exitBlockId &&
      this.getBlock(lastBody).terminator === undefined &&
      staticCond !== false
    ) {
      this.addEdge(lastBody, headerBlockId, "loop-back");
    }

    return afterBlockId;
  }

  private addStatementToBlock(blockId: string, node: SyntaxNode): void {
    const pos = node.loc
      ? `${node.loc.start.line}:${node.loc.start.column}`
      : `anon-${this.statementSequence++}`;

    const statementId = `${this.scopeName}:stmt:${pos}`;

    this.getBlock(blockId).statements.push({
      id: statementId,
      type: node.type,
      location: node.loc ? node.loc.start : undefined,
    });
  }

  public finish(entryId: string, exitId: string): ControlFlowGraph {
    const predecessorsByBlock = new Map<string, string[]>();
    const successorsByBlock = new Map<string, string[]>();

    for (const block of this.blocks) {
      predecessorsByBlock.set(block.id, []);
      successorsByBlock.set(block.id, []);
    }

    for (const edge of this.edges) {
      successorsByBlock.get(edge.fromBlockId)?.push(edge.toBlockId);
      predecessorsByBlock.get(edge.toBlockId)?.push(edge.fromBlockId);
    }

    // Prune unreferenced, empty synthetic join blocks that have no predecessors and no statements
    const pruneSet = new Set<string>();
    for (const block of this.blocks) {
      if (
        block.id !== entryId &&
        block.id !== exitId &&
        block.statements.length === 0 &&
        (predecessorsByBlock.get(block.id)?.length ?? 0) === 0
      ) {
        pruneSet.add(block.id);
      }
    }

    const activeBlocks =
      pruneSet.size === 0 ? this.blocks : this.blocks.filter((b) => !pruneSet.has(b.id));

    const activeEdges =
      pruneSet.size === 0
        ? this.edges
        : this.edges.filter((e) => !pruneSet.has(e.fromBlockId) && !pruneSet.has(e.toBlockId));

    if (pruneSet.size > 0) {
      for (const removedId of pruneSet) {
        predecessorsByBlock.delete(removedId);
        successorsByBlock.delete(removedId);
      }
      for (const [id, preds] of predecessorsByBlock.entries()) {
        predecessorsByBlock.set(
          id,
          preds.filter((p) => !pruneSet.has(p))
        );
      }
      for (const [id, succs] of successorsByBlock.entries()) {
        successorsByBlock.set(
          id,
          succs.filter((s) => !pruneSet.has(s))
        );
      }
    }

    const basicBlocks: BasicBlock[] = activeBlocks.map((block) => ({
      id: block.id,
      statements: Object.freeze([...block.statements]),
      predecessorIds: Object.freeze(
        (predecessorsByBlock.get(block.id) ?? []).sort((a, b) => compareBlockIds(a, b))
      ),
      successorIds: Object.freeze(
        (successorsByBlock.get(block.id) ?? []).sort((a, b) => compareBlockIds(a, b))
      ),
      ...(block.terminator !== undefined ? { terminator: block.terminator } : {}),
    }));

    const sortedBlocks = sortBlocksSemantically(basicBlocks);
    const sortedEdges = sortEdgesSemantically(activeEdges);

    // Single canonical reachability analysis
    const reachability = computeReachability(entryId, sortedBlocks, sortedEdges);

    return Object.freeze({
      id: `cfg:${this.filePath}:${this.scopeName}`,
      filePath: this.filePath,
      scopeName: this.scopeName,
      state: this.isUnsupported ? "UNSUPPORTED" : "RESOLVED",
      entryBlockId: entryId,
      exitBlockId: exitId,
      blocks: Object.freeze(sortedBlocks),
      edges: Object.freeze(sortedEdges),
      unreachableBlockIds: reachability.unreachableBlockIds,
      deadCodeStatementIds: reachability.deadCodeStatementIds,
    });
  }
}

function getStatementChildren(node: SyntaxNode): readonly SyntaxNode[] {
  if (node.type === "BlockStatement" || node.type === "Program") {
    if (Array.isArray(node.body)) {
      return node.body as readonly SyntaxNode[];
    }
  }
  return [node];
}

function evaluateStaticBoolean(node?: SyntaxNode): boolean | undefined {
  if (!node) return undefined;
  if (node.type === "BooleanLiteral") {
    const boolNode = node as BooleanLiteralSyntaxNode;
    if (typeof boolNode.value === "boolean") {
      return boolNode.value;
    }
  }
  return undefined;
}

function collectFunctions(
  root: SyntaxNode
): readonly { readonly name: string; readonly node: FunctionDeclarationSyntaxNode }[] {
  const result: { name: string; node: FunctionDeclarationSyntaxNode }[] = [];
  let anonymousIndex = 0;

  const visit = (node: SyntaxNode): void => {
    if (node.type === "FunctionDeclaration") {
      const fnNode = node as FunctionDeclarationSyntaxNode;
      const name =
        fnNode.id && typeof fnNode.id.name === "string"
          ? fnNode.id.name
          : `anon_${anonymousIndex++}`;
      const pos = fnNode.loc
        ? `${fnNode.loc.start.line}:${fnNode.loc.start.column}`
        : `${anonymousIndex}`;
      result.push({ name: `${name}@${pos}`, node: fnNode });
    }

    for (const key of Object.keys(node)) {
      if (key === "loc") continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (isSyntaxNode(item)) {
            visit(item);
          }
        }
      } else if (isSyntaxNode(child)) {
        visit(child);
      }
    }
  };

  visit(root);

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function isSyntaxNode(val: unknown): val is SyntaxNode {
  return (
    val !== null &&
    typeof val === "object" &&
    "type" in val &&
    typeof (val as SyntaxNode).type === "string"
  );
}

function sortBlocksSemantically(blocks: BasicBlock[]): BasicBlock[] {
  return blocks.sort((a, b) => compareBlockIds(a.id, b.id));
}

function sortEdgesSemantically(edges: ControlFlowEdge[]): ControlFlowEdge[] {
  return edges.sort((a, b) => {
    const fromDiff = compareBlockIds(a.fromBlockId, b.fromBlockId);
    if (fromDiff !== 0) return fromDiff;
    const kindOrder = ["true", "false", "next", "loop-back", "return"];
    const kindDiff = kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind);
    if (kindDiff !== 0) return kindDiff;
    return compareBlockIds(a.toBlockId, b.toBlockId);
  });
}

function sortGraphsSemantically(graphs: readonly ControlFlowGraph[]): readonly ControlFlowGraph[] {
  return Object.freeze(
    [...graphs].sort((a, b) => {
      if (a.scopeName === "module") return -1;
      if (b.scopeName === "module") return 1;
      return a.scopeName.localeCompare(b.scopeName);
    })
  );
}
