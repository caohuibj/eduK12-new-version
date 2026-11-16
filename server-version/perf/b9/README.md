# B9 readiness decision (integration pending)

This module supplies only a fail-closed readiness decision, not a runnable load
test. Merging it does not deploy or enable a safety guard on any runner. A runner must pass fresh, timestamped host samples and actual service and
in-flight state until READY or NOT_READY, and must refuse to launch on timeout,
probe failure, missing observations or stale data. Defaults are 900 MiB, CPU
below 15%, five continuous seconds and a 120 second deadline; 880 MiB is an
explicit alternative. Do not restart services or clear caches to meet the gate.

The existing burst and rate runners currently reside in the pressure host's
private directory and are not integrated by this change. Before use, add and
verify the hooks in both actual runners, including a first-request resource
sample, full 500 ms raw cgroup/RSS/CPU/swap/GC/event-loop samples, account
reservation and drain checks. A remote sampler must authenticate the production
host without moving its private key. Implement an immediate stop on the agreed
memory/swap/OOM signals. Preserve raw samples and account usage for each arm.
Until those pieces are delivered and verified this is **not** a readiness gate
for production testing, and no A/B comparison can be claimed from it.

Deployment handoff: integrate on the pressure host as a separate reviewed task,
run account-free dry runs for both burst and rate runners, validate stop/rollback
behavior and preserve the exact source commit. Never enable production load
merely because this library is merged.
