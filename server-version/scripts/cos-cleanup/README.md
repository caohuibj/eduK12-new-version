# Protected COS version cleanup

Independent maintenance component. Default `mode=plan_only`, timer disabled at
installation. This component has an actual `deleteObject(Key, VersionId)` executor;
it never uses an unversioned delete, deletes media originals, changes bucket
lifecycle rules or treats unknown objects as garbage. Only reviewed exact paths
under `attachments/v1/` and `host-backups/v1/` in the dedicated private Beijing
bucket can be targets. Other prefixes and old media-bucket backups remain untouched.

The planner authenticates local host/attachment catalogs and every historical
remote catalog pointer version, downloads/decrypts the indexed historical catalogs
and manifests, and reconstructs version-specific dependencies. Authenticated blob
sidecars provide ownership for orphan content. Unknown recovery metadata, corrupt
indices, incomplete pagination or resource limits fail closed. Unknown payload
versions stay protected. Metadata scans remain bounded to 512 MiB per run; catalogs
are authenticated one at a time and only their version/reference graph is retained,
keeping the existing 256 MiB helper memory limit. Existing installations must update
`maxScanBytes` explicitly after reviewed validation. Budget exhaustion still blocks
planning and joint recovery, without deleting or ignoring historical metadata.
Retention: 48 hourly hours, 30 daily days, 12 weekly weeks,
12 monthly months, permanent initial baseline, protected points and at least two
recovery points. Retained DB points pin their attached manifests. Currently retained
snapshots outside the local rotating index are rehydrated before index retirement.

Candidates must remain eligible in repeated observations for at least 24 hours;
an observation gap over 36 hours resets the clock. Each run has at most 20 exact
version deletions / 512 MiB, including replaced index versions. Host points retire
as complete three-object groups. Pointer/catalog pairs and every historical
dependency of a payload must fit the transaction; otherwise remove eligible old
metadata first and leave the payload. Snapshot and catalog dependencies are deleted
before payloads. Recently superseded current indices can only retire as part of
a matured payload/manifest transaction after two detached replacement checkpoints
have been uploaded, downloaded and authenticated. Local retention of old release
backups and unrelated server caches remains outside this component.

Root launcher holds cleanup -> DB writer -> attachment writer flocks for the whole
run. It uses immutable backend image only as Node/COS SDK runtime. No business
volumes, Docker socket or key files are mounted. Helper root has DAC_OVERRIDE only
to access UID 1000 catalogs inside explicit state mounts; other capabilities are
dropped, root filesystem is read-only, no new privileges, 256 MiB / 0.3 CPU.
Host root Docker authority remains root-equivalent. Secrets arrive on stdin;
public output contains counts/error codes only. The helper gets only the proof file,
not its sibling delete.env. Plans use read-only source-catalog mounts.

Execution additionally requires a separate root-0600 `delete.env` COS identity
different from the application identity, scoped `cos:DeleteObject` to these two
backup prefixes, and the component's reviewed code installed into BOTH backup
launchers. Both writers authenticate the durable journal and stop reusing/remaking
data while a transaction is pending. Do not bypass the root launcher locks.

`/etc/eduk12-cos-cleanup/recovery-proof.json` must be HMAC authenticated with the
independent backup key. Schema: `schema=1`, dedicated `bucket`, `region=ap-beijing`,
`status=VERIFIED`, UTC `at`, `checks={databaseRestore:true,attachmentDecrypt:true,
databaseReferences:true}`, and `bindings=[{hostPointId,databaseVersionId,
attachmentSnapshotId,snapshotVersionId}]` for EVERY retained host point. This is an
acceptance record from a real isolated database+attachment reference recovery;
the independent `recovery.py run` task creates it only after actual isolated DB
restore, scanning all public table rows (including JSON snapshots) for managed
asset IDs/COS keys/uploads URLs, and decrypting/verifying the referenced encrypted
attachment versions. Deleted rows/assets are excluded; external domains are counted
and explicitly outside coverage. Missing references or unknown asset metadata block
proof issuance. Plaintext exports remain root-private and are removed on exit.
The restore uses the existing pinned backup/restore scripts unchanged, a private
network-none PostgreSQL container, and ownership-checked anonymous-volume cleanup.
Maximum DB download/reference export 512 MiB, asset export 16 MiB, 6 GiB disk
headroom; Node helper 256 MiB/0.3 CPU; SQL timeout 120 seconds.

