#!/usr/bin/env python3
"""Restore new C16 quality/export state, without replaying any C14 HTTP suite."""
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
assert db.status['state'] == 'running'
http = json.loads((a.state / 'c16-http-result.json').read_text())
assert http['passed'] is True
result = {'passed': False, 'checks': []}
try:
    original = json.loads((a.state / 'c16-original-rows-private.json').read_text())
    current = db.rows(original['columns'])
    for table, rows in original['rows'].items():
        if table == '_prisma_migrations':
            continue
        # Compare full-row canonical multisets, so a changed original row cannot
        # be hidden by additive fixtures or by a missing/nonstandard primary key.
        from collections import Counter
        before = Counter(json.dumps(row, sort_keys=True, separators=(',', ':')) for row in rows)
        after = Counter(json.dumps(row, sort_keys=True, separators=(',', ':')) for row in current[table])
        assert not before - after, f'{table}: original accepted row changed or disappeared'
    result['originalRowsUnchanged'] = True
    result['checks'].append('Every original FULL02 business row including users remains exact across C16 analysis, quality and export; no re-FINAL/rescore/task rewrite')
    schema = db.columns()
    before = db.projection(schema)
    guard_sql = "SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,'trigger',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid)) ORDER BY t.tgname) FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('training_analysis_quality'::regclass,'training_analysis_quality_audit'::regclass)"
    guard_definitions = json.loads(db.sql(guard_sql))
    assert len(guard_definitions) == 4 and all(row['enabled'] == 'O' for row in guard_definitions)
    assert db.sql("SELECT count(*) FROM pg_proc WHERE proname LIKE 'c16_test_%'") == '0'
    for table in ['training_analysis_quality', 'training_analysis_quality_audit', 'export_batches', 'export_artifacts']:
        assert before[table]['rows'] > 0, f'{table}: nonempty C16 state required'
    out = a.state / 'c16-new-format-restore'
    out.mkdir(mode=0o700)
    dump = out / 'c16-http-new-format.dump'
    result['dumpSha256'] = db.dump('eduk12_recovery', dump, 'dump-c16')
    assert db.projection(schema) == before
    restored = 'eduk12_c16_http_restore'
    db.restore(restored, dump, 'restore-c16')
    assert db.columns(restored) == schema
    assert db.projection(schema, restored) == before
    assert json.loads(db.sql(guard_sql, restored)) == guard_definitions
    assert db.sql("SELECT count(*) FROM pg_proc WHERE proname LIKE 'c16_test_%'", restored) == '0'
    result['qualityGuardDefinitionsSha256'] = module.digest(guard_definitions)
    result['qualityGuardCount'] = len(guard_definitions)
    result['checks'].append('All four original quality/audit trigger and function definitions, enabled states and deferred constraint properties survive nonempty dump/restore byte-equivalently; temporary fault injection is absent')
    db.apply_role(restored)
    result.update(tableCount=len(schema), projectionSha256=module.digest(before), qualityRows=before['training_analysis_quality']['rows'], auditRows=before['training_analysis_quality_audit']['rows'])
    result['checks'].append('Nonempty C16 quality/audit, original facts, synthetic two-wave sources and original-queue export records survive pg_dump/restore exactly; restricted role verified')
    (out / 'table-projections.json').write_text(json.dumps(before, indent=2))
    result['passed'] = True
except BaseException as error:
    result['errorType'] = type(error).__name__
    raise
finally:
    result['processExits'] = db.exits
    (a.state / 'c16-restore-result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({'passed': result['passed'], 'checks': len(result['checks'])}), flush=True)
