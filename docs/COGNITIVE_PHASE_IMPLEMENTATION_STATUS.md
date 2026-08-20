# Cognitive Phase 1 / Phase 2 Implementation Status

## Phase 1 - Stability and Governance

Implemented:

- [x] Config schema validation foundation
- [x] Config validation enforcement in seed, Assignment publish, Session start, and Completion
- [x] Version-keyed scoring engine dispatch for existing scorers
- [x] Unified quality rules foundation
- [x] Reaction and Stroop scorers consume shared RT quality rules without changing score thresholds
- [x] Cognitive config bootstrap extraction from `prisma/seed.ts`
- [x] Seed no longer contains default administrator credentials or logs passwords

## Phase 2 - Platform Capability

Implemented:

- [x] ParticipantIdentity table and migration backfill
- [x] New sessions create and use a stable identity boundary
- [x] Student history queries use ParticipantIdentity instead of direct user filtering
- [x] Cursor pagination for cognitive history with opaque, versioned ordering tokens
- [x] Public backend capability API at `GET /api/capabilities`
- [x] Frontend Cognitive routes consume the backend capability instead of a separate build-time flag
- [x] Opt-in end-to-end workflow integration test covering Assignment -> Session -> Trials -> Score -> Report -> History

Compatibility:

- Existing page-number history pagination remains available for older clients.
- Cursor mode uses `pagination=cursor` and returns `nextCursor` plus `hasMore`.
- Integration suites remain opt-in through `COGNITIVE_INTEGRATION_DB_URL`.

## Design Principle

The refactor preserves existing assessment behavior while introducing governance layers incrementally. Identity isolation is additive: the existing userId is retained for authorization and historical SetNull semantics while ParticipantIdentity becomes the canonical cognitive-data boundary.
