> **历史归档 / DO NOT USE**：仅供追溯，禁止用于当前 release。当前唯一生产入口：[DEPLOYMENT-CHECKLIST](../../../server-version/DEPLOYMENT-CHECKLIST.md)。

# eduK12 Production Candidate Deployment Checklist

> **DEPRECATED / DO NOT USE**
>
> This historical checklist is retained for traceability only. Its deployment
> sequence and check-in-only token wording are no longer valid and must not be
> used for production. The current Compose release checklist is
> [`server-version/DEPLOYMENT-CHECKLIST.md`](../../../server-version/DEPLOYMENT-CHECKLIST.md),
> which requires draining/stopping old writers before migration, backfilling
> questionnaire/check-in/composite/cognitive tokens, validating all eight
> constraints, and completing the public-workflow smoke checks.

## Before deployment

- [ ] The release candidate is an exact reviewed commit or tag on main.
- [ ] The PR review records the exact SHA and the local/backup verification evidence.
- [ ] Classroom Socket security gate passes: JWT teacher/bigscreen auth, server-derived
      classroom/question/session context, classroom-bound anonymous resume token,
      trusted-proxy-aware IP limiting, passive manager revocation, reconnect-safe
      student sessions, cross-class rejection, and no unauthorized database writes or
      broadcasts.
- [ ] Classroom HTTP IDOR checks pass for detail, QR code, questions, stats and export.
- [ ] Public classroom-code checks pass: joinable status only, minimal response, IP/code
      rate limits, uniform invalid/closed response, and Redis-unavailable fail-closed.
- [ ] Production log review contains no student answers, question content, broadcast
      payloads, Redis URLs, passwords or unnecessary socket identity data.
- [ ] Backend CI evidence includes dependency installation, Prisma generate, migration,
      seed, build and full regression.
- [ ] Frontend CI evidence includes lint, Classroom/Cognitive typecheck, tests and build.
- [ ] Docker evidence includes production compose and monitoring config validation plus
      backend/frontend image builds.
- [ ] Staging smoke passes: health, database ready, login, classroom creation, teacher
      control, anonymous code join, student submission, close and history stats.
- [ ] Cognitive Round 2 remains DRAFT, recommendedForCreate=false and feature-flag disabled.
- [ ] JWT_SECRET is at least 32 characters and unique to production.
- [ ] DATA_ENCRYPTION_KEY and DATA_PSEUDONYM_KEY are 64-character hex keys when required.
- [ ] DATABASE_URL and REDIS_URL point to production services.
- [ ] Rotate and revoke every database, JWT, COS/object-storage and other
      credential that has ever appeared in Git history, logs or local handoff
      artifacts; record the rotation owner and timestamp.
- [ ] `ASSET_MIGRATION_COMPLETE=true` is explicitly set in the production
      secret/config store; startup must fail closed when it is absent.
- [ ] Database backup is available and restore ownership is clear.
- [ ] Migration list has been reviewed; no manual production data patch is planned.
- [ ] TLS termination redirects HTTP to HTTPS, sends HSTS, sets Secure cookies,
      and exposes only the approved production CORS origins; verify these from
      outside the cluster.

## Deployment

1. Build and publish backend/frontend images from the reviewed main SHA.
2. Create/verify the database backup and record its restore-test evidence.
3. Run the guarded migration service and record its output:

   ~~~sh
   docker compose --profile ops run --rm migrate
   ~~~

4. Run the explicit check-in token backfill and require `remaining=0`:

   ~~~sh
   docker compose --profile ops run --rm checkin-token-backfill
   ~~~

5. Verify both old and new check-in links, validate the
   `checkin_access_tokens_token_must_be_null` constraint after the backfill,
   then set `ASSET_MIGRATION_COMPLETE=true` before starting the application.
   Confirm legacy `/uploads/*` paths return 410/denied and no plaintext token
   remains.
6. Run the approved seed procedure against the same database and record the result.
7. Start the application services and wait for both health and database-ready checks.
8. Run the staging smoke flow again against the deployed candidate.
9. Record the deployed exact SHA, image digests, migration result and operator.
10. Promote only after the release approver signs this checklist.

## Rollback

1. Stop the rollout and preserve logs plus the deployed SHA.
2. Restore the previous approved application image/tag.
3. Evaluate whether the migration is backward-compatible.
4. Restore the database only if the approved recovery procedure requires it.
5. Re-run health, readiness and the classroom security smoke flow before reopening traffic.
6. Investigate before attempting another rollout.
