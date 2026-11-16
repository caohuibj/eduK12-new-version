# Worker allocator experiment

`server-version/docker-compose.worker-arena-experiment.yml` is an optional
overlay for the production services `worker`, `report-worker-2` and
`report-worker-3`. It changes only `MALLOC_ARENA_MAX` to `2`. It is not part of
the default Compose invocation and does not change either backend's settings.
The extra report services are defined by the production profile, not by the
base Compose file: validate the overlay against the actual production profile
before use. Verify all three resulting service definitions and the unchanged
backend definitions without exposing environment secrets.

This is an experiment, not a deployment instruction or a claim of improvement.
Before any switch, verify that the running worker processes use glibc malloc and
have no `LD_PRELOAD` or alternate allocator overriding it. Capture the exact
current profile, image IDs, health and rollback procedure. Apply only with the
required deployment authorization and a proven rollback. Restarting workers can
interrupt jobs; use the existing drain and service readiness procedures.

Compare one baseline and one treatment under the same readiness conditions and
workload. Preserve raw samples: worker RSS and cgroup memory.current plus
memory.stat anon/file/slab, external memory, GC, CPU, report queue and completion
latency, host MemAvailable and swap, START throughput and time below 700 MiB.
Record both baseline swap and its change, and OOM events. Stop on an OOM, new
swap pressure, missing safety telemetry or a meaningful unexplained regression.
Do not infer that cgroup file cache is anonymous memory or attribute a decrease
to glibc without memory composition evidence. Retain the change only when the
measurement supports it and report workload and sample limitations.

Rollback removes this overlay and restores the exact previously captured worker
profile, then recreates only affected workers using the established release
procedure. Confirm their image, environment, health and report processing.
