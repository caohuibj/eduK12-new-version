# eduK12 v1.0.0 Release Notes

## Included

This release candidate includes the existing eduK12 platform and the first Cognitive Core release:

- Reaction
- Memory Digit Span Forward
- Stroop
- Participant results
- Cognitive history

The flow is assignment → session → runner → append-only trials → server scoring → result → history.

## Data and versioning

- Cognitive trial payloads are encrypted at rest.
- Scoring is server authoritative.
- `engineVersion`, `scoringVersion` and published config versions are frozen for released sessions.
- Database migrations must run forward with `prisma migrate deploy` before application startup.

## Known limitations

- The reference layer is simulated (`sim-k12-v0.1`) and is for product-flow validation only.
- The release does not claim formal K12 norms, clinical interpretation or a composite cognitive score.
- The production environment must provide `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `DATA_PSEUDONYM_KEY`, `DATABASE_URL` and `REDIS_URL`.

## Rollback summary

Stop the rollout, restore the previous application image, evaluate database impact, and restore the database only when necessary. Do not patch production records directly.
