# StoredAsset migration

New uploads use the `StoredAsset` catalog and private, short-lived application
URLs. The catalog records the object key, provider, MIME type, byte length,
SHA-256 digest, owner, scope, and references. Local development uses the
filesystem provider; COS/S3 is an explicit future deployment choice and its
credentials come only from environment variables.

## Migration window

1. Stop application writes and make a database backup.
2. Set `ASSET_MIGRATION_CONFIRMATION=MAINTENANCE`.
3. Run `node server-version/scripts/assets/migrate-assets.mjs`.
4. Check the migration report, asset counts, and SHA-256 values. Repeat is
   safe for already-linked rows.
5. Deploy the asset-aware readers and verify private/course/public-checkin
   access separately.
6. Only after those checks, set `ASSET_MIGRATION_COMPLETE=true`. Backend
   `/uploads/*` then returns `410 Gone`; it is not a public fallback.

The local migration copies files below `UPLOAD_DIR` and skips remote COS
objects. A production run requires a separately reviewed provider copy
adapter and an isolated rollback copy of the original objects. Do not point
the local script at a production database or production storage.

Public check-in assets are scoped to their check-in and require both the
short-lived asset signature and `X-Checkin-Token` at delivery. Anonymous
submissions may contain only asset IDs issued for that same check-in.
