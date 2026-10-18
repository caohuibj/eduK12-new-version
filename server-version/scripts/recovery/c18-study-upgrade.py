#!/usr/bin/env python3
"""First C18 additive upgrade on a new C16 HTTP07 clone, with no HTTP replay."""
import argparse
import importlib.util
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('c18_db', BASE / 'c18-study-db.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    args = parser.parse_args()
    db = module.Database(args.tools, args.state)
    assert db.status['state'] == 'upgrading'
    assert not (args.state / 'c18-upgrade-result.json').exists(), 'never overwrite or rerun a completed C18 phase'
    result = {'passed': False, 'checks': []}
    try:
        result['freshPrisma'] = module.fresh_prisma(db.backend)
        old_columns = db.columns()
        metadata = db.column_metadata()
        before = db.projection(old_columns)
        old_migrations = db.sql('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name').splitlines()
        assert len(old_columns) == 207 and len(old_migrations) == 172
        for table, count in [('training_analysis_quality', 5), ('training_analysis_quality_audit', 7), ('export_batches', 17), ('export_artifacts', 17)]:
            assert before[table]['rows'] == count, f'{table}: pinned C16 source count differs'
        assert before['assessment_unit_snapshots']['rows'] > 0 and before['situational_raw_submissions']['rows'] > 0
        quality_guards = db.guards(module.QUALITY_TABLES)
        assert len(quality_guards) == 4 and all(row['enabled'] == 'O' for row in quality_guards)
        old_constraints = db.constraints()
        pinned = args.state / 'c16-pinned.dump'
        assert module.sha_file(pinned) == module.PINNED_DUMP_SHA256
        restored = 'eduk12_c18_pinned_restore'
        db.restore(restored, pinned, 'restore-pinned-c16')
        assert db.columns(restored) == old_columns
        ordinal_differences = module.restored_column_equivalence(metadata, db.column_metadata(restored))
        (args.state / 'c18-pinned-restore-column-ordinals.json').write_text(json.dumps(ordinal_differences, indent=2))
        result['pinnedRestoreColumnOrdinals'] = {'differenceCount': len(ordinal_differences), 'differencesSha256': module.digest(ordinal_differences), 'comparison': 'EXACT_COLUMN_PROPERTIES_AND_VISIBLE_ORDER; PHYSICAL_DROPPED_SLOTS_RECORDED'}
        assert db.projection(old_columns, restored) == before
        assert db.guards(module.QUALITY_TABLES, restored) == quality_guards
        assert db.constraints(restored) == old_constraints
        result['checks'].append('Pinned nonempty C16 dump equals all 207 cloned logical tables, exact logical old column definitions and visible order, recorded historic dropped-slot ordinal differences, 5 quality/7 audit/17 export pairs and original quality guards')
        original = {'columns': old_columns, 'columnMetadata': metadata, 'rows': db.rows(old_columns)}
        (args.state / 'c18-original-rows-private.json').write_text(json.dumps(original, separators=(',', ':')))
        (args.state / 'c18-old-projections.json').write_text(json.dumps(before, indent=2))
        db.run([db.node, 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], 'migrate-c18', {'DATABASE_URL': db.url(db.owner, 'eduk12_recovery')})
        columns = db.columns()
        added = sorted(set(columns) - set(old_columns))
        assert added == module.NEW_TABLES and len(columns) == 211
        assert all(columns[t] == v for t, v in old_columns.items())
        after_old = db.projection(old_columns)
        assert {k: v for k, v in after_old.items() if k != '_prisma_migrations'} == {k: v for k, v in before.items() if k != '_prisma_migrations'}
        migration_names = db.sql('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name').splitlines()
        assert len(migration_names) == 173 and migration_names[:172] == old_migrations
        assert set(migration_names) - set(old_migrations) == {'20261018143000_anonymous_study_governance'}
        assert all(db.sql(f'SELECT count(*) FROM {module.quote(t)}') == '0' for t in added)
        assert [r for r in db.constraints() if r['table'] in old_columns] == old_constraints
        assert db.guards(module.QUALITY_TABLES) == quality_guards
        result['retainedFacts'] = db.original_rows_unchanged(original)
        db.apply_role('eduk12_recovery')
        guards = db.guards(module.NEW_TABLES)
        assert len(guards) >= 7 and all(row['enabled'] == 'O' for row in guards)
        deferred = [row for row in guards if row['name'] == 'anonymous_study_research_requires_audit']
        assert len(deferred) == 1 and deferred[0]['deferrable'] and deferred[0]['initiallyDeferred']
        result['restrictedGuardProbe'] = db.governance_guard_probe()
        assert all(db.sql(f'SELECT count(*) FROM {module.quote(t)}') == '0' for t in added)
        result.update(oldTableCount=207, tableCount=211, addedTables=added, oldMigrationCount=172, newMigrationCount=173,
                      historicalProjectionSha256=module.digest(before), governanceGuardDefinitionsSha256=module.digest(guards),
                      qualityGuardDefinitionsSha256=module.digest(quality_guards))
        result['checks'].append('Only four governance tables added; every old column and accepted logical row remains byte-equivalent; new governance tables remain empty after rollback-only probes')
        result['checks'].append('Fresh generated-client schema agrees; actual restricted runtime role and six immutable/audit guard denials verified on PostgreSQL')
        snapshot = db.snapshot()
        (args.state / 'c18-upgrade-post-state.json').write_text(json.dumps(snapshot, indent=2))
        result['postStateSha256'] = module.digest(snapshot)
        result['passed'] = True
    except BaseException as error:
        result['errorType'] = type(error).__name__
        raise
    finally:
        result['processExits'] = db.exits
        (args.state / 'c18-upgrade-result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps({'passed': result['passed'], 'checks': len(result['checks'])}), flush=True)


if __name__ == '__main__':
    main()
