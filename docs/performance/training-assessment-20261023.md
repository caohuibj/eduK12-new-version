# Training assessment delivery and local work, 2026-10-23

Baseline main: `54ed73fdbef60b3b8d4998984c624c98c6bc99cb` (PR #342).
This round changes delivery and redundant work in Training's teacher selector and
learner assessment pages. It does not alter scientific definitions, scoring,
trial timing, frozen versions, authorization at use/publication, FINAL identities,
receipt replay or report disclosure. No production deployment is included.

The remaining opportunity was clear but narrower than the first entry round:
FINAL-only answers and cognitive trials already make zero per-answer API calls.
The new work therefore removes unused code, local storage transactions and
repeated path calculation rather than eliminating required durable submissions.

Changes:

- Cognitive registry metadata remains synchronous and exact-version only. Each
  task implementation downloads separately. The selected implementation must be
  prepared before **Start** enables; failure stays blocked with an explicit retry.
  Legacy/frame-timed adapters retain their original selection and prepare both
  implementations of that one task. No download or asynchronous boundary is
  inserted into an active trial. Results no longer import every task implementation.
- Text-only scales/forms bypass media implementation imports. Images and videos
  load their existing gates only when present. Code preparation itself stays
  blocked and retryable; existing asset, capability and required-viewing checks
  remain inside the gates. Learner material display is separate from the authoring
  material picker, including in shared Training/Survey components.
- An answer and its optional timing metadata commit in one IndexedDB transaction,
  with the existing writable/seal guard. Other provenance is merged, and failure
  rolls both writes back. Ordinary answer writes retain their existing signature
  and behavior. This is used by timed composite and whole-questionnaire scales.
- Situational navigation reuses one reachable trajectory and checks the already
  selected scenes. Completion and history projections are memoized across status
  rerenders; branching, online-channel completeness and research semantics remain
  unchanged. No answer or authority is cached across people or requests.
- The teacher questionnaire selector projects only display/ownership fields,
  without loading entire scale definitions. A fresh row proving private ownership
  needs no second ownership query. Governed entries, including one's own, and
  other owners retain `canUseScale`; add/publish keep their transaction checks.

The paired browser profile was Chromium 151, 1440×1000, 100 ms network latency,
500,000 bytes/s download, 250,000 bytes/s upload and 4× CPU throttling. Immutable
Vite production bundles were served with gzip over loopback TLS. Canonical product
names resolved only to loopback in the test browser. All accounts and responses
are synthetic in the independent `eduk12_preview` PostgreSQL database.

| Observed operation | Main frontend | Candidate | Interpretation |
| --- | ---: | ---: | --- |
| Cold composite assessment, ready | 2.698 s | 2.381 s | 11.7% lower median, n=2 each |
| Same cold assessment, JS transferred | 231,738 B | 218,659 B | 5.6% less, headers included |
| Answer + advance, local write transactions | 4 | 3 | 25% fewer for each of first seven questions |
| Last scale answer, local write transactions | 2 | 1 | Timing and answer commit together |
| Whole eight-answer interval, write transactions | 30 | 22 | 26.7% fewer; lifecycle timing writes remain |
| Scale submit to first form | 434 ms | 417 ms | n=2, no stable latency claim |
| Final form submit to report | 996 ms | 1,011 ms | No measured improvement |
| Cognitive runner open, additional JS | 88,184 B | 55,547 B | 37.0% less, n=1 each |
| Cognitive runner ready | 968 ms | 991 ms | No measured improvement in this small sample |
| Cognitive FINAL to report | 763 ms | 726 ms | n=1, no stable latency claim |
| Teacher resource function, actual SQL events | 7 | 4 | 42.9% fewer with one owned private scale |

Both scale/form cohorts completed all eight answers, a mid-assessment reload,
two form sections and final feedback. The browser verified eight persisted local
answers and timing records before submission and the two form values in the
report. Cognitive used the existing reaction `1.1.0` config, exact engine `1.0.0`,
scorer `1.1.0`, and its unchanged experience profile: three practice trials and
eight formal trials. Both full journeys completed and showed the report. Each
answer interval and each cognitive trial interval made zero APIs and downloaded
zero JS before and after the change.

A separate text-only V2 situational computation used extracted **actual** traversal
and completion functions and matched outputs. At 128 fully answered scenes, one
navigation projection rebuilt topology maps 259 times before and once after;
median computation was 14.650 ms versus 0.114 ms (five observations after three
warmups). This is a computation benchmark, not browser page latency or a clinical
protocol experiment. React rendering, network, DB and media are outside its scope.

CPU and memory were sampled, not inferred from byte size. For the two assessment
runs, backend process CPU was 1.517/1.204 s before and 1.136/1.199 s after over
approximately 28 s journeys. Peak backend working set was 340/353 MB versus
335/333 MB. These process-wide observations include readiness checks, authentication
and unrelated per-process activity. They do not prove production throughput or a
stable general CPU/RAM reduction. The isolated teacher service had three samples
per version; warm durations were 4.90/2.94 ms versus 3.72/1.65 ms, also too few for
a server-latency guarantee. The resource catalog inputs used by that function were
one owned published scale and the same course selector rows in both observations.

The initial cognitive probe used the earlier legacy-only build and stopped on a
correctly disabled start button, before creating a session. It remains recorded
as a failed preparation probe. The successful cognitive comparison uses a second
pair of builds with the **same** `VITE_COGNITIVE_MODULE_ENABLED=true` setting.
Default product settings are unchanged. A temporary synthetic publication actor
used the normal readiness/content-release service to install the existing config;
it has a discarded random password and was expired immediately after publication.
No reusable privileged login credential was configured.

Browser comparisons share the same backend. Learner backend routes are unchanged;
the teacher browser timing measures frontend delivery, not old versus new selector
SQL. The SQL comparison invokes the actual service against the isolated database
with count-only Prisma query events, including transaction events; no SQL text or
parameters are collected. Teacher baseline browser sample 2 is excluded from timing
comparison because its final phase may overlap candidate compilation; the original
record is retained. Login and reload controls did not show an improvement.

Affected tests/types/lint have one primary execution location: GitHub Actions.
Local builds and bounded real browser checks are reused with explicit unsigned,
reviewed provenance; no CI re-execution of those builds is claimed. The exact
scope also retains current CodeQL and authenticated reuse of unchanged official
HIGH/CRITICAL dependency audits. No full platform suite, production image build,
DB migration/restore, media worker test or repeated load test is selected.

Detailed timings, CPU/memory observations, sampling limits and raw file hashes:
[training-assessment-20261023.json](./training-assessment-20261023.json).
Raw browser reports, screenshots and reproducible local harnesses are retained in
`/workspace/eduk12-node-20261023/assessment-performance-20261023/`; synthetic login
and session material stays in the node's private directory and is not committed.
The node has no tool-provided external preview URL. `training.localhost:5173`
and the measurement HTTPS ports are internal node entry points, not addresses
that can be opened through the user's Mac localhost.
