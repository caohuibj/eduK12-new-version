# Four scoped frontend P2 fixes, three commits

Base: `92e398025fb6fbefe1b051520cf5507295173859`. Independent local candidate;
no #447 CI controls, other pending PRs, backend/CLI, dependencies or permissions.

- CognitiveAssignmentEntry keys its existing state by assignmentId. Another
  task loads its own instructions/ledger/start state; a departed start response
  cannot publish a ledger, error or navigation. Already issued server requests
  are not cancelled. The existing same-task reconciliation API and ledger-before-
  navigation order remain unchanged.
- useCognitiveSession reuses its existing lease cancellation check before an
  error response and in the GET catch. An old read failure cannot replace the
  current completed session; current errors still display normally.
- SchoolCompositeRunner adds one existing-identity check between consent/accept
  and START. Consent resolving after unmount cannot issue the old START. The
  mounted positive path and already issued requests retain their original flow.
- CompositeReportPage keys its state by pathname, including attempt and entry
  surface. New attempts read their own stored recovery proof and reset the prior
  report/input/generation state. Same-path renders retain current local state;
  the existing load epoch/abort cleanup invalidates departed reads. API/DTO,
  polling, snapshot selection and recovery protocol are unchanged.

Eight focused synthetic cases first produced **6 failed / 2 passed**, with20
filtered. The original failures are retained locally. After the small fixes,
those eight plus four existing direct consumers produced **12 passed / 38
filtered**, exit0. The four consumers cover paused/server-authorized Cognitive
entry behavior and ordinary/missing-proof public report reads. Filtered cases
are not reported as passed. Tests use mocked APIs and synthetic storage only;
no real START, trial, FINAL, database or production incident is claimed.

Changed-file lint exit0, retaining four warnings in unchanged hook bodies.
One final app TypeScript check on Node24.21.0 exited0 in about45s, with recorded
source/test/config/lock/tool inputs unchanged. The app config includes all src,
including the changed Cognitive code/tests; its Cognitive subset was not run
again. No full test suite, browser, build, CI, APPROVE, merge or deployment.

Raw reporters, original failure history and environment/input records remain
local. This description contains no workspace metadata, credentials, real
answers or personal data. No new framework, global request layer, confirmation
dialog, admission rule or authentication is introduced.
