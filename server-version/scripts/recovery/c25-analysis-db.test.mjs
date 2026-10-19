/** New supplement audit contracts only. Fixtures never connect to PostgreSQL,
 * start services, replay qualifications, restore a database, or apply a DDL. */
import assert from 'node:assert/strict'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
import {analysisState,coreState} from './c25-analysis-contract.mjs'
import {INLINE_PYTHON,inlinePythonSha256,invocation,CORE_SNAPSHOT_SHA256,BASELINE_LABEL,DB_TIMEOUT_MS} from './c25-analysis-db.mjs'

const directory=path.dirname(fileURLToPath(import.meta.url))
const helper=path.join(directory,'c25-db.py')
const fixture=String.raw`
import copy
from types import SimpleNamespace
helper = load_helper(Path(HELPER_PATH))

def snapshot_for(columns, rows):
    return {'columns': copy.deepcopy(columns),
            'columnMetadata': {table: [{'column': column, 'ordinal': i + 1} for i, column in enumerate(names)] for table, names in columns.items()},
            'projection': {table: {'rows': len(value), 'sha256': digest(value)} for table, value in rows.items()},
            'constraints': [], 'allPublicUserGuards': [], 'governanceGuards': [], 'qualityGuards': []}

def fixtures():
    tables = ['_prisma_migrations', 'training_attempt_checkpoints',
              'submission_idempotency_receipts', 'checkin_submission_idempotency_receipts',
              'composite_assessments', 'composite_assessment_attempts', 'composite_report_queue_budget',
              'composite_report_jobs', 'export_batches', 'export_artifacts', 'facts']
    tables += ['other_%03d' % i for i in range(206)]
    columns = {table: ['id', 'value'] for table in tables}
    columns['composite_report_queue_budget'] = ['id', 'pending']
    columns['composite_assessment_attempts'] += ['training_feedback_snapshot', 'training_feedback_snapshot_hash']
    rows = {table: [] for table in tables}
    rows['_prisma_migrations'] = [{'id': 'accepted-migration', 'value': 'unchanged'}]
    rows['training_attempt_checkpoints'] = [{'id': 'checkpoint-%02d' % i, 'value': 'ciphertext-expiry-or-tombstone-%02d' % i} for i in range(21)]
    rows['composite_assessments'] = [{'id': 'accepted-parent', 'value': 'unchanged'}]
    rows['composite_assessment_attempts'] = [{'id': 'accepted-attempt', 'value': 'unchanged', 'training_feedback_snapshot': 'exact-frozen-feedback', 'training_feedback_snapshot_hash': 'frozen-hash'}]
    rows['composite_report_queue_budget'] = [{'id': 'reports', 'pending': 0}]
    rows['composite_report_jobs'] = [{'id': 'accepted-job-%03d' % i, 'value': 'exact-pending-failed-or-ready-job'} for i in range(148)]
    rows['export_batches'] = [{'id': 'accepted-batch-%02d' % i, 'value': 'exact-status-and-options'} for i in range(42)]
    rows['export_artifacts'] = [{'id': 'accepted-artifact-%02d' % i, 'value': 'exact-download-and-lifecycle'} for i in range(42)]
    rows['facts'] = [{'id': 'accepted-fact-%04d' % i, 'value': 'unchanged'} for i in range(6410)]
    expected = snapshot_for(columns, rows)
    protected = {'schemaVersion': 1, 'coreSnapshotSha256': CORE_SNAPSHOT_SHA256,
                 'snapshot': copy.deepcopy(expected), 'rows': copy.deepcopy(rows)}
    return expected, protected

class FakeDB:
    def __init__(self, protected):
        self.live = copy.deepcopy(protected['rows'])
        self.schema = copy.deepcopy(protected['snapshot'])
        self.calls = []
    def snapshot(self):
        self.calls.append('snapshot')
        result = copy.deepcopy(self.schema)
        result['projection'] = {table: {'rows': len(rows), 'sha256': digest(rows)} for table, rows in self.live.items()}
        return result
    def rows(self, columns):
        self.calls.append('rows')
        return {table: [{column: row[column] for column in names} for row in self.live[table]] for table, names in columns.items()}

def rejected(fn, message=None):
    try:
        fn()
    except AssertionError as error:
        if message is not None:
            assert message in str(error), (message, str(error))
        return
    raise AssertionError('fault unexpectedly accepted')
`

