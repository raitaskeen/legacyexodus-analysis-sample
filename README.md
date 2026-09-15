# LegacyExodus Analysis Sample

> A focused static-analysis engineering sample demonstrating deterministic AST-driven control-flow construction, reachability analysis, explicit uncertainty handling, and invariant-based verification.

[![CI](https://github.com/raitaskeen/legacyexodus-analysis-sample/actions/workflows/ci.yml/badge.svg)](https://github.com/raitaskeen/legacyexodus-analysis-sample/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-black.svg)](https://bun.sh/)
[![Linter](https://img.shields.io/badge/Linter-Biome-60a5fa.svg)](https://biomejs.dev/)

> [!NOTE]
> **Notice**: The complete LegacyExodus platform remains private. This repository is an independent, sanitized engineering sample demonstrating selected implementation patterns from the project.

---

## 5-Minute Senior Review Path

If you have five minutes to evaluate this sample:

1. **Analyze the Canonical Sample**: Run `bun run analyze sample.ts` (or `bun run analyze sample.ts --json`).
2. **Launch the Simple Demo**: Run `bun run demo` and open `http://localhost:3000` to inspect the visual CFG for `sample.ts`.
3. **Inspect the Core CFG Builder**: Review [`src/core/control-flow/control-flow-builder.ts`](src/core/control-flow/control-flow-builder.ts) for clean basic block partitioning and edge construction.
4. **Inspect the Tests**: Check [`tests/unit/cfg.test.ts`](tests/unit/cfg.test.ts) and [`tests/unit/invariants.test.ts`](tests/unit/invariants.test.ts) for structural invariant enforcement.
5. **Read Architecture & Decisions**: Read [`docs/DESIGN.md`](docs/DESIGN.md) for architectural layering, pipeline stages, and design tradeoffs.

---

## Canonical Sample (`sample.ts`)

Both the CLI and the web demo analyze the root [`sample.ts`](sample.ts) by default:

```typescript
export function classifyScore(score: number): string {
  if (score >= 80) {
    return "pass";
  }

  return "review";
}

classifyScore(85);
```

### Analysis Topology

```
ENTRY (classifyScore@1:0:entry)
  │
  ├─ IfStatement (score >= 80)
  │
  ├───(true)───► classifyScore@1:0:b1 [ReturnStatement "pass"]
  │                     │
  │                     └───(return)───► EXIT (classifyScore@1:0:exit)
  │                                         ▲
  └───(false)──► classifyScore@1:0:b2       │
                        │                   │
                        └─ [Return "review"] ┘
```

Result: Both branches terminate to the synthetic `EXIT` block. All blocks are reachable; 0 dead code statements exist.

---

## Quick Start

### 1. Prerequisites
- [Bun](https://bun.sh) (v1.2+)

### 2. Installation
```bash
bun install --frozen-lockfile
```

### 3. Run the CLI
Analyze the canonical sample with human-readable formatting:
```bash
bun run analyze sample.ts
```

Output machine-readable canonical JSON:
```bash
bun run analyze sample.ts --json
```

Analyze dead-code / compile-time false pruning:
```bash
bun run analyze examples/unreachable.ts
```

### 4. Run the Simple Demo UI
Launch the browser-based CFG visualizer:
```bash
bun run demo
```
Open [http://localhost:3000](http://localhost:3000) to inspect the SVG graph layout, click any block to inspect its predecessor/successor statements, or select curated examples (Basic `sample.ts`, Dead Code, Unsupported).

### 5. Run Quality Verification Gates
```bash
bun run check
```
Runs format checking, linting, typechecking, full test suite, and demo production build. Every Pull Request automatically undergoes this deterministic verification gate in CI alongside CodeQL static analysis, dependency vulnerability scanning, and coverage reporting.

---

## What This Demonstrates

- **Compiler Layering**: Clean boundaries between Domain contracts, AST normalization, CFG construction, Reachability analysis, and Serialization.
- **Strict TypeScript**: `strict: true`, no `any`, no non-null assertions (`!`), immutable domain types.
- **Deterministic Structural IDs**: Human-readable canonical IDs (`${scope}:entry`, `${scope}:b1`, `${scope}:exit`, `${from}->${to}:${kind}`). Deterministic for identical source and configuration without opaque random hashes.
- **Truth Before Confidence**: Detects expressions with internal short-circuit branching (`&&`, `||`, `??`, `?:`) and unmodeled jumps (`break`, `continue`, `throw`), reporting `UNSUPPORTED` for that scope rather than inventing unmodeled paths.
- **Invariant-Based Testing**: 92 tests across 5 consolidated files verifying branch logic, return termination, dead code isolation, repeated determinism, line-ending portability, and graph invariants.

---

## Capability Summary

| Capability | Status | Implementation Notes |
| :--- | :--- | :--- |
| **Parsing JS / TS** | **Supported** | Configured Babel parser accepts JavaScript/TypeScript syntax. |
| **Sequential CFG** | **Supported** | Linear statement execution mapped within single-entry basic blocks. |
| **`if` / `if..else`** | **Supported** | Explicit `true`, `false`, and join control transitions. |
| **`while` Loops** | **Supported** | Header, body, `loop-back`, and loop-exit edges. |
| **`return` Terminators** | **Supported** | Terminal basic blocks mapped directly to scope `EXIT`. Dead-after-return isolated. |
| **Reachability Analysis** | **Supported** | Worklist traversal isolating unreachable blocks and dead code statements. |
| **Literal False Branch Pruning** | **Supported** | Literal boolean `if (false)` and `while (false)` bodies isolated as dead code. |
| **Short-Circuit Expressions** | **Explicitly Unsupported** | `&&`, `||`, `??`, `?:`, `?.` trigger `UNSUPPORTED` state to avoid false certainty. |
| **`break` / `continue` Statements** | **Explicitly Unsupported** | Loop jumps unmodeled; marks scope `UNSUPPORTED` to prevent false certainty. |
| **`throw` Statements** | **Explicitly Unsupported** | Exception control transfer unmodeled; marks scope `UNSUPPORTED` to avoid false sequential fallthrough. |
| **Data Flow / Interprocedural** | **Out of Scope** | Cross-function call edges and def-use chains excluded to keep sample focused. |

For detailed capability documentation, see [`docs/CAPABILITIES.md`](docs/CAPABILITIES.md).

---

## Repository Structure

```
legacyexodus-analysis-sample/
├── .github/
│   └── workflows/
│       └── ci.yml               # Automated CI verification gate
│
├── docs/
│   ├── CAPABILITIES.md          # Precise supported vs unsupported matrix
│   └── DESIGN.md                # Architecture, pipeline, decisions & testing
│
├── examples/
│   ├── basic-branch.ts          # Minimal branching program
│   ├── if-else.ts               # Two-sided conditional execution
│   ├── loop.ts                  # While loop with back-edge
│   ├── unreachable.ts           # Dead code demonstration
│   ├── unsupported.ts           # Short-circuit expression demonstration
│   └── expected/                # Golden serialized JSON fixtures
│
├── src/
│   ├── domain/                  # Pure contracts (blocks, edges, graphs, errors)
│   ├── core/
│   │   ├── parser/              # AST normalization wrapper
│   │   ├── control-flow/        # Deterministic CFG builder & uncertainty detector
│   │   ├── reachability/        # Graph reachability worklist algorithm
│   │   └── serialization/       # Canonical JSON serializer
│   ├── application/             # analyzeSource() orchestrator
│   ├── cli/                     # Executable CLI interface
│   └── index.ts                 # Public library entrypoint
│
├── demo/                        # Simple Demo UI (Vite + Vanilla TypeScript)
│   ├── index.html               # Clean 2-panel layout
│   ├── vite.config.ts           # Vite configuration with root raw imports
│   └── src/                     # App logic, SVG renderer, and examples
│
├── tests/                       # 92 tests across 5 files
│   ├── fixtures/                # Synthesized test code strings
│   ├── unit/
│   │   ├── cfg.test.ts          # Builder, adversarial semantics, reachability
│   │   ├── invariants.test.ts   # Graph validator, combinatorial matrix
│   │   └── determinism.test.ts  # Serialization stability, portability
│   └── integration/
│       ├── analyzer.test.ts     # End-to-end pipeline & sample.ts equivalence
│       └── cli.test.ts          # CLI execution & output modes
│
├── sample.ts                    # Tiny canonical sample analyzed by CLI & demo
├── biome.json                   # Biome formatter & linter configuration
├── tsconfig.json                # Strict TypeScript configuration
├── package.json                 # Package manifest
├── LICENSE                      # Repository license (All Rights Reserved)
├── NOTICE                       # Attribution and evaluation notice
└── README.md
```

---

## License & Usage

This repository is a public source-visible engineering sample for technical portfolio demonstration and hiring evaluation purposes. It is not an open-source project.

The source is publicly visible so recruiters and engineers can inspect the implementation. Public visibility does not grant reuse rights. All rights are reserved. No permission is granted to copy, modify, redistribute, sublicense, commercially exploit, or incorporate this source code into another product or service, except where applicable law provides otherwise.

Third-party dependencies remain subject to their respective licenses.

See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for terms.
