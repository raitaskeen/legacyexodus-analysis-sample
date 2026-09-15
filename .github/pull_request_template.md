## Summary

<!-- Concise summary of proposed changes -->

## Why This Change Is Needed

<!-- Rationale, problem statement, or referenced issue -->

## Behavioral & Semantic Impact

- **Behavioral impact**: 
- **Semantic precision impact**: <!-- Does this affect RESOLVED vs UNSUPPORTED boundaries? -->

## Tests Added or Changed

<!-- List targeted tests added to enforce invariants -->

## Documentation Impact

<!-- List updates to README, docs/DESIGN.md, or docs/CAPABILITIES.md -->

## Security Impact

<!-- Any impact on dependencies, permissions, or security scanners -->

---

## Verification Checklist

- [ ] `bun run check` passes cleanly (format, lint, typecheck, tests, build)
- [ ] Deterministic output preserved (byte-for-byte stable serialization)
- [ ] No false precision introduced (unmodeled control flow remains `UNSUPPORTED`)
- [ ] Unsupported semantics remain explicit where appropriate
- [ ] Machine JSON output remains clean and parseable (`bun run analyze <file> --json`)
- [ ] Documentation updated if behavior changed