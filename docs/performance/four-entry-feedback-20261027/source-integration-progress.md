# Source producer integration candidate

Integration base 1b3cdd171361f63f348069717294671277300541; source producer 8fcfadcadeb7fd09fd8e453aa6eb16d87d53e686. Normal merge preserves both histories. Root independently read producer service/source/routes/distribution/issuer, management catalog/CAS and original PG reporters.

Resolved the only contract conflict retaining exact distribution proof, BUNDLE-only empty measurement units, actual nonempty Form runtime, and completion-only Form disclosure. New-use and NEW_START check the pinned original content-distribution grant in their own transaction. Frozen continuation does not apply this new-admission check. Identity reads bind distribution actor to original creator and actual runtime owner.

Existing shared FINAL/report consumers now route SCHOOL/TEACHER private and explicitly bound PLATFORM reports to the existing exact education scope validator, instead of hard-rejecting every non-Training report. This is not participant authorization: existing disclosure and participant-exclusion checks remain; no raw metric fallback or scorer replay.

## Actual checks

- Four directly affected source/authority/execution contract files: 39 PASS, exit 0. Includes new distribution-withdrawal rejection and actor/owner binding; mock contracts, not PostgreSQL concurrency.
- Two affected FINAL/report consumer files: 40 PASS, exit 0. Six new parameter cases verify exact validator invocation and rejection propagation. These route tests mock the validator; earlier separate scope tests and future actual integration evidence are not replaced.
- Backend tsc --noEmit: r1 exit 0 before final report routing/test additions; r2 exit 0 after them. Empty logs alone do not prove exit status: these statuses were observed from the runner and recorded here, not signed CI.
- git diff --check and staged diff check: exit 0.
- Parent Node24.22.1. No fresh PG/browser/build/CI for this integration. Child PG16.15 evidence preserves all original failures/filtered inputs and is not called a final merged-tree full pass.

## Still open, not waived

1. Standard-combination/privateVersion source mapping and shared START/FINAL consumers: original producer copied Training-bound markers. Separate source task is correcting these; ordinary four-family producer tests are not evidence for them.
2. Actual four-entry new START, recovery, FINAL/replay and feedback browser journeys, including emergency/report policy, are pending.
3. Exact original-issuer withdrawal/user-freeze/content-grant lock-order review and actual concurrency remain pending; the existing grant-only race does not prove all governance paths.
4. Teacher runtime and feedback branch integration is pending. No formal CI qualification, activation, merge or deployment.
