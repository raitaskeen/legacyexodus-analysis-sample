import { type ParserOptions, parse } from "@babel/parser";
import { SourceParseError } from "../../domain/errors";
import type { ASTSourceLocation, ProgramSyntaxNode, SyntaxNode } from "./ast";

const PARSER_OPTIONS: ParserOptions = {
  allowReturnOutsideFunction: true,
  errorRecovery: false,
  plugins: ["typescript", "jsx"],
  sourceType: "unambiguous",
};

interface BabelLoc {
  readonly line: number;
  readonly column: number;
}

interface BabelNode {
  readonly type: string;
  readonly loc?: {
    readonly start: BabelLoc;
    readonly end: BabelLoc;
  } | null;
  readonly [key: string]: unknown;
}

const IGNORED_BABEL_KEYS = new Set([
  "loc",
  "start",
  "end",
  "extra",
  "comments",
  "leadingComments",
  "trailingComments",
  "innerComments",
  "errors",
]);

export class SourceParser {
  public parse(source: string, filePath = "source.ts"): ProgramSyntaxNode {
    let babelAst: BabelNode;
    try {
      babelAst = parse(source, {
        ...PARSER_OPTIONS,
        sourceFilename: filePath,
      }) as unknown as BabelNode;
    } catch (error: unknown) {
      if (error && typeof error === "object" && "loc" in error) {
        const err = error as { message: string; loc: BabelLoc };
        throw new SourceParseError(err.message, {
          line: err.loc.line,
          column: err.loc.column,
        });
      }
      throw new SourceParseError(error instanceof Error ? error.message : String(error));
    }

    const programNode = babelAst.program as BabelNode;
    return this.mapNode(programNode) as ProgramSyntaxNode;
  }

  private mapNode(raw: BabelNode): SyntaxNode {
    const loc = this.extractLocation(raw);
    const result: Record<string, unknown> = {
      type: raw.type,
      ...(loc !== undefined ? { loc } : {}),
    };

    for (const key of Object.keys(raw)) {
      if (IGNORED_BABEL_KEYS.has(key)) {
        continue;
      }
      const val = raw[key];
      if (Array.isArray(val)) {
        result[key] = Object.freeze(
          val
            .filter((item) => item !== null && item !== undefined)
            .map((item) => (this.isBabelNode(item) ? this.mapNode(item) : item))
        );
      } else if (this.isBabelNode(val)) {
        result[key] = this.mapNode(val);
      } else if (
        typeof val === "string" ||
        typeof val === "number" ||
        typeof val === "boolean" ||
        val === null
      ) {
        result[key] = val;
      }
    }

    return Object.freeze(result as unknown as SyntaxNode);
  }

  private extractLocation(raw: BabelNode): ASTSourceLocation | undefined {
    if (!raw.loc) return undefined;
    return {
      start: { line: raw.loc.start.line, column: raw.loc.start.column },
      end: { line: raw.loc.end.line, column: raw.loc.end.column },
    };
  }

  private isBabelNode(val: unknown): val is BabelNode {
    return (
      val !== null &&
      typeof val === "object" &&
      "type" in val &&
      typeof (val as BabelNode).type === "string"
    );
  }
}
