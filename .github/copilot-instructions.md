# GitHub Copilot Instructions — LegacyExodus Analysis Sample

This repository demonstrates deterministic, intraprocedural AST-driven control-flow graph (CFG) construction and reachability analysis in TypeScript using Bun.

## Core Architectural Invariants

1. **Deterministic Static Analysis**:
   - The analysis pipeline is strictly ordered:
     `Parser` → `Unsupported Feature Detection` → `CFG Builder` → `Reachability Analysis` → `Invariant Validation` → `Canonical Serialization`.
   - Never bypass or weaken `assertGraphInvariants()`.

2. **Truth Before Confidence (Zero False Precision)**:
   - When control structures or expressions cannot be modeled with complete certainty (e.g. `break`, `continue`, `throw`, short-circuiting `&&`, `||`, `??`, ternary `?:`, optional chaining `?.`), the analyzer MUST report `state: "UNSUPPORTED"`.
   - NEVER fabricate CFG edges or pretend to model execution paths outside the verified intraprocedural subset.

3. **Deterministic Structural Identifiers**:
   - Scope IDs, Block IDs, and Edge IDs are derived deterministically from syntax coordinates (e.g., `${scope}:entry`, `${scope}:b1`, `${scope}:exit`, `${from}->${to}:${kind}`).
   - NEVER introduce non-deterministic hashes, random UUIDs, or declaration-order dependencies.
   - Graph blocks are ordered semantically (`entry` → `b1..bn` → `exit`).

4. **Runtime & Code Standards**:
   - Runtime is **Bun** (v1.2+).
   - Strict TypeScript: `strict: true`. No `any`, no non-null assertions (`!`), and no compiler suppression directives (`@ts-ignore`, `@ts-expect-error`).
   - Zero runtime LLM or AI dependencies. Do NOT add runtime AI calls or prompts to analyzer code.

5. **Interface Boundaries**:
   - **CLI**: Human-readable tables by default; `--json` mode must output byte-clean canonical JSON only, without decorative log lines.
   - **Demo UI**: Pure presentation client consuming `analyzeSource()` and `serializeAnalysisResult()`. The UI must never implement compiler, CFG edge, or reachability logic independently.

6. **Quality Gate & Testing**:
   - Every change must pass `bun run check` (format check, lint, typecheck, tests, build).
   - Any bug fix or semantic adjustment requires an accompanying targeted invariant or regression test.
   - Baseline test suite is 92 tests, 0 failures, 367 assertions. Never weaken existing assertions.

7. **Security & Least Privilege**:
   - All GitHub Actions must be pinned by immutable commit SHA.
   - Minimal permissions: read-only by default (`contents: read`).