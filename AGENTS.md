# Agent Operating Guidelines — LegacyExodus Analysis Sample

This document defines non-negotiable operational boundaries and verification rules for autonomous agents (Claude, Codex, GitHub Copilot, Cursor, etc.) contributing to or evaluating this repository.

---

## 1. What This Repository Is

This is a focused, deterministic static-analysis sample demonstrating:
- AST parsing via `@babel/parser` (`src/core/parser/`).
- Deterministic basic-block partitioning and directed control-flow graph construction (`src/core/control-flow/control-flow-builder.ts`).
- Pure reachability worklist traversal and dead-code isolation (`src/core/reachability/reachability.ts`).
- Exhaustive graph invariant validation (`src/core/control-flow/graph-validator.ts`).
- Byte-for-byte canonical JSON serialization (`src/core/serialization/serialize-analysis.ts`).

---

## 2. Where Architectural Truth Lives

Before proposing changes, agents must review:
1. [`docs/DESIGN.md`](docs/DESIGN.md) — System architecture, pipeline stages, and design tradeoffs.
2. [`docs/CAPABILITIES.md`](docs/CAPABILITIES.md) — Exact supported vs. unsupported semantics matrix.
3. [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — Detailed technical constraints and invariants.

---

## 3. What Must Never Be Fabricated

- **Zero False Precision**: Do NOT invent CFG edges for unmodeled language constructs (`&&`, `||`, `??`, ternary `?:`, optional chaining `?.`, `break`, `continue`, `throw`). These constructs MUST explicitly trigger `state: "UNSUPPORTED"`.
- **Zero Non-Determinism**: Do NOT use random UUIDs, timestamps, or object iteration order for IDs. All block and edge IDs are structurally derived from AST coordinates.
- **Zero Runtime AI Dependencies**: Do NOT add LLM client libraries, prompt chains, or external API calls into analyzer code.
- **License Integrity**: Do NOT alter the restrictive All Rights Reserved license or claim open-source status.

---

## 4. Mandatory Verification Commands

Before proposing any Pull Request, every agent MUST execute and verify:

```bash
# Composite verification gate (format, lint, typecheck, tests, build)
bun run check

# Verify CLI canonical sample execution
bun run analyze sample.ts

# Verify CLI clean JSON output (machine-readable)
bun run analyze sample.ts --json

# Ensure working directory is clean of build/coverage artifacts
rm -rf dist coverage
```

Expected baseline: **92 tests, 0 failures, 367 assertions**.