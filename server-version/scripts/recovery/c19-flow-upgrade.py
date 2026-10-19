#!/usr/bin/env python3
"""C19 exact seven-nullable-column upgrade and fixed C18 restore equivalence."""
import argparse
import importlib.util
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('c19_db', BASE / 'c19-flow-db.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', type=Path, required=True); parser.add_argument('--state', type=Path, required=True)
    args = parser.parse_args(); db = m.Database(args.tools, args.state)
    assert db.status['state'] == 'upgrading'
    target = args.state / 'c19-upgrade-result.json'; assert not target.exists()
    result = {'passed': False, 'checks': []}
    try:
        old = db.snapshot(); columns = old['columns']; migrations = db.sql('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name').splitlines()
        assert len(columns) == 211 and len(migrations) == 173
        assert all(not any(column in existing for column in additions) for table, additions in m.ADDED_COLUMNS.items() for existing in [columns[table]])
        dump = args.state / 'c18-pinned.dump'; assert m.sha_file(dump) == m.PINNED_DUMP_SHA256
        restored = 'eduk12_c19_pinned_restore'; db.restore(restored, dump, 'restore-pinned-c18')
        result['pinnedRestoreEquivalence'] = m.restored_snapshot_equivalence(old, db.snapshot(restored), db, restored)
        result['checks'].append('Fixed nonempty C18 dump equals every cloned table, old logical column, accepted fact, constraint and public trigger/function')
        original = {**old, 'rows': db.rows(columns)}
        (args.state / 'c19-original-rows-private.json').write_text(json.dumps(original, separators=(',', ':')))
        db.run([db.node, 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], 'migrate-c19', {'DATABASE_URL': db.url(db.owner, 'eduk12_recovery')})
        after = db.snapshot(); assert set(after['columns']) == set(columns)
        additions = {}
        for table, old_names in columns.items():
            actual = after['columnMetadata'][table]; expected = old['columnMetadata'][table]
            assert actual[:len(expected)] == expected, f'{table}: original column/ordinal changed'
            added = actual[len(expected):]; allowed = m.ADDED_COLUMNS.get(table, {})
            assert {column['column']: column['udt'] for column in added} == allowed
            assert all(column['nullable'] == 'YES' and column['default'] is None and column['identity'] == 'NO' and column['generated'] == 'NEVER' for column in added)
            if added:
                additions[table] = added
                for column in added:
                    assert db.sql(f'SELECT count(*) FROM {m.quote(table)} WHERE {m.quote(column["column"])} IS NOT NULL') == '0'
        assert sum(map(len, additions.values())) == 7
        names = db.sql('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name').splitlines()
        assert names == [*migrations, m.MIGRATION] and len(names) == 174
        assert {k:v for k,v in db.projection(columns).items() if k != '_prisma_migrations'} == {k:v for k,v in old['projection'].items() if k != '_prisma_migrations'}
        result['retainedFacts'] = db.original_rows_unchanged(original)
        db.apply_role('eduk12_recovery')
        assert db.snapshot() == after, 'runtime role application changed application rows/schema/guards'
        result.update(oldTableCount=211, tableCount=211, oldMigrationCount=173, newMigrationCount=174, addedNullableColumns=additions, historicalProjectionSha256=m.digest(old['projection']))
        result['checks'].append('Exactly seven explicitly whitelisted nullable/no-default columns; no old-column or accepted-row changes and no backfill')
        result['checks'].append('Official runtime-role defaults applied and verify-current passed under the restricted runtime principal')
        snapshot = db.snapshot(); (args.state / 'c19-upgrade-post-state.json').write_text(json.dumps(snapshot, indent=2))
        result['postStateSha256'] = m.digest(snapshot); result['passed'] = True
    except BaseException as error:
        result['errorType'] = type(error).__name__; raise
    finally:
        result['processExits'] = db.exits; target.write_text(json.dumps(result, indent=2)); print(json.dumps({'passed': result['passed'], 'checks': len(result['checks'])}), flush=True)
if __name__ == '__main__': main()
