/** New continuation contracts only. Fake database objects never connect to PG,
 * start a service, run a producer, or repeat the original C25 qualification. */
import assert from 'node:assert/strict'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
import {INLINE_PYTHON,inlinePythonSha256,invocation,FAILED_SNAPSHOT_SHA256,BASELINE_LABEL} from './c25-continuation-db.mjs'

const helper=path.join(path.dirname(fileURLToPath(import.meta.url)),'c25-db.py')
const fixture=String.raw`
import copy
helper = load_helper(Path(HELPER_PATH))

def snapshot_for(columns, rows):
    return {'columns': copy.deepcopy(columns),
            'columnMetadata': {table: [{'column': column, 'ordinal': i + 1} for i, column in enumerate(names)] for table, names in columns.items()},
            'projection': {table: {'rows': len(value), 'sha256': digest(value)} for table, value in rows.items()},
            'constraints': [], 'allPublicUserGuards': [], 'governanceGuards': [], 'qualityGuards': []}

def fixtures():
    tables = ['_prisma_migrations', 'training_attempt_checkpoints', *CLEANUP_TABLES,
              'composite_assessments', 'composite_assessment_attempts', 'composite_report_queue_budget', 'facts']
    tables += ['other_%03d' % i for i in range(209)]
    columns = {table: ['id', 'value'] for table in tables}
    columns['composite_report_queue_budget'] = ['id', 'pending']
    old = {table: [] for table in tables}
    old['_prisma_migrations'] = [{'id': 'old-migration', 'value': 'unchanged'}]
    old['training_attempt_checkpoints'] = [{'id': 'old-checkpoint-%02d' % i, 'value': 'ciphertext-or-tombstone-%02d' % i} for i in range(16)]
    old['composite_assessments'] = [{'id': 'old-parent', 'value': 'unchanged'}]
    old['composite_assessment_attempts'] = [{'id': 'old-attempt', 'value': 'unchanged'}]
    old['composite_report_queue_budget'] = [{'id': 'reports', 'pending': 0}]
    old['facts'] = [{'id': 'old-fact-%04d' % i, 'value': 'unchanged'} for i in range(6509)]
    prior = {**snapshot_for(columns, old), 'rows': copy.deepcopy(old)}
    current = copy.deepcopy(old)
    for table, added in helper.ADDED.items():
        columns[table] += added
        for row in current[table]:
            row.update({column: None for column in added})
    for table, ids in [('composite_assessments', ['A-parent', 'failed-scheduled-parent']),
                       ('composite_assessment_attempts', ['A-attempt', 'failed-B-attempt'])]:
        for row_id in ids:
            current[table].append({'id': row_id, 'value': 'accepted' if row_id.startswith('A-') else 'partial',
                                   **{column: 'frozen-' + column for column in helper.ADDED[table]}})
    current['training_attempt_checkpoints'].append({'id': 'A-checkpoint', 'value': 'tombstone'})
    current['facts'] += [{'id': 'failed-run-fact-%02d' % i, 'value': 'accepted-job-snapshot-or-other-fact'} for i in range(48)]
    snapshot = snapshot_for(columns, current)
    protected = {'schemaVersion': 1, 'failedSnapshotSha256': FAILED_SNAPSHOT_SHA256,
                 'snapshot': snapshot, 'rows': copy.deepcopy(current)}
    return prior, protected

class FakeDB:
    def __init__(self, prior, protected):
        self.live = copy.deepcopy(protected['rows'])
        self.restored = copy.deepcopy(self.live)
        self.schema = copy.deepcopy(protected['snapshot'])
        self.exits = {}
    def snapshot(self, database='eduk12_recovery'):
        result = copy.deepcopy(self.schema)
        source = self.live if database == 'eduk12_recovery' else self.restored
        result['projection'] = {table: {'rows': len(rows), 'sha256': digest(rows)} for table, rows in source.items()}
        return result
    def rows(self, columns, database='eduk12_recovery'):
        source = self.live if database == 'eduk12_recovery' else self.restored
        return {table: [{column: row[column] for column in names} for row in source[table]] for table, names in columns.items()}
    def original_rows_unchanged(self, prior):
        helper.validate_old_rows(prior['rows'], self.rows(prior['columns']))
        return {'allOriginalRowsRetained': True, 'oldTables': 217, 'oldRows': 6529,
                'originalCheckpointRowsRetained': 16, 'historicalFeedbackNullsRetained': True}

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
 const program=`scope={'__name__':'c25_continuation_contract'}\nexec(compile(${JSON.stringify(INLINE_PYTHON)},'<bound-continuation-inline>','exec'),scope)\nscope['HELPER_PATH']=${JSON.stringify(helper)}\nexec(compile(${JSON.stringify(fixture+'\n'+body)},'<continuation-fake-db-contract>','exec'),scope)\n`
 const run=spawnSync(process.env.C25_TEST_PYTHON??'python3',['-B','-c',program],{encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
 assert.equal(run.error,undefined);assert.equal(run.signal,null);assert.equal(run.status,0,run.stderr||run.stdout)
}

test('pristine inherited and failed-run baselines retain all columns and restore every current row',()=>{
 pythonContract(String.raw`
