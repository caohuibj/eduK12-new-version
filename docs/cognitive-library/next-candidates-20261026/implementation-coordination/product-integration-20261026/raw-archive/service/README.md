# MOT raw archive thin service — cloud evidence

The service accepts already sealed MOT formal/practice detail only after the real owner FINAL is persisted. It reads authoritative core, frozen configuration/admission and result from PostgreSQL; it does not rerun the scorer or accept client reports. Current scope is authenticated owner, non-public, non-composite sessions. Existing physical stimulus and timing contracts are unchanged.

## Identity and storage

POST uses sessionId/attemptEpoch/submissionId/definitionHash plus rawPayload/rawSha256; GET uses the same identity and returns pending or confirmed, including the original rawSha256. Logical full-package hash includes stable server authority and the complete client detail. StoredAsset.sha256 instead hashes encrypted bytes; neither ciphertext nonce nor asset ID establishes business idempotency. Detail/package bounds are 8/12 MiB; formal ≤45, practice ≤100, each existing frame array ≤3000. No truncation or new collection is performed.

Short session→raw row locks protect preflight and final business-slot checks. Network upload is outside those parent row locks. Upload explicitly requests cos PRIVATE and encryptCognitivePayload, atomically registering an independent pending AssetReference. A second locked check appends one final reference and deletes only the owned pending reference. Same package replays/adopts a pending upload; different packages conflict. Safe loser cleanup never replaces the entity reference collection. Existing discardUnreferencedAsset establishes logical deletion, not guaranteed physical COS garbage collection; surviving foreign references retain the pending cleanup trace. Process-cut pending uploads remain durable; no background queue or automatic cleanup schedule was added. Existing storage-library object-level transactions retain their own established semantics.

## Verification

Real isolated PostgreSQL schema cognitive_archive_20261026, synthetic accounts/course, actual config publish→assignment→START→FINAL persisted core/result. Fake COS uploader creates real PRIVATE cos metadata and atomic references, captures encrypted bytes, and forbids external COS PUT/HEAD. COS deletion is a synthetic callback. This is not evidence of real external COS durability, production deployment, complete application startup, export authorization, or physical-device timing.

postgres-core-contracts.json: six cases, exit 0. postgres-two-boundaries.json: only two added cases, exit 0 (the prior six were skipped and reused). Cases cover stable encrypted authority, replay, owner/identity/injection rejection, same/different concurrent uploads, no session/raw lock during upload, crash adoption, unconfirmed storage, changed authority, and safe foreign-reference retention.

The initial single-root actual backend TypeScript check omitted the existing Express Request.user augmentation and failed in dependencies; its exact original types.json/stdout remain. types-continued.json adds the existing src/middleware/auth.ts root with unchanged tsconfig options and passes. No source workaround or whole-application build was used.

No schema migration, assetStorage configuration, production credentials, VersionId, CI, commit or deployment was added by this service step. HTTP route/controller integration and browser handoff are separate evidence.
