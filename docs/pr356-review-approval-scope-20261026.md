# PR356 review: approval entry intent and audit

New approval snapshots bind their explicit allowedProducts. Identical combination retries compare the original approved scope; changing it returns HTTP 409 and directs the operator to the formal entry-scope adjustment flow. Reusing the same request also checks original actor/reason, and a request cannot name another combination. No retry adds policies, trials or grants. Old snapshots may use exactly one matching original approval audit containing allowedProducts; missing/ambiguous/invalid evidence conflicts explicitly. Hardcoded SURVEY_ONLY is never interpreted as historical scope.

New approval and successful-trial audit events use PRODUCT_ENTRIES and actual approved products. Historical audit rows are not rewritten.

Local checks: one real PostgreSQL synthetic chain covers old-audit-backed replay, same/new-request scope conflicts, changed reason, request identity conflict, real both-entry ONLINE approval and both audit product sets (passed). Five legacy-evidence refusal contracts passed; the first invocation found no tests because of command cwd, then the correct backend invocation ran them. Evidence `/workspace/scratch/pr356-review-approval/{test,legacy-recheck}.json`. No formal CI, production access, merge or deployment.
