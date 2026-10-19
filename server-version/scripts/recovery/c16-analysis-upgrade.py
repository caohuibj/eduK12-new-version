#!/usr/bin/env python3
"""Upgrade only the parent's live FULL02 clone; compare every historical column."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

base = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('c16_db', base / 'c16-analysis-db.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--tools', type=Path, required=True)
p.add_argument('--state', type=Path, required=True)
a = p.parse_args()
db = module.Database(a.tools, a.state)
assert db.status['state'] == 'upgrading'
result = {'passed': False, 'checks': []}
try:
    old_columns = db.columns()
    before = db.projection(old_columns)
    assert len(old_columns) == 205, 'pinned FULL02 C14 schema must contain 205 tables'
    old_migrations = db.sql('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name').splitlines()
    assert len(old_migrations) == 171
    assert before['assessment_unit_snapshots']['rows'] > 0 and before['situational_raw_submissions']['rows'] > 0
    pinned = a.state / 'c14-pinned.dump'
    assert hashlib.sha256(pinned.read_bytes()).hexdigest() == 'a40b5f82ea2058a507140a9735bab4666c9babb96900e0622f279a3a58b0cde6'
    db.restore('eduk12_c16_pinned_restore', pinned, 'restore-pinned-c14')
    assert db.columns('eduk12_c16_pinned_restore') == old_columns
    assert db.projection(old_columns, 'eduk12_c16_pinned_restore') == before
    result['checks'].append('Pinned C14 FULL02 stopped clone matches exact nonempty new-format dump, including all ciphertexts, FINAL hashes, results and jobs')
    old_rows = db.rows(old_columns)
    # Remains private: later C16 additions may add rows but every original row
    # must still be byte-equivalent over all original columns.
    (a.state / 'c16-original-rows-private.json').write_text(json.dumps({'columns': old_columns, 'rows': old_rows}, separators=(',', ':')))
    (a.state / 'c16-old-projections.json').write_text(json.dumps(before, indent=2))
    db.run([db.node, 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], 'migrate-c16', {'DATABASE_URL': db.url(db.owner, 'eduk12_recovery')})
    after_old = db.projection(old_columns)
    assert {k: v for k, v in after_old.items() if k != '_prisma_migrations'} == {k: v for k, v in before.items() if k != '_prisma_migrations'}, 'migration rewrote historical columns'
    assert db.sql('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name').splitlines()[:len(old_migrations)] == old_migrations
    columns = db.columns()
    assert all(columns[table] == value for table, value in old_columns.items()), 'C16 must not alter old columns, including CourseStudent'
    added = sorted(set(columns) - set(old_columns))
    assert added == ['training_analysis_quality', 'training_analysis_quality_audit'], added
    assert all(db.sql(f'SELECT count(*) FROM {module.quote(table)}') == '0' for table in added)
    db.apply_role('eduk12_recovery')
    result.update(oldTableCount=len(old_columns), addedTables=added, oldMigrationCount=len(old_migrations), newMigrationCount=int(db.sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')), historicalProjectionSha256=module.digest(before), courseStudentColumnsUnchanged=columns['course_students'] == old_columns['course_students'])
    result['checks'].append('C16 additive quality/audit migration preserves every old column and row without CourseStudent revision expansion; new tables empty; restricted role verified')
    result['passed'] = True
except BaseException as error:
    result['errorType'] = type(error).__name__
    raise
finally:
    result['processExits'] = db.exits
    (a.state / 'c16-upgrade-result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({'passed': result['passed'], 'checks': len(result['checks'])}), flush=True)
