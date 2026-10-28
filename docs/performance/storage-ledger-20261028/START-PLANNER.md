# Shared current-authority planner bound

The storage comparison does not justify enabling production compact/shared flags. It revealed a concrete START database hotspot. Read-only inspection of the existing completed synthetic Teacher SELF record ran the actual current-authority reader, captured its seven SELECT statements, and compared actual EXPLAIN ANALYZE plans at transaction-local join_collapse_limit8 and1. No new START/FINAL or rescoring occurred. Full original plans are losslessly compressed, with original decoded SHA256 in the summary.

The final population/time-window SELECT (SQL hash f621e1327d...) took53.96ms in the observed call. Its plan comparison was35.629ms planning /2.452ms execution at8, versus9.999ms /1.552ms at1. The other six SELECTs had sub-1.2ms planning. This identifies a real current-authority planning cost; it does not prove every millisecond of the earlier fixed-order mode difference was caused by this query or by compression. No full START latency improvement is asserted without a new comparable observation.

## Minimal source change

Immediately before the final current population and time-window decision in assessment-run/startAuthority.ts, apply SET LOCAL join_collapse_limit=1. This is the same existing approach used by both education report readers. Every original SELECT, present-account check, relationship check, current resource authority, intake deadline, shared/row fence and statement_timestamp decision remains. No authorization cache, skipped gate, security setting, global database option or persistent connection setting.

The helper's production callers are the transactional Run claim and dispatch/continuation paths. The setting restores on transaction commit/rollback. School and Teacher consume this shared path. Training and Survey paths that do not call it receive no meaningless duplicated implementation.

## Direct evidence

-4 selected unit cases PASS,7 filtered: both existing bound-FORM-FINAL intake semantics plus current account/population refusal under the planner bound. Early-return and old lock-fence cases are unchanged and not automatically rerun.
-Existing retained real PostgreSQL record: current authority passes with inside setting1, pooled samePID setting8 before/after. Expired-intake and frozen-actor synthetic negative branches reject and explicitly roll back. Original30 immutable finals remain unchanged. This diagnostic is not read-only in its negative transactions; only temporary owned fixture changes are made and rolled back.
-New isolated real PostgreSQL: selected School and Teacher SELF actual START→FINAL→report/image-authorization cases2PASS,1filtered. Original fixture mocks HTTP identity transport and final image bytes only, so this is not new browser/login acceptance. No whole60-record lifecycle rerun.
-Backend TypeScript completed exit0 with source/test changes. Receipt/input association to final component tree is retrospective and unsigned; original log retained.
-No frontend, schema, lock dependency, production flag or COS changes. Source changes are4lines plus direct test support/assertions. No data cleanup or recomputation.

Formal CI should admit those unchanged verified inputs and the explicit original diagnostic; only exact source qualification, changed-source/control SAST and stable merge gate need current execution. No browser or unrelated application builds. Precision and honest evidence limits remain required.
