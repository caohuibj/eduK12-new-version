# eduK12 v1.0.0 Deployment Checklist

## Before deployment

- [ ] `dev` has passed CI and repository review.
- [ ] Release candidate regression report is approved.
- [ ] Backend and frontend images are built from the reviewed commit.
- [ ] `JWT_SECRET` is at least 32 characters and unique to production.
- [ ] `DATA_ENCRYPTION_KEY` and `DATA_PSEUDONYM_KEY` are 64-character hex keys.
- [ ] `DATABASE_URL` and `REDIS_URL` point to production services.
- [ ] Cognitive flags are enabled consistently in backend and frontend build configuration.
- [ ] Database backup is available and restore ownership is clear.
- [ ] Migration list has been reviewed; no manual production data patch is planned.

## Deployment

1. Build and publish the reviewed backend/frontend images.
2. Run `docker compose --profile ops run --rm migrate`.
3. Start the application services and wait for all health checks.
4. Run the login → assignment → Reaction/Memory/Stroop result → history smoke flow.
5. Record the deployed commit and image identifiers.

## Rollback

1. Stop the rollout.
2. Restore the previous application image.
3. Evaluate whether the database migration is backward-compatible.
4. Restore the database only if the approved recovery procedure requires it.
5. Investigate before attempting another rollout.
