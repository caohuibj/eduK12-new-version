/** Read-only C19 supplement audits over the accepted C25 core. Importing this
 * adapter is inert. The launcher owns the aggregate 300-second process-group
 * deadline; no restore, migration, producer or service mode is exposed here. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {INLINE_PYTHON as MISSING_INLINE_PYTHON} from './c25-missing-db.mjs'
import {analysisState,coreState,coreSnapshotSha256} from './c25-analysis-contract.mjs'

const directory=path.dirname(fileURLToPath(import.meta.url))
export const CORE_SNAPSHOT_SHA256=coreSnapshotSha256
export const BASELINE_LABEL='c25-analysis-audit-baseline'
export const DB_TIMEOUT_MS=295000
export const INLINE_PYTHON=String.raw`
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import traceback

sys.dont_write_bytecode = True
# Reuse the exact immutable missing-only helpers without executing its main,
# restore dispatcher or historical-row readers. Only one fresh full-row capture
# is written; the old 6,529 / 6,582 / 6,651-row files are never copied or parsed.
missing = {'__name__': 'c25_analysis_inherited_helper_library'}
exec(compile(${JSON.stringify(MISSING_INLINE_PYTHON)}, '<immutable-missing-inline>', 'exec'), missing)
sha_file = missing['sha_file']
digest = missing['digest']
private_file = missing['private_file']
private_json = missing['private_json']
load_helper = missing['load_helper']
assert_projection = missing['assert_projection']
assert_schema = missing['assert_schema']
assert_source_quiescent = missing['assert_source_quiescent']
ANALYSIS_STATE = Path(${JSON.stringify(analysisState)})
CORE_STATE = Path(${JSON.stringify(coreState)})
DB_HELPER = Path(${JSON.stringify(path.join(directory,'c25-db.py'))})
CONTRACT = Path(${JSON.stringify(path.join(directory,'c25-analysis-contract.mjs'))})
CORE_SNAPSHOT_SHA256 = ${JSON.stringify(CORE_SNAPSHOT_SHA256)}
BASELINE_LABEL = ${JSON.stringify(BASELINE_LABEL)}
PROTECTED_FILE = 'c25-analysis-protected-rows-private.json'
SCOPE = 'C25_C19_ACCEPTED_CORE_FULL_LOGICAL_ROW_PROTECTION'
COUNTS = {'training_attempt_checkpoints': 21, 'composite_report_jobs': 148,
          'export_batches': 42, 'export_artifacts': 42,
          'submission_idempotency_receipts': 0, 'checkin_submission_idempotency_receipts': 0}

def validate_accepted_snapshot(snapshot):
    assert set(snapshot['columns']) == set(snapshot['projection']) == set(snapshot['columnMetadata']), 'accepted table inventory differs'
    assert len(snapshot['columns']) == 217, 'accepted table count differs'
    assert all(type(item['rows']) is int and item['rows'] >= 0 for item in snapshot['projection'].values()), 'invalid accepted row count'
    assert sum(item['rows'] for item in snapshot['projection'].values()) == 6667, 'accepted row count differs'
    for table, count in COUNTS.items():
        assert snapshot['projection'][table]['rows'] == count, 'accepted protected count differs: ' + table

def validate_protected(document, expected):
    assert set(document) == {'schemaVersion', 'coreSnapshotSha256', 'snapshot', 'rows'}, 'unexpected protected evidence shape'
    assert type(document['schemaVersion']) is int and document['schemaVersion'] == 1
    assert document['coreSnapshotSha256'] == CORE_SNAPSHOT_SHA256, 'accepted core snapshot identity differs'
    assert document['snapshot'] == expected, 'protected snapshot differs from accepted core final snapshot'
    validate_accepted_snapshot(expected)
    result = missing['validate_capture'](document['snapshot'], document['rows'], count=6667, checkpoints=21)
    result.update(reportJobs=148, exportBatches=42, exportArtifacts=42)
    return result

def preservation_summary(actual, current_rows, protected, helper):
    assert_schema(protected['snapshot'], actual)
    assert_projection(actual, current_rows)
    # Original Counter-based full logical rows: no table, column, timestamp,
    # ciphertext, report job, export or shared-budget singleton exemptions.
    helper.validate_old_rows(protected['rows'], current_rows)
    assert helper.row_counter(current_rows['training_attempt_checkpoints']) == helper.row_counter(protected['rows']['training_attempt_checkpoints']), 'checkpoint inventory changed; no new checkpoint is allowed'
    return {'allCoreRowsRetained': True, 'oldTables': 217, 'oldRows': 6667,
            'checkpointRows': 21, 'allCheckpointRowsExact': True,
            'allColumnsProtected': True, 'noColumnOrTableExemptions': True,
            'liveSchemaExact': True, 'protectedRowsSha256': digest(protected['rows']),
            'currentRows': sum(map(len, current_rows.values())), 'currentSnapshotSha256': digest(actual)}

def preserve(db, protected, helper):
    actual = db.snapshot()
    assert_schema(protected['snapshot'], actual)
    current_rows = db.rows(protected['snapshot']['columns'])
    return preservation_summary(actual, current_rows, protected, helper), actual

def prerequisite_command(args):
    assert args.node == args.tools / 'node_modules/node/bin/node', 'exact bound official Node required'
    assert args.db_helper == DB_HELPER, 'exact immutable sibling database helper required'
    assert args.contract == CONTRACT, 'exact sibling analysis contract required'
    return [str(args.node), str(args.contract), '--validate-prerequisites', str(args.state)]

def read_prerequisites(args):
    command = prerequisite_command(args)
    file = private_file(args.state / 'c25-analysis-prerequisites.json')
    before = sha_file(file)
    inputs = {str(candidate): sha_file(candidate) for candidate in [args.node, args.contract, args.db_helper.parent / 'c25-missing-contract.mjs', args.db_helper.parent / 'c25-missing-db.mjs']}
    run = subprocess.run(command, text=True, capture_output=True, timeout=30,
                         env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
    assert run.returncode == 0, 'hash-bound analysis prerequisites rejected'
    assert json.loads(run.stdout) == {'valid': True,
        'scope': 'C25_C19_SUPPRESSED_ANALYSIS_AND_DOWNLOADED_LONG_CSV_ONLY',
        'sourceRows': 6667, 'sourceSnapshotSha256': CORE_SNAPSHOT_SHA256}, 'analysis prerequisite validator identity differs'
    assert sha_file(file) == before, 'analysis prerequisites changed while validating'
    assert all(sha_file(Path(name)) == expected for name, expected in inputs.items()), 'prerequisite validator inputs changed'
    value = json.loads(file.read_text())
    assert value['sourceRows'] == 6667 and value['sourceCheckpoints'] == 21
    assert value['sourceSnapshotSha256'] == CORE_SNAPSHOT_SHA256
    return value, {str(file): before, **inputs}

def evidence_inputs(args):
    assert args.state == ANALYSIS_STATE and args.core_state == CORE_STATE, 'only fixed independent analysis/core evidence is allowed'
    for directory in [args.state, args.core_state]:
        assert directory.is_absolute() and directory.is_dir() and directory.resolve() == directory
        assert all(not part.is_symlink() for part in [directory, *directory.parents]), 'evidence directory symlink'
    assert args.state != args.core_state and args.state not in args.core_state.parents and args.core_state not in args.state.parents
    # This exact Node validation must finish before importing the DB helper or
    # issuing SQL. It binds accepted core audit/restore and inherited facts.
    prerequisites, references = read_prerequisites(args)
    for name in ['c25-original-rows-private.json', 'c25-continuation-protected-rows-private.json', 'c25-missing-protected-rows-private.json']:
        assert not (args.state / name).exists(), 'historical full-row baselines must not be copied'
    for group in [prerequisites['references'], prerequisites['historical']['references']]:
        for name, binding in group.items():
            file = private_file(Path(name))
            assert binding['path'] == name and sha_file(file) == binding['sha256'], 'accepted evidence binding changed'
            references[name] = binding['sha256']
    snapshot_file = private_file(args.core_state / 'c25-missing-final-db-snapshot.json')
    assert references[str(snapshot_file)] == CORE_SNAPSHOT_SHA256
    expected = json.loads(snapshot_file.read_text())
    validate_accepted_snapshot(expected)
    audit = json.loads(private_file(args.core_state / 'c25-missing-audit-final-result.json').read_text())
    inherited = {'execution': 'INHERITED_ACCEPTED_CORE_AUDIT_AND_RESTORE',
                 'sourceSnapshotSha256': CORE_SNAPSHOT_SHA256,
                 'accepted': prerequisites['accepted'],
                 **{key: audit[key] for key in ['retainedFacts', 'continuationRetainedFacts', 'missingRetainedFacts']}}
    return expected, inherited, references

def read_protected(state, expected):
    baseline_path = private_file(state / (BASELINE_LABEL + '-result.json'))
    baseline = json.loads(baseline_path.read_text())
    assert baseline.get('schemaVersion') == 1 and baseline.get('passed') is True and baseline.get('mode') == 'baseline', 'completed analysis baseline required'
    assert baseline.get('scope') == SCOPE and baseline.get('coreSnapshotSha256') == CORE_SNAPSHOT_SHA256
    assert baseline['protectedRowsFile']['name'] == PROTECTED_FILE
    capture_path = private_file(state / PROTECTED_FILE)
    before = sha_file(capture_path)
    assert before == baseline['protectedRowsFile']['sha256'], 'protected full-row evidence changed'
    protected = json.loads(capture_path.read_text())
    assert sha_file(capture_path) == before, 'protected full-row evidence changed while parsing'
    validate_protected(protected, expected)
    return protected, baseline['protectedRowsFile'], {str(baseline_path): sha_file(baseline_path), str(capture_path): before}

def main():
    parser = argparse.ArgumentParser(description='Read-only accepted-core C19 supplement audits')
    for name in ['db-helper', 'tools', 'state', 'core-state', 'node', 'contract']:
        parser.add_argument('--' + name, required=True, type=Path)
    parser.add_argument('--mode', required=True, choices=['baseline', 'preserve', 'final'])
    parser.add_argument('--label', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    assert re.fullmatch(r'c25-analysis-[a-z-]+', args.label), 'analysis-only output label required'
    if args.mode == 'baseline':
        assert args.label == BASELINE_LABEL, 'baseline has one immutable producer name'
    else:
        assert args.label != BASELINE_LABEL, 'baseline label is exclusive to baseline mode'
    assert args.state == ANALYSIS_STATE and args.core_state == CORE_STATE
    assert args.state.is_dir() and all(not part.is_symlink() for part in [args.state, *args.state.parents])
    result_path = args.state / (args.label + '-result.json')
    descriptor = os.open(result_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    result = {'schemaVersion': 1, 'passed': False, 'mode': args.mode, 'scope': SCOPE,
              'coreSnapshotSha256': CORE_SNAPSHOT_SHA256, 'migrationRerun': False,
              'newDatabaseRestoreExecuted': False, 'historicalBaselinesCopied': False}
    db = None
    failure = None
    try:
        expected, inherited, references = evidence_inputs(args)
        result['inheritedCorePreservation'] = inherited
        # Keep the unchanged finish_database API while making its provenance
        # explicit: this 6,529-row proof is accepted, not freshly re-executed.
        # The new protectedCoreFacts independently retains every one of the
        # accepted core's 6,667 full rows, which includes those historical rows.
        result['retainedFacts'] = inherited['retainedFacts']
        result['retainedFactsExecution'] = inherited['execution']
        result['inheritedEvidence'] = references
        result['helperSha256'] = sha_file(args.db_helper)
        helper = load_helper(args.db_helper)
        db = helper.Database(args.tools, args.state)
        db.env['PGOPTIONS'] += ' -c default_transaction_read_only=on'
        result['databaseReadOnly'] = True
        if args.mode in ['baseline', 'final']:
            assert_source_quiescent(db)
        if args.mode == 'baseline':
            actual = db.snapshot()
            assert actual == expected, 'live database differs from accepted core final snapshot before supplement'
            protected = {'schemaVersion': 1, 'coreSnapshotSha256': CORE_SNAPSHOT_SHA256,
                         'snapshot': actual, 'rows': db.rows(actual['columns'])}
            result['capture'] = validate_protected(protected, expected)
            summary = preservation_summary(actual, protected['rows'], protected, helper)
            capture_path = args.state / PROTECTED_FILE
            private_json(capture_path, protected)
            result['protectedRowsFile'] = {'name': PROTECTED_FILE, 'sha256': sha_file(capture_path)}
        else:
            protected, result['protectedRowsFile'], baseline_references = read_protected(args.state, expected)
            references.update(baseline_references)
            result['baselineResultSha256'] = references[str(args.state / (BASELINE_LABEL + '-result.json'))]
            summary, actual = preserve(db, protected, helper)
            if args.mode == 'final':
                # Record the real partial or successful final state. A failed
                # HTTP phase is not promoted by a successful preservation audit.
                snapshot_path = args.state / 'c25-analysis-final-db-snapshot.json'
                private_json(snapshot_path, actual)
                result['finalSnapshot'] = {'name': snapshot_path.name, 'sha256': sha_file(snapshot_path)}
                result['snapshotSha256'] = result['finalSnapshot']['sha256']
        result['protectedCoreFacts'] = summary
        result['currentRows'] = summary['currentRows']
        result['currentSnapshotSha256'] = summary['currentSnapshotSha256']
        assert all(sha_file(Path(file)) == expected_hash for file, expected_hash in references.items()), 'accepted evidence changed during analysis audit'
        assert sha_file(args.db_helper) == result['helperSha256'], 'immutable database helper changed'
        result['passed'] = True
    except BaseException as error:
        failure = error
        result['errorType'] = type(error).__name__
        with open(args.state / (args.label + '-error-private.log'), 'x') as handle:
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
 const names=['python','node','db-helper','contract','tools','state','core-state','mode','label'],values={}
 assert.equal(argv.length,names.length*2,'exact analysis-only DB arguments required')
 for(let i=0;i<argv.length;i+=2){const name=argv[i]?.replace(/^--/,'');assert.ok(argv[i]?.startsWith('--')&&names.includes(name)&&!Object.hasOwn(values,name),'unknown or duplicate analysis-only DB argument');assert.ok(argv[i+1]&&!argv[i+1].startsWith('--'));values[name]=argv[i+1]}
 for(const name of ['python','node','db-helper','contract','tools','state','core-state']){assert.ok(path.isAbsolute(values[name]),`${name} must be absolute`);assert.equal(path.resolve(values[name]),values[name],`${name} must be canonical`)}
 assert.equal(values.state,analysisState,'only the fixed new analysis evidence directory is allowed')
 assert.equal(values['core-state'],coreState,'only the pinned accepted core evidence is allowed')
 assert.equal(values['db-helper'],path.join(directory,'c25-db.py'),'only the immutable sibling database helper is allowed')
 assert.equal(values.node,path.join(values.tools,'node_modules/node/bin/node'),'only the bound official Node binary is allowed')
 assert.equal(values.contract,path.join(directory,'c25-analysis-contract.mjs'),'only the sibling analysis prerequisite contract is allowed')
 assert.ok(['baseline','preserve','final'].includes(values.mode),'restore and migration are unavailable')
 assert.match(values.label,/^c25-analysis-[a-z-]+$/)
 if(values.mode==='baseline')assert.equal(values.label,BASELINE_LABEL)
 assert.ok(values.mode==='baseline'||values.label!==BASELINE_LABEL,'baseline label is exclusive to baseline mode')
 return {python:values.python,node:values.node,args:['-B','-c',INLINE_PYTHON,...names.filter(name=>name!=='python').flatMap(name=>['--'+name,values[name]])]}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  process.umask(0o077)
  const command=invocation(process.argv.slice(2))
  assert.equal(process.execPath,command.node,'adapter must run under the exact bound Node')
  assert.ok(fs.statSync(command.python).isFile(),'bound Python interpreter missing')
  // Do not detach: all psql descendants stay in the launcher's process group.
  // The outer aggregate 300-second deadline remains authoritative; this local
  // hard bound cannot prolong it or create an unbounded spawnSync child.
  const result=spawnSync(command.python,command.args,{stdio:'inherit',detached:false,timeout:DB_TIMEOUT_MS,killSignal:'SIGKILL',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
  if(result.error)throw result.error
  process.exitCode=result.status===0&&!result.signal?0:1
 }catch(error){console.error(JSON.stringify({passed:false,errorType:error.name,message:'Analysis database audit failed; inspect private launcher logs.'}));process.exitCode=1}
}
