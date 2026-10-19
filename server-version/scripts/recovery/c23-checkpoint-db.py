#!/usr/bin/env python3
"""C23 additive migration and nonempty restore, only inside the private launcher."""
import argparse, importlib.util, json, os, re, sys
from pathlib import Path
sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('c23_prior', BASE / 'c21-group-ip-db.py')
old = importlib.util.module_from_spec(spec); spec.loader.exec_module(old)
sha_file, digest, quote, fresh_prisma = old.sha_file, old.digest, old.quote, old.fresh_prisma
MIGRATION = '20261019050000_training_persistence'
TABLE = 'training_attempt_checkpoints'
ADDED = {'composite_assessments': ['training_persistence_policy', 'training_persistence_policy_hash'],
         'composite_assessment_attempts': ['training_persistence_snapshot', 'training_persistence_snapshot_hash']}
GUARDS = {('composite_assessments', 'training_persistence_parent_guard'),
          ('composite_assessment_attempts', 'training_persistence_attempt_guard'),
          ('composite_assessment_attempts', 'training_checkpoint_terminal_cleanup'),
          ('assessment_unit_snapshots', 'training_checkpoint_unit_final_revision'),
          (TABLE, 'training_checkpoint_guard')}

class Database(old.Database):
    def restore(self, database, target, label):
        assert database == 'eduk12_c23_http_restore', 'only the isolated C23 restore database is allowed'
        self.sql('CREATE DATABASE ' + quote(database), 'postgres')
        self.run([self.pg/'pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '-h', '127.0.0.1',
                  '-p', self.owner.port, '-U', self.owner.username, '-d', database, target], label, self.auth)

def validate_upgrade(before, after):
    assert TABLE not in before['columns'] and 'training_public_rounds' in before['columns']
    assert set(after['columns']) == set(before['columns']) | {TABLE}
    for table, columns in before['columns'].items():
        assert after['columns'][table] == columns + ADDED.get(table, []), table
    previous = {(g['table'], g['name']): g for g in before['allPublicUserGuards']}
    current = {(g['table'], g['name']): g for g in after['allPublicUserGuards']}
    assert all(current.get(k) == v for k, v in previous.items()), 'existing guard changed'
    assert set(current) - set(previous) == GUARDS, 'unexpected additive guard inventory'
    assert all(g['enabled'] == 'O' for g in current.values())
    assert all(c in after['constraints'] for c in before['constraints']), 'old constraint changed'

