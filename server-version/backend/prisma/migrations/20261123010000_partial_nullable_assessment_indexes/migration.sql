-- Convert 100%-NULL nullable-FK indexes on assessment_unit_snapshots and
-- assessments into partial indexes with identical index names.
--
-- Production measurement (2026-11-23):
--   assessment_unit_snapshots: 590,824 total rows, 0 with non-null questionnaire_assessment_id
--     -> 3 legacy questionnaire indexes consumed 71 MB (58 + 6.4 + 6.4 MB) indexing pure NULLs
--   assessments: 601,189 total rows, 0 with non-null questionnaire_assessment_id or episode_id
--     -> 2 legacy indexes consumed 14.6 MB (7.3 + 7.3 MB) indexing pure NULLs
--
-- Safety & Rollout:
--   1. Each replacement partial index is created (or reused if pre-staged) under
--      a temporary `*_p2` name BEFORE any legacy index is dropped.
--   2. Before ANY `DROP INDEX` or `ALTER INDEX ... RENAME TO` runs, the DO block
--      below validates every `*_p2` index in `pg_index` (`indisvalid = true`,
--      `indisready = true`, exact table, uniqueness, key column order, and
--      partial `WHERE ... IS NOT NULL` predicate). If a prior failed
--      `CREATE INDEX CONCURRENTLY` left an invalid or mismatched `*_p2` index,
--      the migration aborts BEFORE touching any existing valid index.
--   3. Locking & production rollout order (not strictly zero-blocking):
--      - Plain `CREATE [UNIQUE] INDEX` holds a `SHARE` lock (blocking table
--        writes for the build duration); `DROP INDEX` and `ALTER INDEX ...
--        RENAME TO` still take brief `ACCESS EXCLUSIVE` metadata locks.
--      - On live busy tables, pre-stage the 5 `*_p2` indexes beforehand via
--        `CREATE [UNIQUE] INDEX CONCURRENTLY ...` outside a transaction and
--        confirm `pg_index.indisvalid = true` (if a build fails, drop the
--        invalid `*_p2` index via `DROP INDEX CONCURRENTLY` and rebuild).
--      - Execute the deploy via `node scripts/migrate-deploy-bounded.mjs` so
--        `lock_timeout` bounds lock acquisition during the swap. Do not rely on
--        implicit multi-statement transaction wrapping across upgrades.

CREATE UNIQUE INDEX IF NOT EXISTS "assessment_unit_snapshots_questionnaire_slot_key_p2"
  ON "assessment_unit_snapshots" ("questionnaire_assessment_id", "attempt_epoch", "slot_key")
  WHERE "questionnaire_assessment_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "assessment_unit_snapshots_questionnaire_source_key_p2"
  ON "assessment_unit_snapshots" ("questionnaire_assessment_id", "attempt_epoch", "source_attempt_id")
  WHERE "questionnaire_assessment_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "assessment_unit_snapshots_questionnaire_terminal_idx_p2"
  ON "assessment_unit_snapshots" ("questionnaire_assessment_id", "attempt_epoch", "terminal_state")
  WHERE "questionnaire_assessment_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "assessments_questionnaire_assessment_id_idx_p2"
  ON "assessments" ("questionnaire_assessment_id")
  WHERE "questionnaire_assessment_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "assessments_episode_id_idx_p2"
  ON "assessments" ("episode_id")
  WHERE "episode_id" IS NOT NULL;

DO $$
DECLARE
  spec RECORD;
  rec RECORD;
  actual_cols text[];
  actual_pred text;
