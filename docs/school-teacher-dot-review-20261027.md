# PR357 dot-local independent review and corrections

Original PR head: `02da0f1e442a375c7c4bf27f9c32d08e0c9b14d0`.
Latest main incorporated without conflicts: `04a8d994207d7b831b874d4be4f5c31640466458`.
Original School and Teacher ancestry retained. No Codex conversation, production
connection, deployment, historical-data cleanup or new permission grant.

## Confirmed review findings

### P1: resolved class identity was not used for whole-file deduplication

A textual grade and default grade ID can denote the same parent. The original
validator keyed their different representations; the structural insert helper
serialized transactions but did not check existing same-level names.

Real isolated PostgreSQL 17.11 and HTTP regression reproduced three failures on
original implementation: 2-row and 101-row alias files were accepted (HTTP200
instead of400), and two concurrent same-parent creates both succeeded.

Correction:
- Resolve class parents in the owning school before inserting a whole-file job
  and when matching its original source; reject duplicate resolved parent/name.
- Keep the original input and digest unchanged for resumable matching.
- Under the existing organization advisory transaction lock, recheck same kind,
  parent and trimmed name before the shared structural insert. Conflict is409.
- The roster HTTP adapter preserves the domain error/status instead of returning500.
- Do not add a unique index over unknown historical duplicate data or silently
  merge/delete history. Tests preserve two synthetic legacy duplicates unchanged.

Three regression targets passed after correction. The strengthened concurrency
case additionally verifies the exact UNIT_NAME_EXISTS error and rollback of both
writes in one duplicate batch. These are local targeted results, not final CI.

### P2: large-file quota must be disclosed, not silently widened

The existing execution plan explicitly retains40 writes/IP/900s. A5000-row file
requires50 batches. Keep this safety contract and explicit continuation; add an
upfront UI explanation, including shared-network consumption and preserved progress.

A real PostgreSQL + Redis + HTTP test processed5000 staff rows across50 batches:
40 commits succeed, the next returns429 with Retry-After; another authorized user
on the same IP is also refused. The test expires only the isolated Redis window
instead of waiting15minutes, explicitly resumes with a new token, rejects the old
token and completes the remaining10 batches. Previous40 receipts stay unchanged;
no accounts or product grants are auto-created. The production middleware/Lua and
quota values are real, but this is controlled synthetic testing, not production.
The new upfront-message UI assertion also passed. No quota expansion.

## Remaining qualification scope

This is not pure UI: original PR includes2 migrations/6 SQL-owned tables, personnel
identity/activation, formal submission protection and shared FORM/Scale/Survey/SJT
consumers. Key call chains, transaction boundaries, source matching and direct
shared consumers were statically reviewed; this is not a claim of exhaustive
line-by-line security proof.

Final qualification must bind the complete merged candidate and cover affected
backend/frontend tests, current types/builds, isolated migration upgrade/restore,
selected browser consumers and existing security checks. No unrelated media/load
or full-platform experience suites. Current changed-test inventory is17backend
(including8PG integration files) and63frontend, plus directly affected unchanged
consumers to be enumerated before CI. Historical local phase counts remain at
their original inputs; the old summary is not signed final CI evidence.

Local debugging results retain their failures and filtered cases. New-target
counts must not double-count the strengthened concurrency rerun. Do not claim
scientific-content approval, manual expert-page approval or production deployment.
The user now authorizes corrections/push and PR357 CI, superseding the original
submission-only restriction, but PR357 merge is not performed by this record.

## Bounded history projection

Independent review found that listing20 jobs fetched every part/error of each
job, although the history UI needs only counts and identity. A single5000-row
error task can otherwise dominate the list payload. The list now returns only
summary fields and one grouped part-count query for the selected page; full
errors and receipts remain behind the existing authorized detail endpoint.
Selection fetches details explicitly and discards responses after a school/API
scope change. No change to mutation permissions or immutable receipts.

Real PostgreSQL verifies a5000-error fixture has a list response below1500bytes
while detail still returns all50parts/5000errors. Three targeted UI cases verify
history selection, completed receipt loading and late-response isolation using
summary-only fixtures. This is a bounded payload/consumer proof, not a whole-site
capacity or production latency benchmark.
