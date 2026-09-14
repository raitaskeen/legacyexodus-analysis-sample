# Contribution Policy

Thank you for your interest in `legacyexodus-analysis-sample`.

---

## 1. Repository Status & Contribution Policy

This repository is maintained primarily as a **public source-visible engineering sample** for portfolio demonstration, hiring evaluation, and technical discussion.

- **Unsolicited code contributions are not currently accepted**: Pull requests proposing new features, refactors, or code modifications are closed without review to maintain clear intellectual property boundaries.
- **Bug and security reports are welcome**: If you identify a bug, behavioral discrepancy, or security concern, you may open an issue or submit a report via the process outlined in [SECURITY.md](SECURITY.md).
- **No rights granted**: Submitting an issue, bug report, or feedback does not grant the submitter any rights or license to this software or documentation, nor does it create a joint authorship or employment relationship.

---

## 2. Maintainer Verification Workflow

For maintainers and reviewers running or verifying the codebase locally:

```bash
# 1. Install dependencies
bun install --frozen-lockfile

# 2. Run format check
bun run format:check

# 3. Run linter
bun run lint

# 4. Run TypeScript typecheck
bun run typecheck

# 5. Run full test suite
bun run test

# 6. Composite verification gate
bun run check
```

### Invariants
1. **Strict TypeScript**: `strict: true` is enforced. No `any` casts, no non-null assertions (`!`), and no compiler suppression directives.
2. **Determinism**: Graph algorithms, structural IDs, and canonical serialization must remain 100% deterministic for identical source inputs.
3. **Truth Before Confidence**: Never fabricate control-flow precision. Constructs outside the modeled subset must trigger `UNSUPPORTED`.