prior, protected = fixtures()
assert sum(map(len, prior['rows'].values())) == 6529
assert validate_protected(protected, protected['snapshot'], FAILED_SNAPSHOT_SHA256)['rows'] == 6582
db = FakeDB(prior, protected)
summary, snapshot, current = preserve(db, prior, protected, helper)
result = {}
record_preservation(result, summary)
assert result['retainedFacts']['allOriginalRowsRetained'] is True
assert result['continuationRetainedFacts']['allFailedRowsRetained'] is True
assert result['continuationRetainedFacts']['checkpointRows'] == 17
assert verify_restored_rows(db, prior, protected, current, helper)['allPostContinuationFullRowsEqual'] is True
`)
})

test('live schema drift and full old/A/partial-B/job/checkpoint/queue mutations fail closed',()=>{
 pythonContract(String.raw`
prior, protected = fixtures()
for table, row_id, field, replacement in [
    ('composite_assessment_attempts', 'failed-B-attempt', 'value', 'unexpectedly-completed'),
    ('composite_assessment_attempts', 'A-attempt', 'training_feedback_snapshot', 'replacement'),
    ('composite_assessments', 'failed-scheduled-parent', 'training_feedback_policy', 'new-release-time'),
    ('facts', 'old-fact-0000', 'value', 'changed'),
    ('facts', 'failed-run-fact-00', 'value', 'reclaimed-job'),
    ('training_attempt_checkpoints', 'A-checkpoint', 'value', 'new-payload'),
    ('training_attempt_checkpoints', 'old-checkpoint-00', 'value', 'expired-payload-cleared'),
    ('composite_report_queue_budget', 'reports', 'pending', 1),
]:
    db = FakeDB(prior, protected)
    next(row for row in db.live[table] if row['id'] == row_id)[field] = replacement
    rejected(lambda: preserve(db, prior, protected, helper), 'old full logical row')
db = FakeDB(prior, protected)
db.schema['columnMetadata']['facts'][0]['ordinal'] = 2
rejected(lambda: preserve(db, prior, protected, helper), 'live schema changed')
db = FakeDB(prior, protected)
db.schema['allPublicUserGuards'].append({'table': 'facts', 'name': 'unexpected'})
rejected(lambda: preserve(db, prior, protected, helper), 'live schema changed')
`)
})

test('capture rejects omitted columns, table/count/checkpoint drift and nonempty startup cleanup tables',()=>{
 pythonContract(String.raw`