BEGIN
  FOR spec IN
    SELECT * FROM (
      VALUES
        (
          'assessment_unit_snapshots_questionnaire_slot_key_p2',
          'assessment_unit_snapshots',
          true,
          ARRAY['questionnaire_assessment_id', 'attempt_epoch', 'slot_key']::text[],
          'questionnaire_assessment_id IS NOT NULL'
        ),
        (
          'assessment_unit_snapshots_questionnaire_source_key_p2',
          'assessment_unit_snapshots',
          true,
          ARRAY['questionnaire_assessment_id', 'attempt_epoch', 'source_attempt_id']::text[],
          'questionnaire_assessment_id IS NOT NULL'
        ),
        (
          'assessment_unit_snapshots_questionnaire_terminal_idx_p2',
          'assessment_unit_snapshots',
          false,
          ARRAY['questionnaire_assessment_id', 'attempt_epoch', 'terminal_state']::text[],
          'questionnaire_assessment_id IS NOT NULL'
        ),
        (
          'assessments_questionnaire_assessment_id_idx_p2',
          'assessments',
          false,
          ARRAY['questionnaire_assessment_id']::text[],
          'questionnaire_assessment_id IS NOT NULL'
        ),
        (
          'assessments_episode_id_idx_p2',
          'assessments',
          false,
          ARRAY['episode_id']::text[],
          'episode_id IS NOT NULL'
        )
    ) AS t(idx_name, table_name, expect_unique, expect_cols, expect_pred)
  LOOP
    SELECT
      i.indisvalid,
      i.indisready,
      i.indisunique,
      i.indnatts,
      i.indnkeyatts,
      i.indexprs IS NOT NULL AS has_exprs,
      i.indrelid,
      i.indkey,
      i.indpred,
      tbl.relname AS actual_table
    INTO rec
    FROM pg_class idx
    JOIN pg_namespace ns ON ns.oid = idx.relnamespace
    JOIN pg_index i ON i.indexrelid = idx.oid
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    WHERE ns.nspname = current_schema()
      AND idx.relkind IN ('i', 'I')
      AND idx.relname = spec.idx_name;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Replacement index "%" not found in schema "%"; aborting before dropping legacy indexes.',
        spec.idx_name, current_schema();
    END IF;

    IF NOT rec.indisvalid OR NOT rec.indisready THEN
      RAISE EXCEPTION 'Replacement index "%" is invalid or not ready (indisvalid=%, indisready=%); drop the invalid pre-staged index and rebuild before retrying.',
        spec.idx_name, rec.indisvalid, rec.indisready;
    END IF;

    IF rec.actual_table <> spec.table_name THEN
      RAISE EXCEPTION 'Replacement index "%" belongs to table "%" instead of "%".',
        spec.idx_name, rec.actual_table, spec.table_name;
    END IF;

    IF rec.indisunique <> spec.expect_unique THEN
      RAISE EXCEPTION 'Replacement index "%" uniqueness mismatch (actual=%, expected=%).',
        spec.idx_name, rec.indisunique, spec.expect_unique;
    END IF;

    IF rec.has_exprs
      OR rec.indnatts <> array_length(spec.expect_cols, 1)
      OR rec.indnkeyatts <> array_length(spec.expect_cols, 1) THEN
      RAISE EXCEPTION 'Replacement index "%" key structure mismatch (has_exprs=%, indnatts=%, indnkeyatts=%).',
        spec.idx_name, rec.has_exprs, rec.indnatts, rec.indnkeyatts;
    END IF;

    SELECT array_agg(a.attname::text ORDER BY u.ord)
    INTO actual_cols
    FROM unnest(rec.indkey::int2[]) WITH ORDINALITY AS u(attnum, ord)
    JOIN pg_attribute a
      ON a.attrelid = rec.indrelid
     AND a.attnum = u.attnum
     AND NOT a.attisdropped;

    IF actual_cols IS DISTINCT FROM spec.expect_cols THEN
      RAISE EXCEPTION 'Replacement index "%" columns mismatch (actual=%, expected=%).',
        spec.idx_name, actual_cols, spec.expect_cols;
    END IF;

    actual_pred := btrim(replace(COALESCE(pg_get_expr(rec.indpred, rec.indrelid), ''), '"', ''), '() ');
    IF actual_pred <> spec.expect_pred THEN
      RAISE EXCEPTION 'Replacement index "%" predicate mismatch (actual="%", expected="%").',
        spec.idx_name, actual_pred, spec.expect_pred;
    END IF;
  END LOOP;
END $$;

DROP INDEX IF EXISTS "assessment_unit_snapshots_questionnaire_slot_key";
ALTER INDEX "assessment_unit_snapshots_questionnaire_slot_key_p2"
  RENAME TO "assessment_unit_snapshots_questionnaire_slot_key";

DROP INDEX IF EXISTS "assessment_unit_snapshots_questionnaire_source_key";
ALTER INDEX "assessment_unit_snapshots_questionnaire_source_key_p2"
  RENAME TO "assessment_unit_snapshots_questionnaire_source_key";

DROP INDEX IF EXISTS "assessment_unit_snapshots_questionnaire_terminal_idx";
ALTER INDEX "assessment_unit_snapshots_questionnaire_terminal_idx_p2"
  RENAME TO "assessment_unit_snapshots_questionnaire_terminal_idx";

DROP INDEX IF EXISTS "assessments_questionnaire_assessment_id_idx";
ALTER INDEX "assessments_questionnaire_assessment_id_idx_p2"
  RENAME TO "assessments_questionnaire_assessment_id_idx";

DROP INDEX IF EXISTS "assessments_episode_id_idx";
ALTER INDEX "assessments_episode_id_idx_p2"
  RENAME TO "assessments_episode_id_idx";
