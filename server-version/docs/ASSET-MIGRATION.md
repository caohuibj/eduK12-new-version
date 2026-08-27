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

Teacher-authored check-in media keep their `COURSE` (or `PRIVATE`) scope and
are publicly deliverable only when the check-in has an exact
`AssetReference`, together with a short-lived signature and
`X-Checkin-Token`. Anonymous participant uploads use `PUBLIC_CHECKIN` scope,
have a `CheckinUploadSession` staging reference bound to the server-issued
session ID and HMAC capability, are limited to nine images per session, and
are promoted to the `CheckinSubmission` reference inside the submit
transaction. A shared check-in token cannot read staged or submitted
participant media; staged preview requests must also send
`X-Checkin-Session-Id` and `X-Checkin-Session-Capability`. Upload and submit
transitions for one session use the same database advisory lock; once a
session is submitted, further uploads are rejected. Abandoned staging
references and unreferenced blobs are eligible for the 24-hour cleanup path.
