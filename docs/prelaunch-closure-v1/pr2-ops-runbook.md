# PR2 operations runbook — Node 24 / PostgreSQL 16 / bounded worker

## Supported baseline

- Backend/frontend build runtime: Node 24.21.0.
- Database target: PostgreSQL 16.15.
- Redis target: Redis 7.4.11.
- Frontend runtime: Nginx 1.31.6.
- Compose uses a new `postgres16_data` named volume. It must not mount a PostgreSQL 14 data directory.

These versions define the supported prelaunch baseline for this repository. Pool sizes, admission limits, export/video concurrency, heap and database memory values remain measurement-required on the actual 4C4G host.

## PostgreSQL 14 → 16 upgrade

A PostgreSQL major upgrade is a logical backup/restore operation for this deployment. Do not point PostgreSQL 16 at the old PostgreSQL 14 volume.

1. Drain ingress and stop backend/worker/frontend.
2. Verify the existing PostgreSQL 14 instance is healthy.
3. Run and verify an encrypted production backup using the existing backup entry points.
4. Preserve the old PostgreSQL 14 volume as rollback material.
5. Start PostgreSQL 16 with the new `postgres16_data` volume.
6. Restore the verified logical backup into PostgreSQL 16.
7. Run `npm run db:migrate:guarded` / the Compose `migrate` ops job.
8. Run token backfill if required by the release baseline.
9. Run `npm run db:release:preflight` / the Compose `release-preflight` job.
10. Start backend and worker from the same image SHA, then frontend.
11. Run public/authenticated smoke checks before restoring ingress.

The CI rehearsal `server-version/e2e/ops-pg16-upgrade-rehearsal.mjs` creates independent PG14 and PG16 containers, populates PG14, dumps it, restores into PG16, runs current migrations/preflight, and compares key row/migration counts.

## Worker/export recovery

Scale and Questionnaire file exports are worker-only. The API persists an `export_batches` intent and PROCESSING artifacts before queue delivery. The client keeps a request key for response-loss retry. Redis/Bull is a delivery mechanism, not the source of truth.

Workers claim a monotonically increasing generation. Files are produced under generation-scoped names and artifact metadata becomes READY only in the fenced publication transaction. A stale worker cannot publish over a newer generation. Non-final Bull failures remain PROCESSING; only the final attempt becomes FAILED. Reconciliation re-enqueues durable PROCESSING batches.

Expired cleanup is paged and terminal-only. It never deletes files for an active PROCESSING batch.

## Worker shutdown

On SIGTERM/SIGINT the worker:

1. pauses local Bull consumers;
2. gives active bounded work a drain window;
3. sends SIGTERM to registered FFmpeg subprocesses and waits for settlement;
4. escalates to SIGKILL only within the bounded shutdown window;
5. closes Bull connections;
6. disconnects Prisma.

Shutdown-cancelled video work is returned to retry/recovery state rather than being recorded as a user-visible processing failure.

## Configuration

Worker/media/export knobs are validated at process startup and logged without secrets:

- `VIDEO_CONCURRENCY`, `VIDEO_TIMEOUT`
- `VIDEO_RESOLUTION`, `VIDEO_PRESET`, `VIDEO_CRF`, `VIDEO_BITRATE`, `VIDEO_AUDIO_BITRATE`
- `IMAGE_CONCURRENCY`, `IMAGE_TIMEOUT`
- `EXPORT_CONCURRENCY`, `EXPORT_TIMEOUT`
- `WORKER_SHUTDOWN_TIMEOUT_SECONDS`

Invalid values fail startup. Compose and `.env.example` expose the same knobs.