function pythonContract(body){
 const program=`scope={'__name__':'c25_analysis_fixture_contract'}\nexec(compile(${JSON.stringify(INLINE_PYTHON)},'<bound-analysis-inline>','exec'),scope)\nscope['HELPER_PATH']=${JSON.stringify(helper)}\nexec(compile(${JSON.stringify(fixture+'\n'+body)},'<analysis-fake-db-contract>','exec'),scope)\n`
 const run=spawnSync(process.env.C25_TEST_PYTHON??'python3',['-B','-c',program],{encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
 assert.equal(run.error,undefined);assert.equal(run.signal,null);assert.equal(run.status,0,run.stderr||run.stdout)
}

test('accepted 6,667-row capture binds every column, 21 checkpoints, 148 jobs and 42 exports',()=>{
 pythonContract(String.raw`
expected, protected = fixtures()
assert validate_protected(protected, expected) == {
    'tables': 217, 'rows': 6667, 'checkpoints': 21, 'allColumnsProtected': True,
    'immediateCleanupReceiptTablesEmpty': True, 'reportJobs': 148, 'exportBatches': 42, 'exportArtifacts': 42}
db = FakeDB(protected)
summary, actual = preserve(db, protected, helper)
assert summary['allCoreRowsRetained'] is True and summary['oldRows'] == 6667
assert summary['checkpointRows'] == 21 and summary['allCheckpointRowsExact'] is True
assert summary['liveSchemaExact'] is True and summary['noColumnOrTableExemptions'] is True
assert summary['currentRows'] == 6667 and actual == expected
assert db.calls == ['snapshot', 'rows']
`)
})

test('baseline rejects different accepted bytes, column omissions and every pinned inventory drift',()=>{
 pythonContract(String.raw`
expected, protected = fixtures()
bad = copy.deepcopy(protected)
bad['coreSnapshotSha256'] = '0' * 64
rejected(lambda: validate_protected(bad, expected), 'snapshot identity')
bad = copy.deepcopy(protected)
bad['snapshot']['constraints'].append({'name': 'unaccepted-check'})
rejected(lambda: validate_protected(bad, expected), 'protected snapshot differs')
bad = copy.deepcopy(protected)
del bad['rows']['composite_assessment_attempts'][0]['training_feedback_snapshot']
rejected(lambda: validate_protected(bad, expected), 'omitted or added a column')
bad = copy.deepcopy(protected)
bad['rows']['facts'][0]['value'] = 'unaccepted-full-row'
rejected(lambda: validate_protected(bad, expected), 'pinned projection')
bad = copy.deepcopy(protected)
del bad['rows']['other_000']
rejected(lambda: validate_protected(bad, expected), 'table inventory')
for table in COUNTS:
    bad = copy.deepcopy(protected)
    if COUNTS[table] == 0:
        bad['rows'][table].append(bad['rows']['facts'].pop())
    else:
        bad['rows']['facts'].append(bad['rows'][table].pop())
    bad['snapshot'] = snapshot_for(bad['snapshot']['columns'], bad['rows'])
    rejected(lambda: validate_protected(bad, bad['snapshot']), 'accepted protected count differs')
bad = copy.deepcopy(expected)
bad['projection']['facts']['rows'] -= 1
rejected(lambda: validate_accepted_snapshot(bad), 'accepted row count differs')
`)
})

test('all prior logical values including global queue, jobs, exports and checkpoints remain exact',()=>{
 pythonContract(String.raw`
expected, protected = fixtures()
for table, field, replacement in [
    ('_prisma_migrations', 'value', 'changed-checksum'),
    ('composite_assessments', 'value', 'changed-publication'),
    ('composite_assessment_attempts', 'training_feedback_snapshot', 'changed-frozen-feedback'),
    ('composite_assessment_attempts', 'training_feedback_snapshot_hash', 'changed-hash'),
    ('composite_report_queue_budget', 'pending', 1),
    ('composite_report_jobs', 'value', 'reclaimed-old-job'),
    ('export_batches', 'value', 'changed-old-export'),
    ('export_artifacts', 'value', 'expired-old-artifact'),
    ('training_attempt_checkpoints', 'value', 'cleared-old-ciphertext'),
    ('facts', 'value', 'changed-timestamp-or-other-old-value'),
]:
    db = FakeDB(protected)
    db.live[table][0][field] = replacement
    rejected(lambda: preserve(db, protected, helper), 'old full logical row')
db = FakeDB(protected)
db.live['facts'].pop()
rejected(lambda: preserve(db, protected, helper), 'old full logical row')
# A duplicated old row cannot disappear behind set-membership preservation.
protected['rows']['facts'][1] = copy.deepcopy(protected['rows']['facts'][0])
protected['snapshot'] = snapshot_for(protected['snapshot']['columns'], protected['rows'])
validate_protected(protected, protected['snapshot'])
db = FakeDB(protected)
db.live['facts'].pop(1)
rejected(lambda: preserve(db, protected, helper), 'old full logical row')
`)
})

test('exact live schema and exact checkpoint inventory admit no restore normalization or new checkpoint',()=>{
 pythonContract(String.raw`
expected, protected = fixtures()
for key in ['constraints', 'allPublicUserGuards', 'governanceGuards', 'qualityGuards']:
    db = FakeDB(protected)
    db.schema[key].append({'name': 'changed-schema-guard'})
    rejected(lambda: preserve(db, protected, helper), 'live schema changed')
db = FakeDB(protected)
db.schema['columnMetadata']['facts'][0]['ordinal'] = 2
rejected(lambda: preserve(db, protected, helper), 'live schema changed')
db = FakeDB(protected)
db.schema['columns']['facts'].append('new-column')
rejected(lambda: preserve(db, protected, helper), 'live schema changed')
db = FakeDB(protected)
db.live['training_attempt_checkpoints'].append({'id': 'forbidden-new-checkpoint', 'value': 'new-payload'})
rejected(lambda: preserve(db, protected, helper), 'checkpoint inventory changed')
db = FakeDB(protected)
db.live['training_attempt_checkpoints'].append(copy.deepcopy(db.live['training_attempt_checkpoints'][0]))
rejected(lambda: preserve(db, protected, helper), 'checkpoint inventory changed')
`)
})

test('partial and complete supplement additions produce their actual final snapshot without claiming a phase pass',()=>{
 pythonContract(String.raw`
expected, protected = fixtures()
for completed in [False, True]:
    db = FakeDB(protected)
    db.live['facts'].append({'id': 'new-course-or-partial-fact', 'value': 'actual'})
    if completed:
        db.live['composite_report_jobs'] += [{'id': 'new-job-%d' % i, 'value': 'ready'} for i in range(3)]
        db.live['export_batches'].append({'id': 'new-batch', 'value': 'ready'})
        db.live['export_artifacts'].append({'id': 'new-artifact', 'value': 'downloaded'})
    summary, actual = preserve(db, protected, helper)
    assert summary['oldRows'] == 6667
    assert summary['currentRows'] == 6668 + (5 if completed else 0)
    assert actual != expected and summary['currentSnapshotSha256'] == digest(actual)
    assert actual['projection']['training_attempt_checkpoints'] == expected['projection']['training_attempt_checkpoints']
    assert actual['projection']['composite_report_jobs']['rows'] == 148 + (3 if completed else 0)
    assert 'passed' not in summary and 'newDatabaseRestoreExecuted' not in summary
# Snapshot rows and subsequently read full rows must agree, not merely contain
# the baseline. This catches mutation while the audit is collecting its rows.
db = FakeDB(protected)
snapshot = db.snapshot()
db.live['facts'].append({'id': 'raced-extra-row', 'value': 'new'})
rejected(lambda: preservation_summary(snapshot, db.live, protected, helper), 'pinned projection')
`)
})

test('prerequisite command is the bound Node contract and runs before all database work',()=>{
 pythonContract(String.raw`
args = SimpleNamespace(node=Path('/tmp/tools/node_modules/node/bin/node'), tools=Path('/tmp/tools'),
                       contract=Path(HELPER_PATH).parent / 'c25-analysis-contract.mjs',
                       db_helper=Path(HELPER_PATH), state=ANALYSIS_STATE)
assert prerequisite_command(args) == [str(args.node), str(args.contract), '--validate-prerequisites', str(ANALYSIS_STATE)]
args.node = Path('/usr/bin/node')
rejected(lambda: prerequisite_command(args), 'bound official Node')
args.node = args.tools / 'node_modules/node/bin/node'
args.contract = Path('/tmp/alternate-contract.mjs')
rejected(lambda: prerequisite_command(args), 'sibling analysis contract')
`)
 const main=INLINE_PYTHON.slice(INLINE_PYTHON.lastIndexOf('\ndef main():'))
 assert.ok(main.indexOf('evidence_inputs(args)')<main.indexOf('load_helper(args.db_helper)'))
 assert.ok(main.indexOf('evidence_inputs(args)')<main.indexOf('helper.Database(args.tools, args.state)'))
 assert.ok(main.includes("db.env['PGOPTIONS'] += ' -c default_transaction_read_only=on'"))
 assert.ok(main.includes("'protectedCoreFacts'"))
 assert.ok(main.includes('os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600'))
 assert.ok(main.includes("os.chmod(handle.name, 0o600)"))
 assert.ok(main.includes("'c25-analysis-final-db-snapshot.json'"))
 assert.doesNotMatch(main,/\bdb\.(?:restore|dump)\s*\(/);assert.ok(!main.includes('read_original('))
 assert.ok(main.includes('json.dump(result, handle, indent=2)'),'Private receipt serialization remains required')
})

test('fixed new adapter rejects alternate evidence, restore modes, duplicate flags and unbounded invocation',()=>{
 const argv=['--python','/usr/bin/python3','--node','/tmp/tools/node_modules/node/bin/node','--db-helper',helper,'--contract',path.join(directory,'c25-analysis-contract.mjs'),'--tools','/tmp/tools','--state',analysisState,'--core-state',coreState,'--mode','baseline','--label',BASELINE_LABEL]
 const command=invocation(argv)
 assert.deepEqual(command.args.slice(0,3),['-B','-c',INLINE_PYTHON])
 assert.equal(CORE_SNAPSHOT_SHA256,'2116f582580ab67d0c5f69330d73300b026a3eaeeacf94a47f268aa16b244e85')
 assert.equal(inlinePythonSha256,createHash('sha256').update(INLINE_PYTHON).digest('hex'))
 assert.equal(DB_TIMEOUT_MS,295000);assert.ok(DB_TIMEOUT_MS<300000)
 const change=(key,value)=>argv.map((arg,i)=>argv[i-1]===key?value:arg)
 for(const mode of ['restore','upgrade','migration','prepare'])assert.throws(()=>invocation(change('--mode',mode)))
 for(const [key,value]of [['--state',coreState],['--state',analysisState+'/nested'],['--core-state',analysisState],['--core-state','/tmp/alternate-core'],['--node','/usr/bin/node'],['--db-helper','/tmp/c25-db.py'],['--contract','/tmp/c25-analysis-contract.mjs'],['--label','c25-analysis-other-baseline'],['--tools','/tmp/tools/../tools']])assert.throws(()=>invocation(change(key,value)))
 assert.throws(()=>invocation([...argv,'--mode','preserve']))
 assert.throws(()=>invocation(argv.slice(0,-2)))
 assert.throws(()=>invocation(change('--mode','final')),'baseline label cannot be used for final')
 for(const mode of ['preserve','final']){
  const selected=change('--mode',mode).map((value,i)=>argv[i-1]==='--label'?'c25-analysis-audit-'+mode:value)
  assert.ok(invocation(selected).args.includes(mode))
 }
})
