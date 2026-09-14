import type { SourcePosition } from "./graph";

export class SourceParseError extends Error {
  public readonly code = "PARSE_ERROR";
  public readonly location?: SourcePosition;

  public constructor(message: string, location?: SourcePosition) {
    super(location !== undefined ? `${message} (${location.line}:${location.column})` : message);
    this.name = "SourceParseError";
    this.location = location;
  }
}

export interface InvariantErrorContext {
  readonly blockId?: string;
  readonly rule?: string;
  readonly scopeName?: string;
}

export class ControlFlowInvariantError extends Error {
  public readonly code = "CFG_INVARIANT_ERROR";
  public readonly blockId?: string;
  public readonly rule?: string;
  public readonly scopeName?: string;

  public constructor(message: string, context?: InvariantErrorContext);
  public constructor(blockId: string, detail?: string);
  public constructor(targetOrMessage: string, detailOrContext?: string | InvariantErrorContext) {
    if (typeof detailOrContext === "object" && detailOrContext !== null) {
      super(targetOrMessage);
      this.name = "ControlFlowInvariantError";
      this.blockId = detailOrContext.blockId;
      this.rule = detailOrContext.rule;
      this.scopeName = detailOrContext.scopeName;
    } else if (typeof detailOrContext === "string") {
      super(`Control-flow invariant violated for block '${targetOrMessage}': ${detailOrContext}`);
      this.name = "ControlFlowInvariantError";
      this.blockId = targetOrMessage;
    } else {
      super(
        targetOrMessage.startsWith("Control-flow invariant")
          ? targetOrMessage
          : `Control-flow invariant violated: referenced block '${targetOrMessage}' does not exist.`
      );
      this.name = "ControlFlowInvariantError";
      this.blockId = targetOrMessage;
    }
  }

  public static missingBlock(blockId: string): ControlFlowInvariantError {
    return new ControlFlowInvariantError(
      `Control-flow invariant violated: referenced block '${blockId}' does not exist.`,
      { blockId }
    );
  }

  public static violation(
    rule: string,
    scopeName: string,
    detail: string,
    blockId?: string
  ): ControlFlowInvariantError {
    return new ControlFlowInvariantError(
      `Control-flow invariant violation [${rule}] in scope '${scopeName}': ${detail}`,
      { rule, scopeName, blockId }
    );
  }
}
