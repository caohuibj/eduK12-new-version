#!/usr/bin/env python3
"""C20 nonempty path/candidate proof dump and exact all-table restore."""
import argparse
import importlib.util
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('c20_db', BASE / 'c20-materials-db.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', type=Path, required=True); parser.add_argument('--state', type=Path, required=True)
    args = parser.parse_args(); db = m.Database(args.tools, args.state)
    assert db.status['state'] == 'restoring'
    main_evidence=args.state/'c20-main-result.json'
    assert json.loads(main_evidence.read_text())['passed'] is True
    target = args.state / 'c20-restore-result.json'; assert not target.exists()
    result = {'passed': False, 'checks': [], 'acceptedMainProducer':{'file':main_evidence.name,'sha256':m.sha_file(main_evidence)}}
    try:
        result['retainedFacts'] = db.original_rows_unchanged(json.loads((args.state / 'c20-original-rows-private.json').read_text()))
        snapshot = db.snapshot(); assert len(snapshot['columns']) == 215
        for table in m.NEW_TABLES:
            assert int(db.sql(f'SELECT count(*) FROM {m.quote(table)}'))>0, f'nonempty {table} evidence required'
        assert db.sql("SELECT count(*) FROM pg_proc WHERE proname ~ '^c(16|18|19|20)_test_'") == '0'
        out = args.state / 'c20-new-format-restore'; out.mkdir(mode=0o700)
        dump = out / 'c20-http-new-format.dump'; result['dumpSha256'] = db.dump('eduk12_recovery', dump, 'dump-c20')
        assert dump.stat().st_size > 0 and db.snapshot() == snapshot
        restored = 'eduk12_c20_http_restore'; db.restore(restored, dump, 'restore-c20')
        restored_snapshot = db.snapshot(restored)
        result['restoreEquivalence'] = m.restored_snapshot_equivalence(snapshot, restored_snapshot, db, restored)
        db.apply_role(restored)
        assert db.snapshot(restored) == restored_snapshot and db.snapshot() == snapshot
        assert m.sha_file(args.state / 'c19-pinned.dump') == m.PINNED_DUMP_SHA256
        result.update(tableCount=215, projectionSha256=m.digest(snapshot['projection']), publicGuardCount=len(snapshot['allPublicUserGuards']))
        (out / 'source-schema-evidence.json').write_text(json.dumps(snapshot, indent=2))
        (out / 'restored-schema-evidence.json').write_text(json.dumps(restored_snapshot, indent=2))
        (args.state / 'c20-restore-post-state.json').write_text(json.dumps(snapshot, indent=2))
        result['postStateSha256'] = m.digest(snapshot)
        result['checks'] += ['Nonempty C20 candidate/path proofs and all 215 tables/column definitions/guards/facts survive exact dump and restore', 'Restored official runtime-role contract succeeds; original C19 facts and pinned source dump remain unchanged']
        result['passed'] = True
    except BaseException as error:
        result['errorType'] = type(error).__name__; raise
    finally:
        result['processExits'] = db.exits; target.write_text(json.dumps(result, indent=2)); print(json.dumps({'passed': result['passed'], 'checks': len(result['checks'])}), flush=True)
if __name__ == '__main__': main()
