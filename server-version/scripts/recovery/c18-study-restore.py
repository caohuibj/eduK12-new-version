#!/usr/bin/env python3
"""C18 nonempty all-table dump/restore, restricted role and database guards."""
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
    assert db.status['state'] == 'restoring'
    assert json.loads((args.state / 'c18-http-result.json').read_text())['passed'] is True
    assert not (args.state / 'c18-restore-result.json').exists(), 'never overwrite or rerun a completed C18 phase'
    result = {'passed': False, 'checks': []}
    try:
        result['retainedFacts'] = db.original_rows_unchanged(json.loads((args.state / 'c18-original-rows-private.json').read_text()))
        snapshot = db.snapshot()
        assert len(snapshot['columns']) == 211
        assert len(snapshot['qualityGuards']) == 4 and len(snapshot['governanceGuards']) >= 7
        assert all(row['enabled'] == 'O' for row in snapshot['qualityGuards'] + snapshot['governanceGuards'])
        for table in module.NEW_TABLES + ['anonymous_studies', 'anonymous_study_participants', 'export_batches', 'export_artifacts']:
            assert snapshot['projection'][table]['rows'] > 0, f'{table}: real nonempty C18 evidence required'
        assert db.sql("SELECT count(*) FROM pg_proc WHERE proname ~ '^c(16|18)_test_'") == '0', 'temporary fault injection remains'
        out = args.state / 'c18-new-format-restore'
        out.mkdir(mode=0o700)
        dump = out / 'c18-http-new-format.dump'
        result['dumpSha256'] = db.dump('eduk12_recovery', dump, 'dump-c18')
        assert dump.stat().st_size > 0 and db.snapshot() == snapshot
        restored = 'eduk12_c18_http_restore'
        db.restore(restored, dump, 'restore-c18')
        restored_snapshot = db.snapshot(restored)
        equivalence = module.restored_snapshot_equivalence(snapshot, restored_snapshot, db, restored)
        ordinal_differences = equivalence['columnOrdinals']
        result['restoredConstraintReparses'] = equivalence['constraintReparses']
        (out / 'column-ordinal-differences.json').write_text(json.dumps(ordinal_differences, indent=2))
        result['restoredColumnOrdinals'] = {'differenceCount': len(ordinal_differences), 'differencesSha256': module.digest(ordinal_differences), 'comparison': 'EXACT_COLUMN_PROPERTIES_AND_VISIBLE_ORDER; PHYSICAL_DROPPED_SLOTS_RECORDED'}
        assert db.sql("SELECT count(*) FROM pg_proc WHERE proname ~ '^c(16|18)_test_'", restored) == '0'
        db.apply_role(restored)
        result['restrictedGuardProbe'] = db.governance_guard_probe(restored)
        assert db.snapshot(restored) == restored_snapshot and db.snapshot() == snapshot
        result.update(tableCount=211, projectionSha256=module.digest(snapshot['projection']),
                      governanceGuardDefinitionsSha256=module.digest(snapshot['governanceGuards']),
                      qualityGuardDefinitionsSha256=module.digest(snapshot['qualityGuards']),
                      governanceGuardCount=len(snapshot['governanceGuards']), qualityGuardCount=4,
                      governanceRows={t: snapshot['projection'][t]['rows'] for t in module.NEW_TABLES})
        (out / 'table-projections.json').write_text(json.dumps(snapshot['projection'], indent=2))
        (out / 'restored-schema-evidence.json').write_text(json.dumps(restored_snapshot, indent=2))
        (out / 'source-schema-evidence.json').write_text(json.dumps(snapshot, indent=2))
        (args.state / 'c18-restore-post-state.json').write_text(json.dumps(snapshot, indent=2))
        result['postStateSha256'] = module.digest(snapshot)
        result['checks'].append('All original C16 accepted logical rows, columns, quality/audit facts and 17 original export pairs retained without education-record deletion or rescoring')
        result['checks'].append('Nonempty consent/version/withdrawal/audit state and all 211 tables, column metadata, constraints, trigger/function definitions, enabled/deferred properties survive exact dump/restore')
        result['checks'].append('Restored database passes the actual restricted-role contract and rollback-only immutable/audit guard denials; temporary fault injection absent; live source projection unchanged')
        result['passed'] = True
    except BaseException as error:
        result['errorType'] = type(error).__name__
        raise
    finally:
        result['processExits'] = db.exits
        (args.state / 'c18-restore-result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps({'passed': result['passed'], 'checks': len(result['checks'])}), flush=True)


if __name__ == '__main__':
    main()