The recovery timer is installed disabled; after reviewed deployment enable it with
`systemctl enable --now eduk12-cos-recovery.timer`. It runs hourly at :40. New DB
versions require a new real restore and reference/decrypt check. Previously verified
immutable bindings may be reused only if DB and snapshot versions/hashes, every
blob receipt, key identity and the verifier's source hash remain identical; exact
remote versions are checked again. This avoids repeatedly restoring a year of
unchanged retained points. Missing/older-than-36-hour proof or missing/stale scans
blocks cleanup. Pending cleanup journals prevent proof replacement, preserving
transaction input hashes; lock contention skips instead of racing writers. A fresh
proof alone never changes `mode`, credentials, retention or deletion authorization.

Before any DELETE, a sealed/fsynced journal records the exact versions, input hashes,
configuration, protected receipts and desired catalogs. Detach local indices,
publish/decrypt two replacement cloud catalogs, then execute explicit version
deletes with head/hash checks and confirm absence. Relist BOTH namespaces before
each deletion: unexpected writes/disappearance or changed local files stop the
transaction. Interrupted successful deletes and checkpoint uploads are adopted
only with their durable exact-version/hash intents; deletion is idempotent. Retain
encrypted checkpoint staging until COMPLETE. There is no undo for a permanent
version deletion. Stop the timer for pause; a pending transaction still requires
resume or audited repair, not journal removal, source rollback or wholesale prune.

Install: `sudo bash install.sh <40-char-reviewed-SHA>`; optional `--enable-plan`
starts the hourly `:50` timer with 0-30 second jitter. First use production plan-only
after exact maintenance CI and bounded read-only verification. Never switch mode
to execute until the real recovery proof, independent identity and guarded writers
have been validated. Preserve state, proofs and original key through code rollback.

CI is maintenance only: routing, reference/retention and version-API tests, filesystem
transaction/crash recovery, Python isolation/ownership/lock guards and unit syntax.
SDK fakes are not evidence of live COS deletion. A separate operator synthetic
unique-prefix COS probe runs the same version-delete adapter, verifies an unrelated
version survives, no delete marker is created and owned test versions are absent;
production backup data is never used as a deletion fixture.

Optional monitoring: configure host-ops `cos_cleanup_status` as
`/var/lib/eduk12-cos-cleanup/status.json` after installing the plan timer. Failed
or pending transactions produce a critical finding; status older than three hours
produces a warning. A fresh, safely blocked plan is not a cleanup failure. This PR
does not change production monitoring configuration.

Optional one-time operator activation: `/etc/eduk12-cos-cleanup/activation-request.json`
is a private root-0600 HMAC-signed request, created only after human authorization
and a live dedicated-identity synthetic version-delete probe. It binds the current
configuration hash, dedicated credentials fingerprint, reviewed verifier/executor
and both writer source hashes. Requests expire within 48 hours. Without a request
recovery never changes cleanup mode. With it, after proof issuance it re-runs ALL
production readiness gates under both writer locks; only a fully ready result can
atomically switch to execute and consume the request, preserving a signed activation
record in `/var/lib/eduk12-cos-recovery`. This switch does not bypass the executor's
fresh proof, quarantine, references, checkpoints, batch limits or exact VersionId
checks. Changed code/config/identity, expired requests and pending journals block
activation. Do not create unsigned requests or set `deleteProbeVerified` without a
live probe of that exact identity. Source/config pinning detects changes while a
long initial baseline is pending.

Optional monitor `cos_recovery_status=/var/lib/eduk12-cos-recovery/status.json`: failed acceptance is critical, stale tasks over three hours warn, pending baseline/lock waits remain normal. Enable this only after the reviewed task has created its first status file. Activation requests also bind the immutable runtime image digest.
