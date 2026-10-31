# Teacher planned metrics and initial directory retry

Product 5f4ab3a01, based on the main-aligned Form history source 543348730; no Form source changes are part of this slice. The exact production change is two files.

Internal API: generateTeacherNumericGroup(input, {allowPartialSourceMetrics:true}). The default call remains strict; a superset is admitted internally only when at least one spec source key belongs to the actual released source contract. Existing exact source/leaf authorization, minimum N, delays, contributor differencing, caller-owned lock transaction, artifact persist and saved read remain the same path. HTTP input is unchanged. The longitudinal caller must consume the existing authorized projection and null/suppress the absent planned metric; this option is not another aggregation or disclosure path.

One focused producer unit case passes: default wider-spec refusal; internal call uses the same transaction and beforePersist hook; the saved authorized projection has A only despite B in frozen private bytes; no permitted planned key still rejects. This mocks the underlying engine/read boundary and does not claim new native FINAL or two-wave coverage. The existing common projection and transaction originals are reused. Long owns the actual planned two-wave adapter counterexample.

O11 is reproduced in the prior source: a first directory GET failure left open=true/index=null with no retry control. One reused memoized loader plus an in-place button now retries. One new React case passes the first failure, manual retry and configuration GET, with no POST. The previous successful pointer journey was not replayed.

Both current backend and frontend type checks passed once at the recorded component trees. Receipts are unsigned, with stable tracked input hashes. No schema/migration, permission grant, workflow framework, production operation or deployment. This remains a stacked development slice until its preceding Form candidate is merged and actual final source/control inputs qualify.
