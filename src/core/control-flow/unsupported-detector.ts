import type { SyntaxNode } from "../parser/ast";

const UNSUPPORTED_NODE_TYPES = new Set([
  "ConditionalExpression",
  "LogicalExpression",
  "OptionalCallExpression",
  "OptionalMemberExpression",
  "BreakStatement",
  "ContinueStatement",
  "ThrowStatement",
]);

const LOGICAL_ASSIGNMENT_OPERATORS = new Set(["&&=", "||=", "??="]);

export function detectUnsupportedControlFlow(nodes: readonly SyntaxNode[]): boolean {
  const visit = (node: SyntaxNode): boolean => {
    // Nested functions manage their own independent control scopes
    if (isFunctionNode(node)) {
      return false;
    }

    if (UNSUPPORTED_NODE_TYPES.has(node.type)) {
      return true;
    }

    if (
      node.type === "AssignmentExpression" &&
      typeof node.operator === "string" &&
      LOGICAL_ASSIGNMENT_OPERATORS.has(node.operator)
    ) {
      return true;
    }

    for (const key of Object.keys(node)) {
      if (key === "loc") continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (isSyntaxNode(item) && visit(item)) {
            return true;
          }
        }
      } else if (isSyntaxNode(child)) {
        if (visit(child)) {
          return true;
        }
      }
    }

    return false;
  };

  return nodes.some(visit);
}

function isFunctionNode(node: SyntaxNode): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

function isSyntaxNode(val: unknown): val is SyntaxNode {
  return (
    val !== null &&
    typeof val === "object" &&
    "type" in val &&
    typeof (val as SyntaxNode).type === "string"
  );
}
