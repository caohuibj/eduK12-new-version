# START memory retry hint

`ASSESSMENT_HOST_MEMORY_RETRY_AFTER_SECONDS` controls the Retry-After hint on
new START requests rejected by the host-memory guard. It accepts integer seconds
from 1 to 60 and defaults to 10; invalid values fail startup. CPU rejections
continue to use `ASSESSMENT_HOST_CPU_RETRY_AFTER_SECONDS`. Other errors retain
their existing behavior, and neither resource threshold nor admission behavior
changes. The running backend containers must receive the variable explicitly via
their deployment profile; simply setting it on the host does not inject it into
an existing container.

This change does not establish an optimal value. First compare the current CPU
hint against a single alternative with identical readiness and workload, then
separately compare memory hints. Record start attempts, rejection reason, Retry-
After, elapsed request time, 5-attempt/60-second budget exits, throughput,
latency, memory, swap and OOM signals. A shorter hint cannot ensure that the
fifth attempt fits the budget. Preserve the original profile and revert to an
unset variable (10 seconds) if the experiment causes an unexplained regression.
Apply any deployment change only with the existing release procedure and
authorization; an experiment is not performed by adding this setting to source.
