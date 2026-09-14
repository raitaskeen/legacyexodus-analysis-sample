# Capability Matrix & Operational Boundaries

This document defines the supported language syntax, static analysis semantics, and deliberate architectural boundaries of `legacyexodus-analysis-sample`.

---

## 1. Parser Acceptance vs. CFG Semantic Support

A fundamental distinction in static analysis is between **syntax acceptance** and **semantic modeling**:

| Dimension | Scope & Behavior |
| :--- | :--- |
| **Parser Syntax Acceptance** | The configured `@babel/parser` accepts the JavaScript and TypeScript syntax enabled by this sample's parser configuration, including type annotations, interfaces, generics, classes, async/await, generators, and expressions. Valid syntax is parsed into an intermediate AST. Unparseable syntax raises a structured `SourceParseError`. |
| **CFG Semantic Modeling** | The Control-Flow Graph (CFG) engine models a **selected intraprocedural subset** of statement-level control structures. Constructs within this subset are converted into basic blocks and directed edges with deterministic repeatability. |
| **Explicit Uncertainty Boundary** | Constructs outside the modeled subset that introduce intra-expression branching (e.g. short-circuiting `&&`, `||`, ternary `?:`) trigger an explicit `UNSUPPORTED` status for that scope, refusing to fabricate unverified paths. |

---

## 2. Syntax & Analysis Capability Matrix

| Capability | Status | Implementation Notes |
| :--- | :--- | :--- |
| **JavaScript Source Parsing** | **Supported** | JavaScript syntax enabled by the parser configuration parsed via `@babel/parser`. |
| **TypeScript Source Parsing** | **Supported** | Type annotations, interfaces, and type declarations parsed and normalized without crashing. |
| **Module Scope CFG** | **Supported** | Top-level statements modeled into an intraprocedural CFG with deterministic `ENTRY` and `EXIT`. |
| **Function Scope CFG** | **Supported** | `FunctionDeclaration` nodes isolated into independent intraprocedural CFGs with unique structural scope IDs (`${name}@${line}:${col}`). |
| **Sequential Statements** | **Supported** | Statements chained linearly within single-entry basic blocks. |
| **`if` Statement (without else)** | **Supported** | Branching modeled with `true` edge to consequent and `false` edge bypassing to join. |
| **`if / else` Statement** | **Supported** | Branching modeled with `true` edge to consequent and `false` edge to alternate, joining into successor block. |
| **`while` Loop** | **Supported** | Header block with `true` edge to body, `loop-back` edge to header, and `false` exit edge. |
| **`return` Statement** | **Supported** | Terminates basic block and connects directly to scope `EXIT` with `"return"` edge kind. Subsequent statements placed in new unreachable block (dead after return). |
| **Reachability Analysis** | **Supported** | Worklist traversal from `ENTRY`. Blocks without reachable paths marked `unreachable` and statements marked `dead code`. |
| **Literal False Branch Pruning** | **Supported** | Literal boolean `if (false)` omits `true` edge, isolating the consequent block as unreachable dead code. *Note: General constant expression folding is not performed.* |
| **Literal False Loop Pruning** | **Supported** | Literal boolean `while (false)` omits `true` edge, isolating the loop body as unreachable dead code. |
| **Expression Short-Circuit Detection** | **Explicitly Unsupported** | Scopes with `&&`, `||`, `??`, `? :`, `?.`, or logical assignments (`&&=`, `||=`, `??=`) are marked `UNSUPPORTED` state to prevent false certainty. |
| **`break` / `continue` Statements** | **Explicitly Unsupported** | Loop jump targets are not lowered in this sample slice; scopes containing `break` or `continue` are marked `UNSUPPORTED` rather than falsely modeled as sequential. |
| **`throw` Statements** | **Explicitly Unsupported** | Exception propagation is not modeled in this sample slice; scopes containing `throw` are marked `UNSUPPORTED` rather than falsely modeled as sequential. |
| **`for` / `for..of` / `for..in` Loops** | **Out of Scope** | Not modeled in this sample slice; treated as sequential blocks. |
| **`switch` Statements** | **Out of Scope** | Multi-way branch modeling omitted from this sample slice. |
| **Exception Flow (`try`/`catch`/`finally`)** | **Out of Scope** | Exceptional control flow edges omitted from this sample slice. |
| **Interprocedural / Call Graph** | **Out of Scope** | Analysis is strictly intraprocedural; call edges across function boundaries are omitted. |
| **Data Flow Analysis** | **Out of Scope** | Def-use chains and variable lifetime tracking omitted to keep sample focused on CFG + reachability. |

---

## 3. Core Operational Principle

> **Truthful Incompleteness Over Fabricated Precision**
>
> For unsupported expression-level control, this sample reports `UNSUPPORTED` rather than inventing unmodeled execution edges.

