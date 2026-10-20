# V09: explicit legacy Scale conversion

This is an implementation and controlled-operator procedure, not evidence that any
production object was migrated, backed up, granted rights or deleted.

## Bounded change and checks

Existing published Scale source → validated immutable measurement release and
null-only current pointer. The original definition, definitionHash (including
unknown/null), status, visibility, updatedAt, historical attempts, scores, reports
and exports are not rewritten. Existing scorer/compiler and release repository
remain the only authorities. No schema migration, second scorer or implicit START
conversion is introduced.

Cloud-local directed contracts cover exact source/hash, current owner/system
publisher, real registered compiler and managed source-license evaluation, stale
preview, pointer CAS, identical request recovery, rollback and elapsed expiry.
Database/media boundaries are mocked. No connected PostgreSQL contention, HTTP,
browser, production migration, full regression or CI result is claimed here.

## Inventory and explicit application

1. In the authorized migration environment, inventory the exact Scale IDs to retain,
   their original status/definition hash/pointer and their referenced historical
   objects. Record counts and an actually verified recoverable snapshot identifier.
   The command does not discover all production objects or verify a backup.
2. For each selected Scale, create an operator JSON with requestId (UUID), scaleId,
   actorUserId and recoveryPoint (the non-secret recovery identifier). Run from
   backend: `npx tsx src/scripts/convert-scale-measurement.ts --input plan.json`.
   This is a read-only preview of one named object. Keep the returned proof and
   proofHash with the reviewed object inventory.
3. Only after reviewing it, add expectedProofHash to that same input and run the
   command with `--apply`. No wildcard/batch auto-discovery is supported. The
   request UUID/body and proof must remain unchanged across uncertain retries.
4. The transaction validates the source again, retains its existing media, publishes
   the measurement release and writes only the null Scale pointer plus an existing
   ScalePublicationAudit mapping. Audit, release and pointer commit together.
   Repeating a committed request returns its original mapping without republishing
   or replacing a later explicit source pointer.
5. Verify each named mapping and the unchanged original fields/historical facts
   against the frozen inventory. Failures remain explicitly unmapped; do not invent
   missing historical identity, downgrade an old hash scheme or clear the pointer
   to force a retry. Restore/rollback uses the already verified recovery procedure,
   never an automatic deletion or pointer rewrite in this tool.

STANDARD requires the actual published registry source, byte-equivalent database
definition, existing managed deployment/compiler, current correctly hashed source
license and existing standard publication gates. No compatibility-profile fallback
is accepted. CUSTOM_DESCRIPTIVE requires the actual owning eligible Training teacher,
a runnable definition, explicit self-authored/redistributable rights and any copied
source's unchanged authorization. Other custom license histories remain unproven
and require a separately evidenced decision; this command does not forge one.

Request lock → source identity READ → Scale/copy-source rows → User SHARE NOWAIT →
deployment/license → release is the conversion order. Authorization writers share
the exact source identity lock. The nonwaiting User lock prevents a queued-writer
cycle with existing Survey User-first callers; ACTOR_BUSY_RETRY means no conversion
write occurred and the identical request can be retried. Database clock validity is
checked again after publication waits. Real multi-connection tests remain V10 work.

## Survey catalog caller cutover

Catalog Scale grants/imports/new publications require an existing exact source
measurement release and, for STANDARD, its current managed source license. The
source identity READ lock precedes Scale row SHARE locks. Current release hashes,
scope and actual source projection are verified; list pages use a bounded release
batch, while duplicate source references within one request are reused. Catalog
list availability is informational and is revalidated under transaction locks before
any grant, import or publication; it is never an authorization cache. Missing
conversion stays visible as SOURCE_SCALE_EXPLICIT_CONVERSION_REQUIRED, not hidden.

Older grants lacking the exact source identity are not silently upgraded. Their
current snapshot comparison fails and they must be explicitly re-granted/imported
after source conversion. Existing frozen Waves/results retain original snapshots
and do not call this new-admission source gate.

The existing measurement-release endpoint now explicitly publishes a catalog Scale
at its saved draft revision through the current owned active tool grant and exact
read-only compiler. It does not permit editing source content. The published project
release records sourceReleaseId. Wave freezing resolves that exact published Scale
release; it no longer manufactures catalog Scale versions. Elapsed source-license
expiry is rechecked using the already verified snapshot after later waits.

Native publication behavior remains. Catalog SJT/Cognitive migration is outside
this Scale unit and their existing paths are not silently switched here. The parent
coordinates the minimal Survey selector UI and its verification separately.