prior, protected = fixtures()
bad = copy.deepcopy(protected)
del bad['rows']['composite_assessment_attempts'][-1]['training_feedback_snapshot']
rejected(lambda: validate_capture(bad['snapshot'], bad['rows']), 'omitted or added a column')
bad = copy.deepcopy(protected)
del bad['rows']['other_000']
rejected(lambda: validate_capture(bad['snapshot'], bad['rows']), 'table inventory')
bad = copy.deepcopy(protected)
bad['rows']['training_attempt_checkpoints'].pop()
bad['snapshot'] = snapshot_for(bad['snapshot']['columns'], bad['rows'])
rejected(lambda: validate_capture(bad['snapshot'], bad['rows']), 'full-row count')
bad['rows']['facts'].append({'id': 'replacement', 'value': 'does-not-replace-checkpoint'})
bad['snapshot'] = snapshot_for(bad['snapshot']['columns'], bad['rows'])
rejected(lambda: validate_capture(bad['snapshot'], bad['rows']), 'checkpoint count')
for table in CLEANUP_TABLES:
    bad = copy.deepcopy(protected)
    bad['rows'][table].append(bad['rows']['facts'].pop())
    bad['snapshot'] = snapshot_for(bad['snapshot']['columns'], bad['rows'])
    rejected(lambda: validate_capture(bad['snapshot'], bad['rows']), 'immediate startup receipt cleanup')
bad = copy.deepcopy(protected)
bad['snapshot']['constraints'].append({'name': 'drift'})
rejected(lambda: validate_protected(bad, protected['snapshot'], FAILED_SNAPSHOT_SHA256), 'protected snapshot differs')
`)
})

test('restore-only changes, extra rows and post-continuation changes cannot hide behind old-row preservation',()=>{
 pythonContract(String.raw`
prior, protected = fixtures()
db = FakeDB(prior, protected)
_, _, source = preserve(db, prior, protected, helper)
next(row for row in db.restored['composite_assessment_attempts'] if row['id'] == 'failed-B-attempt')['value'] = 'changed-only-in-restore'
rejected(lambda: verify_restored_rows(db, prior, protected, source, helper), 'old full logical row')
assert preserve(db, prior, protected, helper)[0]['currentRows'] == 6582
db = FakeDB(prior, protected)
db.live['facts'].append({'id': 'new-continuation-fact', 'value': 'fresh'})
db.restored = copy.deepcopy(db.live)
_, _, source = preserve(db, prior, protected, helper)
assert verify_restored_rows(db, prior, protected, source, helper)['postContinuationRows'] == 6583
db.restored['facts'][-1]['value'] = 'restored-mutation'
rejected(lambda: verify_restored_rows(db, prior, protected, source, helper), 'restored full logical rows differ')
db.restored = copy.deepcopy(db.live)
db.restored['facts'].append(copy.deepcopy(db.restored['facts'][-1]))
rejected(lambda: verify_restored_rows(db, prior, protected, source, helper), 'restored full logical rows differ')
`)
})

test('fixed inline adapter permits no migration mode, alternate helper or implicit argument',()=>{
 const argv=['--python','/usr/bin/python3','--db-helper',helper,'--tools','/tmp/tools','--state','/tmp/new','--failure-state','/tmp/old','--expected-failed-snapshot-sha256',FAILED_SNAPSHOT_SHA256,'--mode','baseline','--label',BASELINE_LABEL]
 const command=invocation(argv)
 assert.equal(command.args[0],'-B');assert.equal(command.args[1],'-c');assert.equal(command.args[2],INLINE_PYTHON)
 assert.equal(inlinePythonSha256,createHash('sha256').update(INLINE_PYTHON).digest('hex'))
 const change=(key,value)=>argv.map((arg,i)=>argv[i-1]===key?value:arg)
 assert.throws(()=>invocation(change('--mode','upgrade')))
 assert.throws(()=>invocation(change('--db-helper','/tmp/c25-db.py')))
 assert.throws(()=>invocation(change('--expected-failed-snapshot-sha256','0'.repeat(64))))
 assert.throws(()=>invocation(change('--label','c25-continuation-other-baseline')))
 assert.throws(()=>invocation(change('--state','/tmp/old')))
 assert.throws(()=>invocation(change('--state','/tmp/old/nested')))
 assert.throws(()=>invocation(change('--state','/tmp/new/../old')))
 assert.throws(()=>invocation([...argv,'--mode','restore']))
})
