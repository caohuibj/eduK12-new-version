# Actual completed-record storage inventory

Source main `93235b6c6a61cefb30fd525eea13ee9c6d4cc0fe`. No application or schema changes.

## Scope and method

Read the retained PR376 successful HTTP fixture database with PostgreSQL default_transaction_read_only=on. No START, FINAL, scoring, report generation, content activation, production access or COS read/write was repeated. The actual backend runtime source is unchanged between the original fixture run and this main; PR376 adds a test and frontend CSS only.

Population: two completed School observer scales (PARENT and TEACHER respondents, distinct student subjects), two immutable unit FINAL records, and one submitted Teacher external field form. The fixtures include real approval/publication and relationship records, but synthetic one-item scales. This is not a representative library payload or four-entry sample.

Both old field-layer measurements and this inventory remain observations, not production capacity qualification. The initial read covered 23 non-empty selected relations; the expanded read adds the scales source table for 24. Neither read wrote business data.

## Measured selected relations

| Relation | Rows | Total relation bytes (heap + indexes + TOAST) |
|---|---:|---:|
| assessments | 2 | 294,912 |
| composite_assessment_attempts | 2 | 229,376 |
| composite_assessments | 2 | 172,032 |
| assessment_unit_snapshots | 2 | 147,456 |
| relational_assessment_assignments | 2 | 147,456 |
| scales | 4 | 139,264 |
| assessment_run_executions | 2 | 114,688 |
| composite_assessment_items | 2 | 114,688 |
| assessment_run_actor_snapshots | 4 | 98,304 |
| assessment_attempt_consents | 4 | 81,920 |
| assessment_run_execution_start_claims | 2 | 81,920 |
| assessment_run_tracks | 2 | 81,920 |
| huiteacher_observation_records | 2 | 81,920 |
| scale_library_submissions | 2 | 81,920 |
| assessment_episodes | 2 | 65,536 |
| assessment_run_relationship_snapshots | 2 | 65,536 |
| assessment_runs | 2 | 65,536 |
| huiteacher_field_form_evidence | 1 | 65,536 |
| measurement_content_releases | 2 | 65,536 |
| scale_library_entries | 2 | 65,536 |
| scale_library_use_grants | 2 | 65,536 |
| huiteacher_field_event_forms | 1 | 49,152 |
| composite_report_queue_budget | 1 | 32,768 |
| scale_library_events | 6 | 32,768 |

## What the observation supports

- The two per-attempt frozen runtime strings occupy 21,906 text bytes combined, larger than the two legacy result representations (7,136) or canonical unit snapshots (6,340). These are different representations with different contracts, not proven byte-identical redundant copies.
- Existing source already provides shared scientific runtime artifacts, shared public templates, compact result/raw facts and parent receipt references. This should be measured end to end before inventing another codec or removing records.
- In this retained fixture database, the selected shared runtime artifact/public template/result fact tables are empty. This demonstrates the records actually present in this sample; it is NOT an observation of production feature flags.
- The selected 24 relations allocate 2,441,216 bytes altogether, but that includes fixed schema page/index overhead and fixture governance records. It is NOT 1.2 MB per answer and cannot be extrapolated to 1,000 users.
- Existing structured expert evidence and narrative records are separate by design; private reflection is not a duplicate public report. Do not merge their visibility or retention semantics to save bytes.

## Shared writer and reader map

| Responsibility | Existing implementation | Boundary |
|---|---|---|
| Frozen Scale content | assessment-runtime/runtime-snapshot.ts persistFrozenScaleRuntimeSnapshot / loadFrozenScaleRuntimeSnapshot | Shared-runtime writes opt-in; compatible legacy/reference reads retained. No per-person permission cache. |
| Final raw and result | scale/unified-final-submit.service.ts prepareUnifiedScaleWrite | One authoritative scoring operation; compact mode may store raw/reference and result facts; whole raw answers can reference the durable parent receipt. |
| Immutable per-unit evidence | assessment-runtime/scale-fact-records.ts and unit snapshots | Submission key, epoch and ownership retained; record references are not a second scoring run. |
| Parent report | composite/compact-composite-report.ts | Uses supported child fact references; cannot assume every tool family is eligible. |
| Small control records | assessment-runtime/shared-control-records.ts | Separate authenticated contracts and size bounds; do not apply toy-payload cutoff globally. |

## Next bounded measurement

Use real START and FINAL writers in an isolated fresh database with a fixed representative source, at increasing numbers of distinct submissions. Record before/after setup, START, accepted FINAL and readable report separately. Compare existing legacy and opt-in shared/compact modes only within that process, preserving exact scoring/report outputs and current authorization. Include fixed templates and indexes rather than copying encrypted payloads into a toy table. Do not substitute prepared child rows for actual START.

First finish a manageable representative shared Scale chain and full ledger before broadening to four entry populations. This is an observation, not a new validation gate or a commitment to enable flags. Report CPU/SQL/memory/transferred bytes and WAL only when actually observed; do not reconstruct missing old WAL or invent p95.

No historical cleanup, archive rewrite, report correction, schema changes, production toggles, deployment, public-library activation or extra COS roundtrips.

## Limitations

- Two School observer scale finals and one Teacher external field form only, not four-entry distribution or capacity.
- Actual complete database schema but small fixture sample includes setup/governance records; page allocation is not per-user amortized cost.
- Column datum bytes and text representation are distinct; sums do not equal heap/index/TOAST totals.
- No prior WAL baseline or before-START table baseline; no backup/restore/COS or decrypted payload equivalence claim.
- Original ephemeral encryption keys are not retained; only metadata/size and existing committed completion identities read. No changes to business rows.
