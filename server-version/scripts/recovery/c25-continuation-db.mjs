/** Continuation-only database adapter. The launcher binds this complete source,
 * the exact inline program, interpreter and unchanged Python helper closure.
 * No migration, fixture FINAL, report drain or service startup is exposed here. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

export const FAILED_SNAPSHOT_SHA256='4ab9189d33c04e7aae7cd1b80d6e390246672eaa9841b5dac887bbbb1fbcc3b1'
export const BASELINE_LABEL='c25-continuation-audit-baseline'
export const INLINE_PYTHON=String.raw`
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
import traceback

sys.dont_write_bytecode = True
FAILED_SNAPSHOT_SHA256 = '4ab9189d33c04e7aae7cd1b80d6e390246672eaa9841b5dac887bbbb1fbcc3b1'
BASELINE_LABEL = 'c25-continuation-audit-baseline'
PROTECTED_FILE = 'c25-continuation-protected-rows-private.json'
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
    spec = importlib.util.spec_from_file_location('c25_continuation_immutable_db', file)
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

def validate_capture(snapshot, rows):
    assert_projection(snapshot, rows)
    assert len(snapshot['columns']) == 217, 'failed-run table count differs'
    assert sum(map(len, rows.values())) == 6582, 'failed-run full-row count differs'
    assert len(rows['training_attempt_checkpoints']) == 17, 'failed-run checkpoint count differs'
    for table in CLEANUP_TABLES:
        assert not rows[table], 'immediate startup receipt cleanup could delete protected rows: ' + table
    return {'tables': 217, 'rows': 6582, 'checkpoints': 17,
            'allColumnsProtected': True, 'immediateCleanupReceiptTablesEmpty': True}

def validate_protected(document, expected, expected_sha):
    assert set(document) == {'schemaVersion', 'failedSnapshotSha256', 'snapshot', 'rows'}
    assert document['schemaVersion'] == 1 and document['failedSnapshotSha256'] == expected_sha
    assert document['snapshot'] == expected, 'protected snapshot differs from failed-run final snapshot'
    return validate_capture(document['snapshot'], document['rows'])

def assert_schema(expected, actual):
    assert set(actual) == set(expected), 'live snapshot shape changed'
    assert {key: value for key, value in actual.items() if key != 'projection'} == {
        key: value for key, value in expected.items() if key != 'projection'
    }, 'live schema changed; restore-only normalization is forbidden here'

def preserve(db, prior, protected, helper):
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
    helper.validate_old_rows(protected['rows'], current_rows)
    summary = {'originalHTTP03': inherited,
               'failedRun': {'tables': 217, 'rows': 6582, 'checkpoints': 17,
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
        'protectedRowsSha256': summary['failedRun']['protectedRowsSha256'],
    }
    result['currentRows'] = summary['currentRows']
    result['currentSnapshotSha256'] = summary['currentSnapshotSha256']

def verify_restored_rows(db, prior, protected, source_rows, helper):
    restored_rows = db.rows(protected['snapshot']['columns'], helper.RESTORE_DATABASE)
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
    return {'failedRunFullRowsRetained': 6582, 'originalHTTP03FullRowsRetained': 6529,
            'allPostContinuationFullRowsEqual': True, 'tables': 217,
            'postContinuationRows': sum(map(len, source_rows.values()))}

def evidence_inputs(args):
    assert args.expected_failed_snapshot_sha256 == FAILED_SNAPSHOT_SHA256, 'unreviewed failed-run snapshot'
    state, failure = Path(args.state), Path(args.failure_state)
    assert state.is_absolute() and failure.is_absolute() and state.is_dir() and failure.is_dir()
    assert state != failure and state not in failure.parents and failure not in state.parents, 'continuation evidence must be independent'
    for directory in [state, failure]:
        assert all(not part.is_symlink() for part in [directory, *directory.parents]), 'evidence directory symlink'
    expected_path = private_file(failure / 'c25-final-db-snapshot.json')
    assert sha_file(expected_path) == args.expected_failed_snapshot_sha256
    expected = json.loads(expected_path.read_text())
    references = {str(expected_path): sha_file(expected_path)}
    for name, expected_hash in INHERITED_FILES.items():
        old, copied = private_file(failure / name), private_file(state / name)
        assert sha_file(old) == sha_file(copied) == expected_hash, 'inherited evidence bytes changed: ' + name
        references[str(old)] = expected_hash
        references[str(copied)] = expected_hash
    assert json.loads((state / 'c25-prepare-result.json').read_text()).get('passed') is True
    return state, expected, references

def main():
    parser = argparse.ArgumentParser(description='Fixed C25 continuation database operations; no migration or services')
    parser.add_argument('--db-helper', required=True, type=Path)
    parser.add_argument('--tools', required=True, type=Path)
    parser.add_argument('--state', required=True, type=Path)
    parser.add_argument('--failure-state', required=True, type=Path)
    parser.add_argument('--expected-failed-snapshot-sha256', required=True)
    parser.add_argument('--mode', required=True, choices=['baseline', 'preserve', 'final', 'restore'])
    parser.add_argument('--label', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    assert re.fullmatch(r'c25-continuation-[a-z-]+', args.label), 'continuation output label required'
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
              'scope': 'C25_CONTINUATION_DUAL_BASELINE_FULL_LOGICAL_ROW_PROTECTION',
              'migrationRerun': False, 'immediateWholeFinalRerun': False,
              'inheritedPrepareExecuted': False}
    db = None
    failure = None
    try:
        state, expected, references = evidence_inputs(args)
        helper = load_helper(args.db_helper)
        result['helperSha256'] = sha_file(args.db_helper)
        result['inheritedEvidence'] = references
        prior = helper.read_original(state)
        db = helper.Database(args.tools, state)
        capture_path = state / PROTECTED_FILE
        if args.mode == 'baseline':
            actual = db.snapshot()
            assert actual == expected, 'live failed-run database differs before continuation'
            protected = {'schemaVersion': 1, 'failedSnapshotSha256': args.expected_failed_snapshot_sha256,
                         'snapshot': actual, 'rows': db.rows(actual['columns'])}
            result['capture'] = validate_protected(protected, expected, args.expected_failed_snapshot_sha256)
            summary, _, _ = preserve(db, prior, protected, helper)
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
            validate_protected(protected, expected, args.expected_failed_snapshot_sha256)
            result['baselineResultSha256'] = sha_file(baseline_path)
            result['protectedRowsFile'] = baseline['protectedRowsFile']
            summary, actual, current_rows = preserve(db, prior, protected, helper)
            record_preservation(result, summary)
            if args.mode == 'restore':
                # The unchanged implementation checks all prerequisites, four
                # fixtures and the exact 73-ordinal / three-parser whitelist.
                helper.phase(db, state, 'restore')
                result['restoreResultSha256'] = sha_file(state / 'c25-restore-result.json')
                result['restoredFullRows'] = verify_restored_rows(db, prior, protected, current_rows, helper)
                after_summary, after, after_rows = preserve(db, prior, protected, helper)
                record_preservation(result, after_summary)
                assert after == actual and after_rows == current_rows, 'live source changed during restore'
                result['sourceUnchangedDuringRestore'] = True
            elif args.mode == 'final':
                snapshot_path = state / 'c25-continuation-final-db-snapshot.json'
                private_json(snapshot_path, actual)
                result['finalSnapshot'] = {'name': snapshot_path.name, 'sha256': sha_file(snapshot_path)}
                result['snapshotSha256'] = result['finalSnapshot']['sha256']
        assert all(sha_file(Path(file)) == expected_hash for file, expected_hash in references.items()), 'inherited evidence changed during continuation audit'
        assert sha_file(args.db_helper) == result['helperSha256'], 'immutable database helper changed'
        result['passed'] = True
    except BaseException as error:
        failure = error
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
 const names=['python','db-helper','tools','state','failure-state','expected-failed-snapshot-sha256','mode','label'],values={}
 assert.equal(argv.length,names.length*2,'exact continuation DB arguments required')
 for(let i=0;i<argv.length;i+=2){const name=argv[i]?.replace(/^--/,'');assert.ok(argv[i]?.startsWith('--')&&names.includes(name)&&!Object.hasOwn(values,name),'unknown or duplicate continuation DB argument');assert.ok(argv[i+1]&&!argv[i+1].startsWith('--'));values[name]=argv[i+1]}
 for(const name of ['python','db-helper','tools','state','failure-state'])assert.ok(path.isAbsolute(values[name]),`${name} must be absolute`)
 for(const name of ['state','failure-state'])assert.equal(path.resolve(values[name]),values[name],'canonical evidence directory paths required')
 const within=(parent,child)=>{const relative=path.relative(parent,child);return !relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))}
 assert.ok(!within(values.state,values['failure-state'])&&!within(values['failure-state'],values.state),'continuation evidence must be independent')
 assert.equal(values['db-helper'],path.join(path.dirname(fileURLToPath(import.meta.url)),'c25-db.py'),'only the immutable sibling database helper is allowed')
 assert.equal(values['expected-failed-snapshot-sha256'],FAILED_SNAPSHOT_SHA256)
 assert.ok(['baseline','preserve','final','restore'].includes(values.mode))
 assert.match(values.label,/^c25-continuation-[a-z-]+$/)
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
 }catch(error){console.error(JSON.stringify({passed:false,errorType:error.name,message:'Continuation database adapter failed; inspect private launcher logs.'}));process.exitCode=1}
}