def audit(db, state, mode, label, expected_snapshot=None):
    """Read-only multi-table work; the launcher's child deadline covers ALL calls."""
    assert re.fullmatch(r'c23-audit-[a-z-]+', label)
    target = state / (label+'-result.json'); assert not target.exists()
    result = {'passed': False, 'mode': mode}
    try:
        if mode == 'baseline':
            assert expected_snapshot is not None
            snapshot = db.snapshot()
            assert snapshot == json.loads(expected_snapshot.read_text()), 'clone differs from accepted C21 snapshot'
            result['acceptedSnapshotSha256'] = sha_file(expected_snapshot)
        else:
            original = json.loads((state/'c23-original-rows-private.json').read_text())
            result['retainedFacts'] = db.original_rows_unchanged(original)
            if mode == 'final':
                snapshot = db.snapshot()
                destination = state/'c23-final-db-snapshot.json'; assert not destination.exists()
                destination.write_text(json.dumps(snapshot))
                result['snapshotSha256'] = sha_file(destination)
        result['passed'] = True
    except BaseException as error:
        result['errorType'] = type(error).__name__; raise
    finally:
        result['processExits'] = db.exits; target.write_text(json.dumps(result, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument('--phase', choices=['upgrade', 'restore'])
    choice.add_argument('--audit', choices=['baseline', 'preserve', 'final'])
    parser.add_argument('--label'); parser.add_argument('--expected-snapshot', type=Path)
    a = parser.parse_args(); os.umask(0o077); db = Database(a.tools, a.state)
    if a.audit:
        audit(db, a.state, a.audit, a.label, a.expected_snapshot); return
    target = a.state / f'c23-{a.phase}-result.json'; assert not target.exists()
    result = {'passed': False, 'checks': []}
    try:
        if a.phase == 'upgrade':
            before = db.snapshot()
            original = {**before, 'rows': db.rows(before['columns'])}
            (a.state/'c23-original-rows-private.json').write_text(json.dumps(original))
            migration_query = 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name'
            migrations = db.sql(migration_query).splitlines()
            assert MIGRATION not in migrations
            db.run([db.node, 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], 'migrate-c23',
                   {'DATABASE_URL': db.url(db.owner, 'eduk12_recovery')})
            after = db.snapshot(); validate_upgrade(before, after)
            assert db.sql(migration_query).splitlines() == migrations + [MIGRATION]
            assert db.sql('SELECT count(*) FROM training_attempt_checkpoints') == '0'
            for table, columns in ADDED.items():
                assert db.sql(f'SELECT count(*) FROM {table} WHERE ' + ' OR '.join(c+' IS NOT NULL' for c in columns)) == '0'
            db.apply_role('eduk12_recovery'); assert db.snapshot() == after
            result['checks'] = ['Exactly one new checkpoint table and four nullable columns, with zero historical backfill',
                                'Five exact additive guards; original rows, columns, constraints and guards retained',
                                'Official restricted runtime-role policy applied and verified on upgraded database']
        else:
            for phase in ['functional', 'races']:
                assert json.loads((a.state/f'c23-{phase}-result.json').read_text())['passed'] is True
            original = json.loads((a.state/'c23-original-rows-private.json').read_text()); after = db.snapshot()
            counts = json.loads(db.sql("SELECT json_build_object('total',count(*),'payload',count(*) FILTER (WHERE payload_encrypted IS NOT NULL),'tombstone',count(*) FILTER (WHERE payload_encrypted IS NULL),'boundRound',count(*) FILTER (WHERE round_id IS NOT NULL),'budget100',count(*) FILTER (WHERE successful_save_count=100))::text FROM training_attempt_checkpoints"))
            assert all(counts[k] > 0 for k in counts), 'restore must include real nonempty payload, tombstone, round and exhausted-budget rows'
            out = a.state/'c23-new-format-restore'; out.mkdir(mode=0o700)
            dump = out/'c23-http-new-format.dump'
            result['dumpSha256'] = db.dump('eduk12_recovery', dump, 'dump-c23'); assert db.snapshot() == after
            db.restore('eduk12_c23_http_restore', dump, 'restore-c23')
            restored = db.snapshot('eduk12_c23_http_restore')
            result['restoreEquivalence'] = old.old.restored_snapshot_equivalence(after, restored, db, 'eduk12_c23_http_restore')
            db.apply_role('eduk12_c23_http_restore'); assert db.snapshot('eduk12_c23_http_restore') == restored
            assert db.snapshot() == after
            # Restore comparison uses the exact old 73-column / 3-parser whitelist.
            # Original full rows are checked separately: no digest-only preservation claim.
            restored_rows = db.rows(original['columns'], 'eduk12_c23_http_restore')
            from collections import Counter
            for table, rows in original['rows'].items():
                assert not Counter(map(lambda r: json.dumps(r, sort_keys=True), rows)) - Counter(map(lambda r: json.dumps(r, sort_keys=True), restored_rows[table])), table
            result['nonemptyCheckpointCounts'] = counts
            result['checks'] = ['Nonempty encrypted drafts, retained tombstones, round binding and cumulative budget restored',
                                'All accepted old full rows preserved and every table/logical fact/guard restored',
                                'Unchanged exact C19 restore whitelist and restored restricted-role verification']
        result['retainedFacts'] = db.original_rows_unchanged(original)
        result['postStateSha256'] = digest(after); result['passed'] = True
        (a.state/f'c23-{a.phase}-post-state-private.json').write_text(json.dumps(after))
    except BaseException as error:
        result['errorType'] = type(error).__name__; raise
    finally:
        result['processExits'] = db.exits; target.write_text(json.dumps(result, indent=2))

if __name__ == '__main__': main()
