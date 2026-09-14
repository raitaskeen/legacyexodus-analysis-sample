# Design & Architecture

This document describes the compiler architecture, analysis pipeline stages, key design tradeoffs, and verification strategy of `legacyexodus-analysis-sample`.

---

## 1. System Architecture

```
Interface Layer
  ├── CLI (`src/cli/index.ts`)
  └── Demo UI (`demo/src/app.ts`)
          │
          ▼
Application Layer
  └── `analyzeSource()` (`src/application/analyze-source.ts`)
          │
          ▼
Core Static Analysis Pipeline
  ├── Parser (`src/core/parser/parser.ts`)
  ├── Unsupported Feature Detector (`src/core/control-flow/unsupported-detector.ts`)
  ├── Deterministic CFG Builder (`src/core/control-flow/control-flow-builder.ts`)
  ├── Reachability Engine (`src/core/reachability/reachability.ts`)
  ├── Invariant Validator (`src/core/control-flow/graph-validator.ts`)
  └── Canonical Serializer (`src/core/serialization/serialize-analysis.ts`)
          │
          ▼
Domain Contracts & Invariants (`src/domain/`)
  ├── `BasicBlock`
  ├── `ControlFlowEdge` & `ControlFlowEdgeKind`
  ├── `ControlFlowGraph`
  ├── `AnalysisResult` & `AnalysisState`
  └── `SourceParseError` & `ControlFlowInvariantError`
```

### Layer Responsibilities

- **Domain Layer (`src/domain/`)**: Pure typed contracts for basic blocks, directed edges, control-flow graphs, analysis states (`RESOLVED` vs. `UNSUPPORTED`), and custom error classes.
- **Core Analysis Layer (`src/core/`)**: Pure, deterministic algorithms:
  - `SourceParser`: Normalizes Babel AST into a clean `SyntaxNode` tree.
  - `detectUnsupportedControlFlow`: Scans AST for expression-level short-circuit constructs (`&&`, `||`, `??`, ternary `?:`, `?.`) and unmodeled control-transfer statements (`break`, `continue`, `throw`).
  - `DeterministicControlFlowGraphBuilder`: Compiles statements into basic blocks and directed edges; prunes literal boolean false conditions (`if (false)`, `while (false)`).
  - `computeReachability`: Pure canonical worklist traversal computing reachable blocks, unreachable blocks, and dead code statements.
  - `assertGraphInvariants`: Asserts that every generated graph satisfies structural, relational, and reachability invariants before returning.
  - `serializeAnalysisResult`: Produces byte-for-byte stable canonical JSON with semantic block ordering.
- **Application Layer (`src/application/`)**: Coordinates parsing, graph construction, reachability, invariant validation, metrics aggregation, and result packaging.
- **Interface Layer (`src/cli/`, `demo/`)**: CLI runner with human-readable and `--json` outputs; minimal browser UI visualizer that strictly consumes `analyzeSource()`.

---

## 2. Analysis Pipeline Stages

1. **Parsing & AST Normalization**: Source code is parsed via `@babel/parser` (`plugins: ["typescript", "jsx"]`) and mapped to explicit `SyntaxNode` structures.
2. **Scope Identification & Unsupported Detection**: The AST is scanned for module and function declarations. Any unsupported control structures (`&&`, `||`, `??`, `?:`, `?.`, `break`, `continue`, `throw`) set the scope state to `UNSUPPORTED` to prevent false precision.
3. **CFG Construction**: `DeterministicControlFlowGraphBuilder` partitions statements into basic blocks and links them with typed edges (`next`, `true`, `false`, `loop-back`, `return`), pruning literal false branches.
4. **Reachability Analysis**: `computeReachability` traverses from `entryBlockId` using a worklist algorithm. Disconnected blocks are marked unreachable; their statements are flagged as dead code.
5. **Structural Invariant Validation**: `assertGraphInvariants` verifies that every generated graph satisfies structural, relational, and reachability invariants before returning.
6. **Canonical Serialization**: `serializeAnalysisResult` outputs formatted JSON with semantically ordered blocks (`entry` $\to$ body $\to$ `exit`) and deterministically sorted edges.

---

## 3. Core Design Decisions

### Deterministic Structural IDs vs. Hashes / UUIDs
All IDs are derived deterministically from syntax coordinates:
- Scope: `${scopeName}@${line}:${col}` (or `module`)
- Block: `${scopeId}:entry`, `${scopeId}:b${n}`, `${scopeId}:exit`
- Edge: `${fromBlockId}->${toBlockId}:${kind}`
- Statement: `${scopeId}:stmt:${line}:${col}`

This ensures byte-for-byte reproducibility across runs without cryptographic hashing overhead or random UUID non-determinism.

### Truthful Uncertainty vs. Fabricated Precision
When input code contains unsupported control transfers (short-circuit boolean expressions, ternary operators, `break`, `continue`, or `throw`), the analyzer reports `UNSUPPORTED` for that scope rather than pretending to model paths it cannot verify.

### Semantic Graph Ordering
Blocks in serialized CFGs are ordered semantically (`entry`, body blocks `b1..bn`, `exit`) rather than lexicographically, ensuring that inspection matches actual control flow.

### Decoupled Parser Boundary
The CFG builder operates on normalized `SyntaxNode` representations rather than Babel AST directly, isolating compiler logic from third-party AST schemas.

### UI as a Pure Presentation Client
The browser demo UI consumes `analyzeSource()` and `serializeAnalysisResult()` identically to the CLI. It contains zero compiler, edge-calculation, or reachability logic.

### Minimal Dependency Footprint
The core analysis library relies on exactly one runtime dependency: `@babel/parser`. Everything else is built from first principles.

---

## 4. Verification Strategy

The test suite enforces structural invariants, determinism, and error boundaries across 5 consolidated files:

| Test File | Focus | Assertions |
| :--- | :--- | :--- |
| `tests/unit/cfg.test.ts` | Statement sequencing, branching, while loops, dead code pruning, reachability worklist, unsupported control detection, scope isolation | 37 tests |
| `tests/unit/invariants.test.ts` | Graph invariant validation (entry/exit, no dangling edges, unique predecessors/successors, statement attribution) and combinatorial matrix | 24 tests |
| `tests/unit/determinism.test.ts` | Multi-run serialization stability, golden fixtures, line-ending portability | 7 tests |
| `tests/integration/analyzer.test.ts` | End-to-end pipeline, TypeScript samples, live invariant verification, loop cycle reachability, fail-closed regression | 7 tests |
| `tests/integration/cli.test.ts` | CLI execution, table presentation, stdout reporting, `--verbose`, `--json` mode, TTY color resilience, error exit codes, path handling | 17 tests |

Run all gates:
```bash
bun run check
```
