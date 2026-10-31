# Mutation completion isolation found during final444 review

The original444 load sequence guards GET requests that started before resource switches. A save operation completing after A→B previously started a new A reload with a newer sequence; its late error or finally could also overwrite B notice/busy state. Two new synthetic counterexamples actually failed on444 logic. The failed reporter, exit1 and three filtered cases remain unchanged.

The fix adds a resource-generation ref keyed only by basePath. On navigation/unmount it invalidates obsolete operation continuations, notices, parent notification and finally. A new resource can save while the old write settles. Same-resource refreshKey does not invalidate an ongoing save, so normal completion and onChange remain intact. The original durable save operation is neither cancelled nor retried. No API, authorization or backend change.

Actual final-combination execution on main555f plus435/436/444/445/447: five new mutation cases and the three affected load-race cases passed (8distinct, exit0). All six recorded manager/test/lock/config/setup SHA256 inputs exactly match this adopted444 update. This is source-input reuse, not a rerun or relabeling of the original14BE/20FE receipts. Targeted manager/new-test ESLint exit0. Current complete-component types are reserved for the actual integration candidate after prerequisites; old types are historical and not claimed current here.

Node24.21.0, reused frontend dependencies, React/jsdom and mocked API only. No live HTTP/database/browser/production or formal CI proof. Original baseline and successful command/source receipts remain in this directory. This extends the existing444; no redundant race PR and no retry of the stopped old create_tree operation.
