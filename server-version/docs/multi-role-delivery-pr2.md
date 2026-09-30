# Multi-role delivery and respondent inbox — PR2

Baseline: PR1 merged as `03af4d17`; PR2 continuation starts at `1c9c2c2a`.

The Mac continuation preserves the original Windows worktree and restores reviewed file edits from its tool history. No synced project reference files were changed.

Implemented: source-owned delivery catalog adapters for Scale, Cognitive, Situational, Bundle and released relational products; one authenticated respondent inbox; multi-role governed Scale SELF; external-parent SELF without organization membership; current class grants and their validity windows; organization homeroom delivery switch; teacher/counselor delivery navigation; content-owned teacher evaluation target selection. The owning runtime still authorizes every start, resume and report.

Validation: Node 24.21.0; all 88 migrations apply to a fresh isolated PostgreSQL 14 database. Frontend typecheck, production build and lint (zero errors) pass. Initial full frontend regression had 651 passes and two stale context fixtures; both were corrected and pass individually. Real PostgreSQL Run publish/start/recovery/consent/lifecycle, external-parent SELF, teacher delivery windows and relational minimum-N tests pass, with the product-read/fence suites rechecked separately after fixture correction and a Serializable conflict. Browser acceptance covers 12 role/width combinations at 390/768/1440; screenshots inspected. Remote CI remains authoritative for the complete seeded regression.

## Publication hold

Production relational registry remains empty. Parent→Student, Teacher→Student, Student→Teacher, Counselor→Client and Client→Counselor content require source-owned applicability, initiation, disclosure, rights and human scientific release evidence. This change does not publish test fixtures or invent approved scientific content. Consequently the ten production Journeys are not claimed end-to-end accepted. Organization Run resource selection remains empty until approved registry entries with supported runtime adapters are registered.

Scoring, canonical FINAL, report calculations and scientific snapshots are unchanged. The added database migration affects delivery controls only.
