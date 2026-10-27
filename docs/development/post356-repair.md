# Post-356 narrow repair

Base: `83955b898b84722a6518a908d6d1038e44e08a7d`.
Scope: three backend implementation files and their two existing test files.
No frontend, schema, dependencies, instrument content, permissions or deployment changes.

## Correctness

- Freeze the selected result reference kind in the canonical metric identity.
  Historical identities remain parseable. Infer a legacy kind only when the
  immutable original matching population has one distinct kind; ambiguity returns
  no interpretation. A later reference cannot supply the missing original kind.
  ORIGINAL, TIME_MATCHED and LATER_REFERENCE all use that same pinned kind.
- Training picker returns at most 100 **usable** choices. Scan raw grants in
  keyset batches of 100 ordered by tool key, release ID and unique use ID.
  Every row still receives the existing live entry and exact-use checks.
  The existing transaction timeout bounds the scan; no offset or permission bypass.

## Minimal verification and CI

The old routing would incorrectly select the whole platform for this small repair.
A single base/branch and complete-path constrained route now selects:
1. Backend-only compile once, the two affected test files, runtime packaging from
   the same build cache, and unchanged HIGH/CRITICAL runtime scan.
2. Existing JS/TS CodeQL queries on backend source plus changed control scripts.
3. Existing stable required merge gate; missing/skipped/failed checks refuse.

No frontend rebuild, browser/media/load suite, schema migration or production run.
No new admission framework or recreated PR356 qualification chain. The fixed
base and complete diff refuse unknown paths/manual/full fallback. Source and merge
checkout trees must match. Main only classifies an exact two-parent same-tree merge.

Local development evidence: original new-kind fixture first used the validator's
wrong return shape, then incompatible theoretical governance; both failures were
retained. Corrected fixtures passed. Initial runner invocation used unsupported
minWorkers; no cases ran. These are development results, not official CI.
Final source changed afterwards (legacy missing-context handling and picker page
bound), so final affected files are validated at the one official Actions location.
Backend job budget 20 minutes and existing CodeQL limit 30 minutes; five minutes
is a progress/debug threshold, not a promise to omit safety analysis.

Existing locked dependency audit from PR356 is unaffected; actual changed runtime
is scanned anew. This route does not authorize deployment. Scientific content
HOLDs, NFC10/OPT10 content approval and the 356-01 cold/hot performance observation
remain separate; no claim that they were completed here.
