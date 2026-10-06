# Database and server configuration backups

Standalone host maintenance; separate from application deployment and from the
observe-only monitor installer. No business/Compose/DB schema changes and no COS
delete operation. Uses the deployed exact-revision encrypted DB backup/restore
scripts unchanged. A source change to those scripts retains its existing CI gates.

Buckets: `ptool-videos-edu-1393949445` is the media source; every new host backup
writes only to private/versioned `eduk12-backups-1393949445`, `host-backups/v1/`.
Existing `backups/` objects in the media bucket are not deleted or rewritten.
COS resource packages are billing offsets by region/storage class, not bucket quotas.

Daily 03:20 Asia/Tokyo (02:20 Beijing), plus up to 120 seconds jitter; persistent
timer catches a missed run. First operator run verifies the deployed component.
Every run performs transactional pg_dump, existing AES-GCM envelope validation,
COS upload with an immutable VersionId, download/hash/decryption verification and
an actual restore into a private PostgreSQL 16 container. No production database
is a permitted restore target. Restore SQL checks applied/failed migrations/users.
The disposable PostgreSQL has no network, no published ports, 384 MiB/0.5 CPU;
transport has read-only root, nonroot UID, no Docker socket, 256 MiB/0.3 CPU.
Each helper is labelled with its UUID. Cleanup refuses foreign containers and
named volumes and removes only this helper plus its anonymous restore volume.

Server configuration covers current release metadata, Nginx/SSH configuration,
Compose operator files, protected application environment and reviewed maintenance
units/configs. The temporary archive is root-only, encrypted before transport and
removed immediately; downloaded ciphertext is authenticated and checked. This is
not a full server disk image, Redis/queue snapshot or complete attachment restore.
The independent master backup key is excluded; retain it separately. Tencent Cloud
machine images remain a separate platform recovery mechanism.

Both buckets must differ, match the reviewed exact names/Beijing region, and the
running application's source bucket must still match. Refuse public ACL/policy,
missing versioning, overlapping unreviewed expiry lifecycle rules, unknown remote
repository without local authenticated catalog and key rotation without migration.
Secret values reach transport only on stdin. Status/journal contain counts/codes,
not environment values, content or business paths. Private failure logs are bounded
to the last command. Root's Docker authority is root-equivalent; container limits
do not make the host launcher an unprivileged service.

New local copies retain the latest two verified cloud-backed/restored points.
Rotation verifies hashes, exact UUID paths and allowed filenames; failures retain
all prior copies. Existing release backups are outside this rotation. At least
6 GiB free disk required before starting; DB envelope capped at 512 MiB and config
archive at 32 MiB. The host process is bounded to 1536 MiB/0.5 CPU/40 minutes.
Verify future DB growth against this budget; limits stop rather than delete backups.

Cloud retention remains **plan_only**: daily 30 days, weekly 12 weeks, monthly 12
months, permanent initial baseline and at least two recovery points. New DB points
record the authenticated latest attachment inventory when available. Pending
attachment scans are reported, and even a linked inventory does not claim a
database-reference-consistent joint restore. Actual remote cleanup and joint
recovery acceptance require separate validated rollout; no bucket-wide expiration.

Install reviewed same-SHA files: `sudo install-backup.sh <40-char-sha>`, then first
`sudo systemctl start eduk12-database-backup.service`; inspect root-private status
and container/volume cleanup before enabling the timer. `--enable` is available
after exact maintenance CI and the first bounded production run pass. Pause with
`systemctl disable --now eduk12-database-backup.timer`; a running service must be
stopped separately and its cleanup checked. Keep catalog/key/copies when rolling
back code; do not recreate an empty repository over existing remote objects.
