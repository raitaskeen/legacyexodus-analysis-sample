export type ScopeKind = "module" | "function";

export interface ScopeInfo {
  readonly name: string;
  readonly kind: ScopeKind;
  readonly startLine?: number;
}
