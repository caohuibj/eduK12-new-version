/** Missing-only database adapter. The launcher binds this complete source,
 * the exact inline program, interpreter and unchanged Python helper closure.
 * No migration, fixture FINAL, report drain or service startup is exposed here. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

export const FAILED_SNAPSHOT_SHA256='4ab9189d33c04e7aae7cd1b80d6e390246672eaa9841b5dac887bbbb1fbcc3b1'
export const SECOND_SNAPSHOT_SHA256='cae493b8a6d6c62a34a9d181822d22cd927fa5c1081666cd8fb049cefa91d1cf'
export const BASELINE_LABEL='c25-missing-audit-baseline'
export const INLINE_PYTHON=String.raw`
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import traceback

sys.dont_write_bytecode = True
FAILED_SNAPSHOT_SHA256 = '4ab9189d33c04e7aae7cd1b80d6e390246672eaa9841b5dac887bbbb1fbcc3b1'
SECOND_SNAPSHOT_SHA256 = 'cae493b8a6d6c62a34a9d181822d22cd927fa5c1081666cd8fb049cefa91d1cf'
PRIOR_PROTECTED_SHA256 = '231c52d48d8533d17ebbb9c9563b56c7be7652bdd99a061e20f82ebe8b725f16'
BASELINE_LABEL = 'c25-missing-audit-baseline'
PROTECTED_FILE = 'c25-missing-protected-rows-private.json'
PHASE_FILES = {name: 'c25-missing-' + name + '-result.json' for name in ('open', 'probe', 'consumers', 'guards')}
INHERITED_FILES = {
    'c25-original-rows-private.json': '0948a2bedad3c87c6dc27f4cd325f59d866c92e659332cdf427800a428d0697c',
    'c25-prepare-result.json': 'e2fac92a430680d0e671df6d890a3ef41b1b3cc2bfb57d5301aa4cbbbb4fc001',
}
CLEANUP_TABLES = ('submission_idempotency_receipts', 'checkin_submission_idempotency_receipts')

def sha_file(file):
    h = hashlib.sha256()
    with Path(file).open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def private_file(file):
    file = Path(file)
    info = file.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_nlink == 1, 'private evidence must be a regular unaliased file'
    assert stat.S_IMODE(info.st_mode) == 0o600, 'private evidence must be mode 0600'
    assert all(not part.is_symlink() for part in [file, *file.parents]), 'private evidence symlink'
    return file

def private_json(file, value):
    with open(file, 'x', encoding='utf-8') as handle:
        os.chmod(file, 0o600)
        json.dump(value, handle, indent=2)

def load_helper(file):
    file = Path(file)
    assert file.is_file() and not file.is_symlink() and file.name == 'c25-db.py'
    spec = importlib.util.spec_from_file_location('c25_missing_immutable_db', file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def assert_projection(snapshot, rows):
    assert set(rows) == set(snapshot['columns']) == set(snapshot['projection']) == set(snapshot['columnMetadata']), 'full-row table inventory differs'
    for table, columns in snapshot['columns'].items():
        assert len(columns) == len(set(columns)), 'duplicate column identity'
        assert isinstance(rows[table], list)
        assert all(isinstance(row, dict) and set(row) == set(columns) for row in rows[table]), 'full logical row omitted or added a column: ' + table
        assert {'rows': len(rows[table]), 'sha256': digest(rows[table])} == snapshot['projection'][table], 'full rows differ from pinned projection: ' + table

def validate_capture(snapshot, rows, *, count=6651, checkpoints=20):
    assert_projection(snapshot, rows)
    assert len(snapshot['columns']) == 217, 'protected table count differs'
    assert sum(map(len, rows.values())) == count, 'protected full-row count differs'
    assert len(rows['training_attempt_checkpoints']) == checkpoints, 'protected checkpoint count differs'
    for table in CLEANUP_TABLES:
        assert not rows[table], 'immediate startup receipt cleanup could delete protected rows: ' + table
    return {'tables': 217, 'rows': count, 'checkpoints': checkpoints,
            'allColumnsProtected': True, 'immediateCleanupReceiptTablesEmpty': True}

def validate_protected(document, expected, expected_sha, *, prior=False):
    key = 'failedSnapshotSha256' if prior else 'secondFailedSnapshotSha256'
    assert set(document) == {'schemaVersion', key, 'snapshot', 'rows'}
    assert document['schemaVersion'] == 1 and document[key] == expected_sha
    assert document['snapshot'] == expected, 'protected snapshot differs from failed-run final snapshot'
    return validate_capture(document['snapshot'], document['rows'],
                            count=6582 if prior else 6651, checkpoints=17 if prior else 20)

def assert_schema(expected, actual):
    assert set(actual) == set(expected), 'live snapshot shape changed'
    assert {key: value for key, value in actual.items() if key != 'projection'} == {
        key: value for key, value in expected.items() if key != 'projection'
    }, 'live schema changed; restore-only normalization is forbidden here'

def preserve(db, prior, first, protected, helper):
    # This remains the original HTTP03 6,529-row / 16-checkpoint contract.
    inherited = db.original_rows_unchanged(prior)
    assert inherited['allOriginalRowsRetained'] is True
    assert inherited['oldTables'] == 217 and inherited['oldRows'] == 6529
    assert inherited['originalCheckpointRowsRetained'] == 16
    actual = db.snapshot()
    assert_schema(protected['snapshot'], actual)
    current_rows = db.rows(protected['snapshot']['columns'])
    assert_projection(actual, current_rows)
    # Full current columns include all C22 columns, ciphertexts, counters,
    # timestamps, failed-run A/B and the shared report-budget singleton.
    assert_schema(first['snapshot'], actual)
    helper.validate_old_rows(first['rows'], current_rows)
    helper.validate_old_rows(protected['rows'], current_rows)
    summary = {'originalHTTP03': inherited,
               'firstFailedRun': {'tables': 217, 'rows': 6582, 'checkpoints': 17,
                                  'allFullLogicalRowsRetained': True, 'noColumnOrTableExemptions': True,
                                  'liveSchemaExact': True, 'protectedRowsSha256': digest(first['rows'])},
               'secondFailedRun': {'tables': 217, 'rows': 6651, 'checkpoints': 20,
                             'allFullLogicalRowsRetained': True, 'noColumnOrTableExemptions': True,
                             'liveSchemaExact': True, 'protectedRowsSha256': digest(protected['rows'])},
               'currentRows': sum(map(len, current_rows.values())), 'currentSnapshotSha256': digest(actual)}
    return summary, actual, current_rows

def record_preservation(result, summary):
    # Preserve the exact finalization API used by the unchanged launcher
    # contract, while exposing the stronger continuation baseline separately.
    result['retainedFacts'] = summary['originalHTTP03']
    result['continuationRetainedFacts'] = {
        'allFailedRowsRetained': True, 'oldTables': 217, 'oldRows': 6582,
        'checkpointRows': 17, 'allColumnsProtected': True,
        'noColumnOrTableExemptions': True, 'liveSchemaExact': True,
        'protectedRowsSha256': summary['firstFailedRun']['protectedRowsSha256'],
    }
    result['missingRetainedFacts'] = {
        'allSecondFailedRowsRetained': True, 'oldTables': 217, 'oldRows': 6651,
        'checkpointRows': 20, 'allColumnsProtected': True,
        'noColumnOrTableExemptions': True, 'liveSchemaExact': True,
        'protectedRowsSha256': summary['secondFailedRun']['protectedRowsSha256'],
    }
    result['currentRows'] = summary['currentRows']
    result['currentSnapshotSha256'] = summary['currentSnapshotSha256']

def verify_restored_rows(db, prior, first, protected, source_rows, helper):
    restored_rows = db.rows(protected['snapshot']['columns'], helper.RESTORE_DATABASE)
    helper.validate_old_rows(first['rows'], restored_rows)
    helper.validate_old_rows(protected['rows'], restored_rows)
    # All post-continuation rows, including the fresh fixtures, survive too.
    assert set(source_rows) == set(restored_rows)
    for table in source_rows:
        assert helper.row_counter(source_rows[table]) == helper.row_counter(restored_rows[table]), 'restored full logical rows differ: ' + table
    original_projection = {
        table: [{column: row[column] for column in columns} for row in restored_rows[table]]
        for table, columns in prior['columns'].items()
    }
    helper.validate_old_rows(prior['rows'], original_projection)
    helper.validate_historical_nulls(prior['rows'], {table: restored_rows[table] for table in helper.ADDED})
    return {'firstFailedRunFullRowsRetained': 6582, 'secondFailedRunFullRowsRetained': 6651,
            'originalHTTP03FullRowsRetained': 6529,
            'allPostContinuationFullRowsEqual': True, 'tables': 217,
            'postContinuationRows': sum(map(len, source_rows.values()))}

def validate_phase_receipts(receipts):
    assert set(receipts) == set(PHASE_FILES), 'missing-only restore prerequisite set differs'
    for name, receipt in receipts.items():
        assert receipt.get('schemaVersion') == 1 and receipt.get('passed') is True, 'a missing-only phase did not pass: ' + name
        assert receipt.get('phase') == 'missing-' + name, 'wrong missing-only phase identity: ' + name
    return True

def read_prerequisites(args):
    # The exact bound Node and sibling pure contract validate inherited failed
    # receipts and each accepted subcheck. No boolean promotion or file rewrite.
    assert args.node == args.tools / 'node_modules/node/bin/node', 'official bound Node path required'
    inputs = {str(file): sha_file(file) for file in [args.node, args.contract]}
    contract = private_file(Path(args.state) / 'c25-missing-prerequisites.json')
    before = sha_file(contract)
    run = subprocess.run([str(args.node), str(args.contract), '--validate-prerequisites', str(args.state)],
                         text=True, capture_output=True, timeout=30,
                         env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
    assert run.returncode == 0, 'hash-bound missing-only prerequisites rejected'
    assert sha_file(contract) == before, 'prerequisites changed while validating'
    assert all(sha_file(Path(file)) == expected for file, expected in inputs.items()), 'prerequisite validator inputs changed'
    return {str(contract): before, **inputs}

def evidence_inputs(args):
    state, failure, continuation = Path(args.state), Path(args.failure_state), Path(args.continuation_state)
    directories = [state, failure, continuation]
    for directory in directories:
        assert directory.is_absolute() and directory.is_dir() and directory.resolve() == directory
        assert all(not part.is_symlink() for part in [directory, *directory.parents]), 'evidence directory symlink'
    for i, directory in enumerate(directories):
        for other in directories[i + 1:]:
            assert directory != other and directory not in other.parents and other not in directory.parents, 'missing-only evidence must be independent'
    references = read_prerequisites(args)
    def bound(directory, name, expected_hash, *, parse=False):
        file = private_file(directory / name)
        assert sha_file(file) == expected_hash, 'inherited evidence bytes changed: ' + name
        references[str(file)] = expected_hash
        return json.loads(file.read_text()) if parse else None
    first_snapshot = bound(failure, 'c25-final-db-snapshot.json', FAILED_SNAPSHOT_SHA256, parse=True)
    expected = bound(continuation, 'c25-continuation-final-db-snapshot.json', SECOND_SNAPSHOT_SHA256, parse=True)
    first = bound(continuation, 'c25-continuation-protected-rows-private.json', PRIOR_PROTECTED_SHA256, parse=True)
    validate_protected(first, first_snapshot, FAILED_SNAPSHOT_SHA256, prior=True)
    assert_schema(first_snapshot, expected)
    for name, expected_hash in INHERITED_FILES.items():
        for directory in directories:
            bound(directory, name, expected_hash)
    assert json.loads((state / 'c25-prepare-result.json').read_text()).get('passed') is True
    # Both historical scheduled receipts remain failures and are read-only.
    for directory in [failure, continuation]:
        file = private_file(directory / 'c25-scheduled-result.json')
        assert json.loads(file.read_text()).get('passed') is False, 'failed scheduled evidence cannot be promoted'
        references[str(file)] = sha_file(file)
    return state, expected, first, references

def assert_source_quiescent(db):
    assert db.sql("SELECT count(*) FROM pg_stat_activity WHERE datname='eduk12_recovery' AND pid<>pg_backend_pid()") == '0', 'source API or another source connection is still running'

def assert_restore_destination_absent(db, helper):
    assert db.sql('SELECT count(*) FROM pg_database WHERE datname=' + helper.literal(helper.RESTORE_DATABASE), 'postgres') == '0', 'restore destination already exists'

def restore_missing(db, state, prior, first, protected, current_rows, helper, args):
    prerequisites = read_prerequisites(args)
    receipts = {name: json.loads(private_file(state / file).read_text()) for name, file in PHASE_FILES.items()}
    validate_phase_receipts(receipts)
    prerequisites.update({str(state / file): sha_file(state / file) for file in PHASE_FILES.values()})
    result = {'passed': False, 'phase': 'missing-restore', 'prerequisiteSha256': prerequisites, 'checks': []}
    # Call the unchanged helper APIs in their original restore sequence. Its
    # phase dispatcher is deliberately not used: scheduled remains false.
    assert_source_quiescent(db)
    assert_restore_destination_absent(db, helper)
    manifest_path = private_file(state / 'c25-fixture-private.json')
    manifest = json.loads(manifest_path.read_text())
    result['fixtureManifestSha256'] = sha_file(manifest_path)
    observations = db.fixture_observations(manifest)
    result['jointRestoreCases'] = helper.validate_restore_cases(manifest, observations, prior['rows'])
    after = db.snapshot()
    assert len(after['columns']) == 217
    helper.validate_schema_inventory({key: value for key, value in prior.items() if key != 'rows'}, after,
                                     (db.backend / 'prisma/migrations' / helper.MIGRATION / 'migration.sql').read_text())
    out = state / 'c25-missing-new-format-restore'
    out.mkdir(mode=0o700)
    dump = out / 'c25-joint-new-format.dump'
    result['dumpSha256'] = db.dump('eduk12_recovery', dump, 'dump-c25-missing')
    assert db.snapshot() == after, 'source changed during dump'
    db.restore(helper.RESTORE_DATABASE, dump, 'restore-c25-missing')
    restored = db.snapshot(helper.RESTORE_DATABASE)
    # This function itself enforces the exact original 73 physical ordinal
    # differences and three PostgreSQL CHECK parser proofs; no new whitelist.
    result['restoreEquivalence'] = helper.restore_equivalence(after, restored, db, helper.RESTORE_DATABASE)
    restored_cases = db.fixture_observations(manifest, helper.RESTORE_DATABASE)
    assert restored_cases == observations, 'joint fixture full rows changed across restore'
    helper.validate_restore_cases(manifest, restored_cases, prior['rows'])
    helper.validate_old_rows(prior['rows'], db.rows(prior['columns'], helper.RESTORE_DATABASE))
    helper.validate_historical_nulls(prior['rows'], db.rows({table: after['columns'][table] for table in helper.ADDED}, helper.RESTORE_DATABASE))
    result['restoredFullRows'] = verify_restored_rows(db, prior, first, protected, current_rows, helper)
    db.apply_role(helper.RESTORE_DATABASE)
    assert db.snapshot(helper.RESTORE_DATABASE) == restored, 'restricted-role apply changed restored state'
    assert db.snapshot() == after, 'source changed during restore'
    assert sha_file(manifest_path) == result['fixtureManifestSha256']
    assert all(sha_file(Path(file)) == expected for file, expected in prerequisites.items()), 'restore prerequisites changed'
    assert_source_quiescent(db)
    result['sourceQuiescentBeforeAndAfter'] = True
    result['restrictedRoleVerified'] = True
    result['checks'] = ['Original four A/B/C/D restoreCases and C22/C23 frozen identities verified unchanged',
                        'All original 6529, first failed 6582, second failed 6651 full rows retained without exemptions',
                        'Every current source row including new E equals restore; all historical C22 NULLs retained',
                        'Exact original 73-ordinal/three-parser equivalence and restricted-role verification retained']
    result['passed'] = True
    return result

def main():
    parser = argparse.ArgumentParser(description='Fixed C25 missing-only database operations; no migration or services')
    parser.add_argument('--db-helper', required=True, type=Path)
    parser.add_argument('--tools', required=True, type=Path)
    parser.add_argument('--state', required=True, type=Path)
    parser.add_argument('--failure-state', required=True, type=Path)
    parser.add_argument('--continuation-state', required=True, type=Path)
    parser.add_argument('--node', required=True, type=Path)
    parser.add_argument('--contract', required=True, type=Path)
    parser.add_argument('--mode', required=True, choices=['baseline', 'preserve', 'final', 'restore'])
    parser.add_argument('--label', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    assert re.fullmatch(r'c25-missing-[a-z-]+', args.label), 'missing-only output label required'
    if args.mode == 'baseline':
        assert args.label == BASELINE_LABEL, 'baseline has one immutable producer name'
    state = args.state
    assert state.is_absolute() and args.failure_state.is_absolute()
    assert state.is_dir() and args.failure_state.is_dir()
    assert state.resolve() == state and args.failure_state.resolve() == args.failure_state, 'canonical evidence directory paths required'
    assert state != args.failure_state and state not in args.failure_state.parents and args.failure_state not in state.parents, 'continuation evidence must be independent'
    assert all(not part.is_symlink() for directory in [state, args.failure_state] for part in [directory, *directory.parents]), 'evidence directory symlink'
    result_path = state / (args.label + '-result.json')
    # Reserve before importing database helpers or opening a connection.
    descriptor = os.open(result_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    result = {'schemaVersion': 1, 'passed': False, 'mode': args.mode,
              'scope': 'C25_MISSING_ONLY_TRIPLE_BASELINE_FULL_LOGICAL_ROW_PROTECTION',
              'migrationRerun': False, 'immediateWholeFinalRerun': False,
              'inheritedPrepareExecuted': False}
    db = None
    failure = None
    try:
        state, expected, first, references = evidence_inputs(args)
        helper = load_helper(args.db_helper)
        result['helperSha256'] = sha_file(args.db_helper)
        result['inheritedEvidence'] = references
        prior = helper.read_original(state)
        db = helper.Database(args.tools, state)
        capture_path = state / PROTECTED_FILE
        if args.mode == 'baseline':
            assert_source_quiescent(db)
            assert_restore_destination_absent(db, helper)
            actual = db.snapshot()
            assert actual == expected, 'live failed-run database differs before continuation'
            protected = {'schemaVersion': 1, 'secondFailedSnapshotSha256': SECOND_SNAPSHOT_SHA256,
                         'snapshot': actual, 'rows': db.rows(actual['columns'])}
            result['capture'] = validate_protected(protected, expected, SECOND_SNAPSHOT_SHA256)
            summary, _, _ = preserve(db, prior, first, protected, helper)
            record_preservation(result, summary)
            private_json(capture_path, protected)
            result['protectedRowsFile'] = {'name': PROTECTED_FILE, 'sha256': sha_file(capture_path)}
        else:
            baseline_path = private_file(state / (BASELINE_LABEL + '-result.json'))
            baseline = json.loads(baseline_path.read_text())
            assert baseline.get('passed') is True and baseline.get('mode') == 'baseline', 'completed continuation baseline required'
            assert baseline['protectedRowsFile']['name'] == PROTECTED_FILE
            private_file(capture_path)
            assert sha_file(capture_path) == baseline['protectedRowsFile']['sha256'], 'protected full-row evidence changed'
            protected = json.loads(capture_path.read_text())
            validate_protected(protected, expected, SECOND_SNAPSHOT_SHA256)
            result['baselineResultSha256'] = sha_file(baseline_path)
            result['protectedRowsFile'] = baseline['protectedRowsFile']
            summary, actual, current_rows = preserve(db, prior, first, protected, helper)
            record_preservation(result, summary)
            if args.mode == 'restore':
                restored = restore_missing(db, state, prior, first, protected, current_rows, helper, args)
                result.update({key: value for key, value in restored.items() if key != 'passed'})
                after_summary, after, after_rows = preserve(db, prior, first, protected, helper)
                record_preservation(result, after_summary)
                assert after == actual and after_rows == current_rows, 'live source changed during restore'
                result['sourceUnchangedDuringRestore'] = True
            elif args.mode == 'final':
                snapshot_path = state / 'c25-missing-final-db-snapshot.json'
                private_json(snapshot_path, actual)
                result['finalSnapshot'] = {'name': snapshot_path.name, 'sha256': sha_file(snapshot_path)}
                result['snapshotSha256'] = result['finalSnapshot']['sha256']
        assert all(sha_file(Path(file)) == expected_hash for file, expected_hash in references.items()), 'inherited evidence changed during continuation audit'
        assert sha_file(args.db_helper) == result['helperSha256'], 'immutable database helper changed'
        result['passed'] = True
    except BaseException as error:
        failure = error
        result['passed'] = False
        result['errorType'] = type(error).__name__
        with open(state / (args.label + '-error-private.log'), 'x') as handle:
            os.chmod(handle.name, 0o600)
            handle.write(traceback.format_exc())
    finally:
        result['processExits'] = db.exits if db is not None else {}
        with os.fdopen(descriptor, 'w') as handle:
            json.dump(result, handle, indent=2)
    print(json.dumps({'passed': result['passed'], 'mode': args.mode,
                      'result': result_path.name, 'resultSha256': sha_file(result_path)}))
    if failure is not None:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
`

export const inlinePythonSha256=createHash('sha256').update(INLINE_PYTHON).digest('hex')

export function invocation(argv){
 const names=['python','node','db-helper','contract','tools','state','failure-state','continuation-state','mode','label'],values={}
 assert.equal(argv.length,names.length*2,'exact missing-only DB arguments required')
 for(let i=0;i<argv.length;i+=2){const name=argv[i]?.replace(/^--/,'');assert.ok(argv[i]?.startsWith('--')&&names.includes(name)&&!Object.hasOwn(values,name),'unknown or duplicate missing-only DB argument');assert.ok(argv[i+1]&&!argv[i+1].startsWith('--'));values[name]=argv[i+1]}
 for(const name of ['python','node','db-helper','contract','tools','state','failure-state','continuation-state'])assert.ok(path.isAbsolute(values[name]),`${name} must be absolute`)
 for(const name of ['state','failure-state','continuation-state'])assert.equal(path.resolve(values[name]),values[name],'canonical evidence directory paths required')
 const within=(parent,child)=>{const relative=path.relative(parent,child);return !relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))}
 assert.ok(!within(values.state,values['failure-state'])&&!within(values['failure-state'],values.state),'continuation evidence must be independent')
 assert.equal(values['db-helper'],path.join(path.dirname(fileURLToPath(import.meta.url)),'c25-db.py'),'only the immutable sibling database helper is allowed')
 assert.equal(values.node,path.join(values.tools,'node_modules/node/bin/node'),'only the bound official Node binary is allowed')
 assert.equal(values.contract,path.join(path.dirname(fileURLToPath(import.meta.url)),'c25-missing-contract.mjs'),'only the bound sibling prerequisite contract is allowed')
 for(const key of ['failure-state','continuation-state'])assert.ok(!within(values.state,values[key])&&!within(values[key],values.state),'missing-only evidence must be independent')
 assert.ok(!within(values['failure-state'],values['continuation-state'])&&!within(values['continuation-state'],values['failure-state']),'historical evidence directories must be independent')
 assert.ok(['baseline','preserve','final','restore'].includes(values.mode))
 assert.match(values.label,/^c25-missing-[a-z-]+$/)
 if(values.mode==='baseline')assert.equal(values.label,BASELINE_LABEL)
 return {python:values.python,args:['-B','-c',INLINE_PYTHON,...names.filter(name=>name!=='python').flatMap(name=>['--'+name,values[name]])]}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  process.umask(0o077)
  const command=invocation(process.argv.slice(2))
  assert.ok(fs.statSync(command.python).isFile(),'bound Python interpreter missing')
  // Inherit the launcher's process group so its aggregate deadline terminates
  // both this wrapper and every psql/pg_dump/pg_restore descendant.
  const result=spawnSync(command.python,command.args,{stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
  if(result.error)throw result.error
  process.exitCode=result.status===0&&!result.signal?0:1
 }catch(error){console.error(JSON.stringify({passed:false,errorType:error.name,message:'Missing-only database adapter failed; inspect private launcher logs.'}));process.exitCode=1}
}
