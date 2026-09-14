import type { SourcePosition } from "../../domain/graph";

/**
 * Represents the source coordinates for an AST node.
 */
export interface ASTSourceLocation {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

/**
 * Base contract for all syntax nodes in the analyzed AST.
 */
export interface SyntaxNode {
  readonly type: string;
  readonly loc?: ASTSourceLocation;
  readonly [key: string]: unknown;
}

/**
 * General statement syntax node.
 */
export interface StatementSyntaxNode extends SyntaxNode {
  readonly type: string;
}

/**
 * Top-level program container holding statements.
 */
export interface ProgramSyntaxNode extends StatementSyntaxNode {
  readonly type: "Program";
  readonly body: readonly StatementSyntaxNode[];
}

/**
 * Block of statements delimited by braces.
 */
export interface BlockStatementSyntaxNode extends StatementSyntaxNode {
  readonly type: "BlockStatement";
  readonly body: readonly StatementSyntaxNode[];
}

/**
 * If statement with test expression, consequent, and optional alternate branch.
 */
export interface IfStatementSyntaxNode extends StatementSyntaxNode {
  readonly type: "IfStatement";
  readonly test: SyntaxNode;
  readonly consequent: StatementSyntaxNode;
  readonly alternate?: StatementSyntaxNode | null;
}

/**
 * While loop with test condition and loop body.
 */
export interface WhileStatementSyntaxNode extends StatementSyntaxNode {
  readonly type: "WhileStatement";
  readonly test: SyntaxNode;
  readonly body: StatementSyntaxNode;
}

/**
 * Return statement with optional return value.
 */
export interface ReturnStatementSyntaxNode extends StatementSyntaxNode {
  readonly type: "ReturnStatement";
  readonly argument?: SyntaxNode | null;
}

/**
 * Named function declaration with identifier and block body.
 */
export interface FunctionDeclarationSyntaxNode extends StatementSyntaxNode {
  readonly type: "FunctionDeclaration";
  readonly id?: { readonly name: string } | null;
  readonly body: BlockStatementSyntaxNode;
}

/**
 * Boolean literal expression node (`true` or `false`).
 */
export interface BooleanLiteralSyntaxNode extends SyntaxNode {
  readonly type: "BooleanLiteral";
  readonly value: boolean;
}

/**
 * Assignment expression with operator (e.g. `=`, `+=`, `&&=`).
 */
export interface AssignmentExpressionSyntaxNode extends SyntaxNode {
  readonly type: "AssignmentExpression";
  readonly operator: string;
  readonly left: SyntaxNode;
  readonly right: SyntaxNode;
}
