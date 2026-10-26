# Current governance resource probe

This small diagnostic freezes a new series on the integrated candidate. It does
not replace historical d01/31d9 evidence or compare different workloads as a
performance gain. It never provisions, migrates, deletes, installs, uploads or
connects to a default database.

Prepare an **owned disposable synthetic** PostgreSQL database at
`127.0.0.1:55433/survey_governance_probe_test`, apply the exact current migrations,
and explicitly initialize a new restricted runtime login using the exact
`runtime-role-defaults.sql` / table policy. Supply that restricted login as
`DATABASE_URL`; no owner credentials are required by the harness. Provide the
task's dedicated Redis at `127.0.0.1:56380/2`. A loopback URL is not evidence of
ownership: the operator must verify it is the task's local container, not a
tunnel. These exact local targets and `NODE_ENV=test` are mandatory.

Set `SURVEY_GOVERNANCE_PROBE_ACK=owned-local-synthetic-only` and a new absolute
`PROBE_OUTPUT_DIR`, then `node run.mjs` using the repository's Node version.
Dependencies/generated Prisma client must already match the lock. The harness
requires backend product paths to be clean against HEAD and records source tree,
lock and harness hashes. It generates encryption/session keys only in memory.
All rows are newly created synthetic fixtures and retained. Later invocations
cannot decrypt previous fixtures; no old artifact or baseline is replaced.

Fixture creation uses actual author/reviewer release, governance approval plus
three trial cases, explicit Survey entry policy, exact grants and wave freeze.
Each group gets a fresh API process: ordinary 20-choice Form; that Form plus
native staged SJT V2; whole Form/native package with one field and one metric
report. Each process runs one first-collection sample and one warm sample of
the same publication. There is no hidden warm-up. Database buffers may already
be warm after setup, so `PROCESS_FIRST` is not called a cold database benchmark.

Real loopback requests exercise participant bearer/consent, task delivery,
checkpoint, native child submit/read recovery, parent FINAL/replay and feedback.
The package group reads the report through the actual researcher router with a
synthetically minted session; current domain, token version, MFA timestamp,
researcher qualification and project authority checks remain active. This is
not a real login/MFA or browser interaction. Public routes use the same Origin
and CSRF exemption as the application; no `req.user` injection is used.

Per request: elapsed/process CPU, sampled and process lifetime peak RSS, SQL
event classes/duration, actual DB protocol bytes and HTTP body bytes. The CPU
includes the local HTTP driver in the same process. SQL event duration is not
DB server CPU. Lock intervals are transaction upper bounds including waits,
not exact individual row-lock hold time. Relation allocation deltas include
heap/index/TOAST page effects and may be zero when a new row fits an existing
page; logical stored cipher sizes are separately recorded. No new index is
justified by this probe.

Two samples per group are correctness/resource probes, not averages, pressure,
capacity, public-network latency or complete platform baselines. Test mode
skips ordinary Redis/IP limiting; full production middleware is not included.
No independent post-report scoring occurs. Exact receipt replay and persisted
FINAL hash/count, child recovery and report metric are asserted.

Outputs contain only measurements, protocol/source hashes and schema names.
They contain no URLs, keys, headers, bearer credentials, answers or reports.
Partial request evidence is retained on failure; the launcher never retries.
Treat process stdout/stderr as private diagnostic output and review it before
sharing. No formal CI admission or deployment qualification is conferred.
