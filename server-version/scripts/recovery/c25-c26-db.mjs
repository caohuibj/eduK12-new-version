/** Read-only C26 audits. The original launcher owns the 300s process group and
 * 1200s overall deadline. No restore, migration, API or worker is started here. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {INLINE_PYTHON as ANALYSIS_INLINE_PYTHON} from './c25-analysis-db.mjs'

const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../../../..')
export const STATE=path.join(root,'eduk12_c26_a_05')
export const BASELINE_LABEL='c25-c26-audit-baseline',DB_TIMEOUT_MS=295000
export const CORE_SNAPSHOT_SHA256='2116f582580ab67d0c5f69330d73300b026a3eaeeacf94a47f268aa16b244e85'
export const PRIMARY_SNAPSHOT_SHA256='f4e761419f5faf4a84befef265b4edff45d49d5a1d16a89cc09d039b1eed34b4'
export const INLINE_PYTHON=String.raw`
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import traceback

sys.dont_write_bytecode = True
original = {'__name__': 'c26_immutable_analysis_library'}
exec(compile(${JSON.stringify(ANALYSIS_INLINE_PYTHON)}, '<immutable-analysis-inline>', 'exec'), original)
sha_file, digest, private_file = (original[key] for key in ['sha_file', 'digest', 'private_file'])
load_helper, assert_projection, assert_schema = (original[key] for key in ['load_helper', 'assert_projection', 'assert_schema'])
STATE, ROOT, DB_HELPER = Path(${JSON.stringify(STATE)}), Path(${JSON.stringify(root)}), Path(${JSON.stringify(path.join(directory,'c25-db.py'))})
CORE_SNAPSHOT_SHA256, PRIMARY_SNAPSHOT_SHA256 = ${JSON.stringify(CORE_SNAPSHOT_SHA256)}, ${JSON.stringify(PRIMARY_SNAPSHOT_SHA256)}
BASELINE_LABEL, PROTECTED_FILE = ${JSON.stringify(BASELINE_LABEL)}, 'c25-c26-protected-rows-private.json'
WORKING, PRIMARY = 'eduk12_c25_joint_restore', 'eduk12_recovery'
QUEUE, CHECKPOINTS = 'composite_report_queue_budget', 'training_attempt_checkpoints'
SCOPE = 'C26_A_WORKING_6667_FULL_ROW_AND_PRIMARY_6708_EXACT_PROTECTION'
RESTORE_RECEIPT = 'eduk12_c25_continuation_02/c25-missing-restore-result.json'
RESTORE_RECEIPT_SHA256 = '6a57f6ae2d261a58b93fde9d1561282df1c6095bad0e7e9b00a85ae1076d868d'
PINNED = {
    'eduk12_c25_continuation_02/c25-missing-final-db-snapshot.json': CORE_SNAPSHOT_SHA256,
    'eduk12_c25_analysis_02/c25-analysis-resume-final-db-snapshot.json': PRIMARY_SNAPSHOT_SHA256,
    'eduk12_c25_http_01/c25-original-rows-private.json': '0948a2bedad3c87c6dc27f4cd325f59d866c92e659332cdf427800a428d0697c',
    'eduk12_c25_continuation_01/c25-continuation-protected-rows-private.json': '231c52d48d8533d17ebbb9c9563b56c7be7652bdd99a061e20f82ebe8b725f16',
    'eduk12_c25_continuation_02/c25-missing-protected-rows-private.json': 'd149f7203b0f9b01bc7d80a2d422674b2b6af7cc2213b7435192087e63889304',
    RESTORE_RECEIPT: RESTORE_RECEIPT_SHA256,
}

def private_json(file, value):
    # Same exclusive, durable capture contract as the analysis-resume adapter.
    descriptor = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        json.dump(value, handle, indent=2)
        handle.flush()
        os.fsync(handle.fileno())

def binding(file):
    return {'name': file.name, 'sha256': sha_file(private_file(file))}

def evidence_inputs(state):
    references = {str(ROOT / name): expected for name, expected in PINNED.items()}
    for name, expected in references.items():
        assert sha_file(private_file(Path(name))) == expected, 'accepted evidence changed'
    for name in ['runtime-private.json', 'status.json']:
        file = private_file(state / name)
        references[str(file)] = sha_file(file)
    references[str(DB_HELPER)] = sha_file(DB_HELPER)
    # Historical full-row files are referenced and hashed, never copied/parsed.
    assert not any((state / Path(name).name).exists() for name in list(PINNED)[2:]), 'historical baseline copy is forbidden'
    expected = [json.loads((ROOT / name).read_text()) for name in list(PINNED)[:2]]
    original['validate_accepted_snapshot'](expected[0])
    assert len(expected[1]['columns']) == 217 and sum(v['rows'] for v in expected[1]['projection'].values()) == 6708
    assert expected[1]['projection'][CHECKPOINTS]['rows'] == 21
    return expected[0], expected[1], references, json.loads((ROOT / RESTORE_RECEIPT).read_text())

def capture_live(db, state, label, mode):
    # Both full working captures are durable BEFORE any preservation assertion.
    snapshot = db.snapshot(WORKING)
    snapshot_file = state / ('c25-c26-final-db-snapshot.json' if mode == 'final' else label + '-db-snapshot.json')
    private_json(snapshot_file, snapshot)
    rows = db.rows(snapshot['columns'], WORKING)
    capture = {'schemaVersion': 1, 'coreSnapshotSha256': CORE_SNAPSHOT_SHA256, 'snapshot': snapshot, 'rows': rows}
    rows_file = state / (PROTECTED_FILE if mode == 'baseline' else label + '-rows-private.json')
    private_json(rows_file, capture)
    return capture, binding(rows_file), binding(snapshot_file)

def primary_snapshot(db, state, label):
    actual = db.snapshot(PRIMARY)
    file = state / (label + '-primary-db-snapshot.json')
    private_json(file, actual)
    return actual, binding(file)

def assert_quiescent(db):
    assert db.sql("SELECT count(*) FROM pg_stat_activity WHERE datname IN ('eduk12_c25_joint_restore','eduk12_recovery') AND pid<>pg_backend_pid()", 'postgres') == '0', 'API, driver, observer or another DB connection is still running'

def expected_restored_snapshot(source, receipt):
    # Admission only. The historical server already proved these exact parser
    # pairs; no TEMP DDL or normalization is performed by this read-only audit.
    assert receipt['passed'] is True and receipt['restrictedRoleVerified'] is True and receipt['sourceUnchangedDuringRestore'] is True
    assert receipt['currentSnapshotSha256'] == digest(source), 'restore receipt source snapshot differs'
    proof = receipt['restoreEquivalence']
    assert set(proof) == {'columnOrdinals', 'constraintReparses'}
    assert len(proof['columnOrdinals']) == 73 and digest(proof['columnOrdinals']) == 'a805204ce99aeafcd5ec97857f19a5ad02e05d2396f9f34324d03bf3b5b8838a', 'unknown historical ordinal proof'
    assert len(proof['constraintReparses']) == 3 and digest(proof['constraintReparses']) == 'dc87f23a38b0498793dc094f39683fa34e3a4f6571bd38fde0cc5d6fe09595cc', 'unknown historical parser proof'
    expected = copy.deepcopy(source)
    for difference in proof['columnOrdinals']:
        column = expected['columnMetadata'][difference['table']][difference['visibleRank'] - 1]
        assert column['column'] == difference['column'] and column['ordinal'] == difference['sourceOrdinal']
        assert difference['restoredOrdinal'] == difference['visibleRank']
        column['ordinal'] = difference['restoredOrdinal']
    login = "CHECK (((length(login_name) >= 4) AND (length(login_name) <= 32) AND (normalized_login = lower(TRIM(BOTH FROM login_name))) AND (normalized_login ~ '^[a-z0-9_.-]{4,32}$'::text)))"
    definitions = {
        ('campus_accounts', 'campus_accounts_login_shape_check'): login,
        ('survey_accounts', 'survey_login_shape_check'): login,
        ('huiteacher_improvement_actions', 'huiteacher_improvement_actions_cipher_check'): 'CHECK (((length(goal_cipher) >= 30) AND (length(goal_cipher) <= 30000) AND ((length(plan_cipher) >= 30) AND (length(plan_cipher) <= 100000))))',
    }
    for difference in proof['constraintReparses']:
        matches = [c for c in expected['constraints'] if (c['table'], c['name']) == (difference['table'], difference['name'])]
        assert len(matches) == 1
        constraint = matches[0]
        assert constraint['type'] == 'c' and hashlib.sha256(constraint['definition'].encode()).hexdigest() == difference['sourceDefinitionSha256']
        definition = definitions[(difference['table'], difference['name'])]
        assert hashlib.sha256(definition.encode()).hexdigest() == difference['restoredDefinitionSha256'] == difference['postgresReparsedDefinitionSha256']
        assert difference['postgresReparsedDefinitionsIdentical'] is True and difference['temporaryDdlRolledBack'] is True
        constraint['definition'] = definition
    return expected

def validate_baseline(protected, expected, primary, expected_primary):
    result = original['validate_protected'](protected, expected)
    queue = protected['rows'][QUEUE]
    assert len(queue) == 1 and queue[0]['id'] == 'reports' and queue[0]['pending'] == 0, 'original reports singleton must be zero'
    assert primary == expected_primary, 'primary full snapshot changed'
    return result

def preservation_summary(protected, current, primary, expected_primary, helper, driver):
    old, now = protected['rows'], current['rows']
    assert_schema(protected['snapshot'], current['snapshot'])
    assert_projection(current['snapshot'], now)
    helper.validate_old_rows(old, now)
    assert now[QUEUE] == old[QUEUE], 'reports singleton full logical row changed'
    assert not helper.row_counter(old[CHECKPOINTS]) - helper.row_counter(now[CHECKPOINTS]), 'old checkpoints changed'
    assert primary == expected_primary, 'primary full snapshot changed'
    completed = driver.get('passed') is True
    added = helper.row_counter(now[CHECKPOINTS]) - helper.row_counter(old[CHECKPOINTS])
    assert len(now[CHECKPOINTS]) <= 22, 'more than one new checkpoint'
    if completed:
        assert len(now[CHECKPOINTS]) == 22 and sum(added.values()) == 1, 'completed fixture needs one new checkpoint'
        checkpoint = json.loads(next(iter(added)))
        assert checkpoint['attempt_id'] == driver['workload']['attemptId'], 'new checkpoint is outside the actual fixture'
        assert all(checkpoint[key] is None for key in ['payload_encrypted', 'payload_hash', 'expires_at']), 'completed new checkpoint payload not cleared'
    return {'allCoreRowsRetained': True, 'oldTables': 217, 'oldRows': 6667,
        'allOldCheckpointRowsExact': True, 'oldCheckpointRows': 21,
        'originalReportsSingletonExact': True, 'allColumnsProtected': True,
        'noColumnOrTableExemptions': True, 'liveSchemaExact': True, 'primarySnapshotExact': True,
        'historicalRowsEncompassed': [6529, 6582, 6651], 'driverPassed': completed,
        'currentRows': sum(map(len, now.values())), 'currentSnapshotSha256': digest(current['snapshot']),
        'addedRowsByTable': {table: sum((helper.row_counter(rows) - helper.row_counter(old[table])).values()) for table, rows in now.items() if len(rows) > len(old[table])}}

def read_protected(state, expected, expected_primary):
    receipt_file = private_file(state / (BASELINE_LABEL + '-result.json'))
    receipt = json.loads(receipt_file.read_text())
    assert receipt['passed'] is True and receipt['mode'] == 'baseline' and receipt['scope'] == SCOPE
    file = private_file(state / PROTECTED_FILE)
    assert receipt['protectedRowsFile'] == binding(file), 'working baseline binding changed'
    protected = json.loads(file.read_text())
    # Trust only the hash-bound successful admission's actual live snapshot.
    # Future audits compare this exact schema; never reapply restore exceptions.
    assert receipt['admission'] == {'sourceSnapshotSha256': CORE_SNAPSHOT_SHA256, 'restoreReceiptSha256': RESTORE_RECEIPT_SHA256, 'actualWorkingSnapshotSha256': digest(protected['snapshot']), 'historicalOrdinalDifferences': 73, 'historicalParserDifferences': 3, 'parserDdlExecuted': False}
    validate_baseline(protected, protected['snapshot'], expected_primary, expected_primary)
    return protected, {str(receipt_file): sha_file(receipt_file), str(file): sha_file(file)}

def main():
    parser = argparse.ArgumentParser(description='Read-only C26 two-database protection')
    for name in ['tools', 'state']:
        parser.add_argument('--' + name, required=True, type=Path)
    parser.add_argument('--mode', required=True, choices=['baseline', 'final'])
    parser.add_argument('--label', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    assert args.state == STATE and args.state.is_dir() and args.state.stat().st_mode & 0o777 == 0o700
    assert all(not part.is_symlink() for part in [args.state, *args.state.parents])
    assert args.label == 'c25-c26-audit-' + args.mode
    result_file = args.state / (args.label + '-result.json')
    descriptor = os.open(result_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    result = {'schemaVersion': 1, 'passed': False, 'mode': args.mode, 'scope': SCOPE,
        'coreSnapshotSha256': CORE_SNAPSHOT_SHA256, 'primarySnapshotSha256': PRIMARY_SNAPSHOT_SHA256,
        'migrationRerun': False, 'newDatabaseRestoreExecuted': False, 'historicalBaselinesCopied': False}
    db, failure = None, None
    try:
        expected, expected_primary, references, restore_receipt = evidence_inputs(args.state)
        result['inheritedEvidence'] = references
        helper = load_helper(DB_HELPER)
        db = helper.Database(args.tools, args.state)
        db.env['PGOPTIONS'] += ' -c default_transaction_read_only=on'
        result['databaseReadOnly'] = True
        current, rows_binding, snapshot_binding = capture_live(db, args.state, args.label, args.mode)
        result.update(currentRowsFile=rows_binding, currentSnapshotFile=snapshot_binding, currentRows=sum(map(len, current['rows'].values())))
        if args.mode == 'final':
            result.update(finalSnapshot=snapshot_binding, snapshotSha256=snapshot_binding['sha256'])
        primary, result['primarySnapshotFile'] = primary_snapshot(db, args.state, args.label)
        assert_quiescent(db)
        if args.mode == 'baseline':
            admitted = expected_restored_snapshot(expected, restore_receipt)
            result['capture'] = validate_baseline(current, admitted, primary, expected_primary)
            result['admission'] = {'sourceSnapshotSha256': CORE_SNAPSHOT_SHA256, 'restoreReceiptSha256': RESTORE_RECEIPT_SHA256, 'actualWorkingSnapshotSha256': digest(current['snapshot']), 'historicalOrdinalDifferences': 73, 'historicalParserDifferences': 3, 'parserDdlExecuted': False}
            result['protectedRowsFile'] = rows_binding
        else:
            protected, baseline_bindings = read_protected(args.state, expected, expected_primary)
            references.update(baseline_bindings)
            driver_file = args.state / 'c25-c26-a-driver-result-private.json'
            driver = json.loads(private_file(driver_file).read_text()) if driver_file.exists() else {}
            if driver_file.exists():
                references[str(driver_file)] = sha_file(driver_file)
            result['protectedCoreFacts'] = preservation_summary(protected, current, primary, expected_primary, helper, driver)
            result['driverPassed'] = driver.get('passed') is True
        assert all(sha_file(Path(file)) == value for file, value in references.items()), 'audit input changed'
        assert args.mode == 'baseline' or result['driverPassed'], 'driver did not complete; preservation is not an A pass'
        result['passed'] = True
    except BaseException as error:
        failure = error
        result['errorType'] = type(error).__name__
        private_json(args.state / (args.label + '-error-private.json'), {'traceback': traceback.format_exc()})
    finally:
        result['processExits'] = db.exits if db is not None else {}
        with os.fdopen(descriptor, 'w') as handle:
            json.dump(result, handle, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
    print(json.dumps({'passed': result['passed'], 'mode': args.mode, 'result': result_file.name, 'resultSha256': sha_file(result_file)}))
    if failure is not None:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
`
export const inlinePythonSha256=createHash('sha256').update(INLINE_PYTHON).digest('hex')
export function invocation(argv){
 const names=['python','tools','state','mode','label'],values={}
 assert.equal(argv.length,names.length*2,'exact read-only audit arguments required')
 for(let i=0;i<argv.length;i+=2){const key=argv[i]?.replace(/^--/,'');assert.ok(argv[i]?.startsWith('--')&&names.includes(key)&&!Object.hasOwn(values,key));assert.ok(argv[i+1]&&!argv[i+1].startsWith('--'));values[key]=argv[i+1]}
 for(const key of ['python','tools','state']){assert.ok(path.isAbsolute(values[key]));assert.equal(path.resolve(values[key]),values[key])}
 assert.equal(values.state,STATE);assert.ok(['baseline','final'].includes(values.mode),'only read-only audit modes are exposed');assert.equal(values.label,`c25-c26-audit-${values.mode}`)
 return {...values,node:path.join(values.tools,'node_modules/node/bin/node'),args:['-B','-c',INLINE_PYTHON,...names.filter(key=>key!=='python').flatMap(key=>['--'+key,values[key]])]}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let command
 try{
  process.umask(0o077);command=invocation(process.argv.slice(2));assert.equal(process.execPath,command.node);assert.ok(fs.statSync(command.python).isFile())
  const run=spawnSync(command.python,command.args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],detached:false,timeout:DB_TIMEOUT_MS,killSignal:'SIGKILL',maxBuffer:1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
  if(run.error||run.signal||run.stderr)throw Object.assign(new Error('Audit child failed'),{diagnostic:{error:run.error?.stack,signal:run.signal,stdout:run.stdout,stderr:run.stderr}})
  const result=JSON.parse(run.stdout);assert.deepEqual(Object.keys(result).sort(),['mode','passed','result','resultSha256']);assert.equal(typeof result.passed,'boolean');assert.equal(result.mode,command.mode);assert.equal(result.result,command.label+'-result.json');assert.match(result.resultSha256,/^[a-f0-9]{64}$/)
  console.log(JSON.stringify(result));process.exitCode=run.status===0&&result.passed===true?0:1
 }catch(error){
  if(command){try{const fd=fs.openSync(path.join(command.state,command.label+'-spawn-error-private.json'),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({stack:error.stack,diagnostic:error.diagnostic}));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{}}
  console.error(JSON.stringify({passed:false,errorType:error.name,message:'C26 audit failed; inspect private evidence.'}));process.exitCode=1
 }
}
