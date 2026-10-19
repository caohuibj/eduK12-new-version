/** New missing-only contracts only. Fake database objects never connect to PG,
 * start a service, run a producer, or repeat the original C25 qualification. */
import assert from 'node:assert/strict'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
import {INLINE_PYTHON,inlinePythonSha256,invocation,FAILED_SNAPSHOT_SHA256,SECOND_SNAPSHOT_SHA256,BASELINE_LABEL} from './c25-missing-db.mjs'

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
    first = protected
    current = copy.deepcopy(first['rows'])
    current['training_attempt_checkpoints'] += [{'id': 'continuation-checkpoint-' + name, 'value': 'immutable-' + name} for name in ['B', 'C', 'D']]
    current['facts'] += [{'id': 'continuation-fact-%02d' % i, 'value': 'accepted-child-report-snapshot'} for i in range(66)]
    protected = {'schemaVersion': 1, 'secondFailedSnapshotSha256': SECOND_SNAPSHOT_SHA256,
                 'snapshot': snapshot_for(columns, current), 'rows': current}
    return prior, first, protected

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
 const program=`scope={'__name__':'c25_missing_contract'}\nexec(compile(${JSON.stringify(INLINE_PYTHON)},'<bound-missing-inline>','exec'),scope)\nscope['HELPER_PATH']=${JSON.stringify(helper)}\nexec(compile(${JSON.stringify(fixture+'\n'+body)},'<missing-fake-db-contract>','exec'),scope)\n`
 const run=spawnSync(process.env.C25_TEST_PYTHON??'python3',['-B','-c',program],{encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
 assert.equal(run.error,undefined);assert.equal(run.signal,null);assert.equal(run.status,0,run.stderr||run.stdout)
}

test('pristine inherited and failed-run baselines retain all columns and restore every current row',()=>{
 pythonContract(String.raw`
prior, first, protected = fixtures()
assert sum(map(len, prior['rows'].values())) == 6529
assert validate_protected(first, first['snapshot'], FAILED_SNAPSHOT_SHA256, prior=True)['rows'] == 6582
assert validate_protected(protected, protected['snapshot'], SECOND_SNAPSHOT_SHA256)['rows'] == 6651
db = FakeDB(prior, protected)
summary, snapshot, current = preserve(db, prior, first, protected, helper)
result = {}
record_preservation(result, summary)
assert result['retainedFacts']['allOriginalRowsRetained'] is True
assert result['continuationRetainedFacts']['allFailedRowsRetained'] is True
assert result['continuationRetainedFacts']['checkpointRows'] == 17
assert result['missingRetainedFacts']['oldRows'] == 6651
assert result['missingRetainedFacts']['checkpointRows'] == 20
assert verify_restored_rows(db, prior, first, protected, current, helper)['allPostContinuationFullRowsEqual'] is True
`)
})

test('live schema drift and full old/A/partial-B/job/checkpoint/queue mutations fail closed',()=>{
 pythonContract(String.raw`
prior, first, protected = fixtures()
for table, row_id, field, replacement in [
    ('composite_assessment_attempts', 'failed-B-attempt', 'value', 'unexpectedly-completed'),
    ('composite_assessment_attempts', 'A-attempt', 'training_feedback_snapshot', 'replacement'),
    ('composite_assessments', 'failed-scheduled-parent', 'training_feedback_policy', 'new-release-time'),
    ('facts', 'old-fact-0000', 'value', 'changed'),
    ('facts', 'failed-run-fact-00', 'value', 'reclaimed-job'),
    ('training_attempt_checkpoints', 'A-checkpoint', 'value', 'new-payload'),
    ('training_attempt_checkpoints', 'old-checkpoint-00', 'value', 'expired-payload-cleared'),
    ('composite_report_queue_budget', 'reports', 'pending', 1),
    ('training_attempt_checkpoints', 'continuation-checkpoint-B', 'value', 'new-tombstone'),
    ('training_attempt_checkpoints', 'continuation-checkpoint-D', 'value', 'expired-or-cleared-payload'),
    ('facts', 'continuation-fact-00', 'value', 'changed-child-report'),
]:
    db = FakeDB(prior, protected)
    next(row for row in db.live[table] if row['id'] == row_id)[field] = replacement
    rejected(lambda: preserve(db, prior, first, protected, helper), 'old full logical row')
db = FakeDB(prior, protected)
db.schema['columnMetadata']['facts'][0]['ordinal'] = 2
rejected(lambda: preserve(db, prior, first, protected, helper), 'live schema changed')
db = FakeDB(prior, protected)
db.schema['allPublicUserGuards'].append({'table': 'facts', 'name': 'unexpected'})
rejected(lambda: preserve(db, prior, first, protected, helper), 'live schema changed')
`)
})

test('capture rejects omitted columns, table/count/checkpoint drift and nonempty startup cleanup tables',()=>{
 pythonContract(String.raw`
prior, first, protected = fixtures()
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
rejected(lambda: validate_protected(bad, protected['snapshot'], SECOND_SNAPSHOT_SHA256), 'protected snapshot differs')
`)
})

test('restore-only changes, extra rows and post-continuation changes cannot hide behind old-row preservation',()=>{
 pythonContract(String.raw`
prior, first, protected = fixtures()
db = FakeDB(prior, protected)
_, _, source = preserve(db, prior, first, protected, helper)
next(row for row in db.restored['composite_assessment_attempts'] if row['id'] == 'failed-B-attempt')['value'] = 'changed-only-in-restore'
rejected(lambda: verify_restored_rows(db, prior, first, protected, source, helper), 'old full logical row')
assert preserve(db, prior, first, protected, helper)[0]['currentRows'] == 6651
db = FakeDB(prior, protected)
db.live['facts'].append({'id': 'new-E-fact', 'value': 'fresh'})
db.restored = copy.deepcopy(db.live)
_, _, source = preserve(db, prior, first, protected, helper)
assert verify_restored_rows(db, prior, first, protected, source, helper)['postContinuationRows'] == 6652
db.restored['facts'][-1]['value'] = 'restored-mutation'
rejected(lambda: verify_restored_rows(db, prior, first, protected, source, helper), 'restored full logical rows differ')
db.restored = copy.deepcopy(db.live)
db.restored['facts'].append(copy.deepcopy(db.restored['facts'][-1]))
rejected(lambda: verify_restored_rows(db, prior, first, protected, source, helper), 'restored full logical rows differ')
`)
})

test('fixed inline adapter permits no migration mode, alternate helper or implicit argument',()=>{
 const contract=path.join(path.dirname(helper),'c25-missing-contract.mjs')
 const argv=['--python','/usr/bin/python3','--node','/tmp/tools/node_modules/node/bin/node','--db-helper',helper,'--contract',contract,'--tools','/tmp/tools','--state','/tmp/new','--failure-state','/tmp/old','--continuation-state','/tmp/second','--mode','baseline','--label',BASELINE_LABEL]
 const command=invocation(argv)
 assert.equal(command.args[0],'-B');assert.equal(command.args[1],'-c');assert.equal(command.args[2],INLINE_PYTHON)
 assert.equal(inlinePythonSha256,createHash('sha256').update(INLINE_PYTHON).digest('hex'))
 const change=(key,value)=>argv.map((arg,i)=>argv[i-1]===key?value:arg)
 assert.throws(()=>invocation(change('--mode','upgrade')))
 assert.throws(()=>invocation(change('--db-helper','/tmp/c25-db.py')))
 assert.throws(()=>invocation(change('--node','/usr/bin/node')))
 assert.throws(()=>invocation(change('--contract','/tmp/c25-missing-contract.mjs')))
 assert.throws(()=>invocation(change('--continuation-state','/tmp/old')))
 assert.throws(()=>invocation(change('--continuation-state','/tmp/new/nested')))
 assert.throws(()=>invocation(change('--label','c25-missing-other-baseline')))
 assert.throws(()=>invocation(change('--state','/tmp/old')))
 assert.throws(()=>invocation(change('--state','/tmp/old/nested')))
 assert.throws(()=>invocation(change('--state','/tmp/new/../old')))
 assert.throws(()=>invocation([...argv,'--mode','restore']))
})


test('new restore prerequisites reject historical failed promotion and receipt substitution',()=>{
 pythonContract(String.raw`
receipts = {name: {'schemaVersion': 1, 'passed': True, 'phase': 'missing-' + name} for name in PHASE_FILES}
assert validate_phase_receipts(receipts) is True
for name in PHASE_FILES:
    bad = copy.deepcopy(receipts)
    bad[name]['passed'] = False
    rejected(lambda: validate_phase_receipts(bad), 'did not pass')
    bad = copy.deepcopy(receipts)
    bad[name]['phase'] = 'scheduled'
    rejected(lambda: validate_phase_receipts(bad), 'wrong missing-only phase')
bad = copy.deepcopy(receipts)
bad['scheduled'] = bad.pop('probe')
rejected(lambda: validate_phase_receipts(bad), 'prerequisite set differs')
`)
})

test('adapter restore calls immutable equivalence and ACL APIs, rejecting drift and live source',()=>{
 pythonContract(String.raw`
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

class RestoreDB(FakeDB):
    def __init__(self, prior, protected, directory, fault=None):
        super().__init__(prior, protected)
        self.backend = directory
        self.fault = fault
        self.calls = []
    def sql(self, sql, database='eduk12_recovery'):
        self.calls.append(('sql', sql, database))
        return '1' if ((self.fault == 'active-source' and 'pg_stat_activity' in sql) or
                       (self.fault == 'existing-restore' and 'pg_database' in sql)) else '0'
    def fixture_observations(self, manifest, database='eduk12_recovery'):
        self.calls.append(('fixture_observations', database))
        return {'exactABCD': ['A', 'B', 'C', 'D']}
    def dump(self, database, destination, label):
        self.calls.append(('dump', database))
        destination.write_bytes(b'fake-only-never-a-real-dump')
        return sha_file(destination)
    def restore(self, database, dump, label):
        self.calls.append(('restore', database))
        self.restored = copy.deepcopy(self.live)
        if self.fault == 'new-E-row':
            self.restored['facts'][-1]['value'] = 'wrong-only-in-restored-E'
    def snapshot(self, database='eduk12_recovery'):
        result = super().snapshot(database)
        if database != 'eduk12_recovery' and self.fault == 'constraint':
            result['constraints'].append({'name': 'weakened-new-C22-check'})
        return result
    def apply_role(self, database):
        self.calls.append(('apply_role', database))
        if self.fault == 'role-mutates-state':
            self.restored['facts'][-1]['value'] = 'changed-after-role-apply'

class RestoreHelper:
    RESTORE_DATABASE = helper.RESTORE_DATABASE
    MIGRATION = 'synthetic-migration'
    ADDED = helper.ADDED
    literal = staticmethod(helper.literal)
    validate_old_rows = staticmethod(helper.validate_old_rows)
    row_counter = staticmethod(helper.row_counter)
    validate_historical_nulls = staticmethod(helper.validate_historical_nulls)
    def __init__(self):
        self.calls = []
    def validate_restore_cases(self, manifest, observations, original_rows):
        self.calls.append('validate_restore_cases')
        assert manifest['restoreCases'] == ['A', 'B', 'C', 'D']
        return {'cases': 4}
    def validate_schema_inventory(self, before, after, migration):
        self.calls.append('validate_schema_inventory')
        assert migration == 'exact fake migration for adapter-only test'
    def restore_equivalence(self, before, after, db, database):
        self.calls.append('restore_equivalence')
        assert database == self.RESTORE_DATABASE
        assert before == after, 'immutable restore equivalence rejected schema or rows'
        return {'columnOrdinals': ['fake exact proof from immutable API'], 'constraintReparses': ['fake exact proof from immutable API']}

def run_restore(fault=None):
    prior, first, protected = fixtures()
    with tempfile.TemporaryDirectory() as directory:
        state = Path(directory)
        private_json(state / 'c25-fixture-private.json', {'restoreCases': ['A', 'B', 'C', 'D']})
        for name, file in PHASE_FILES.items():
            private_json(state / file, {'schemaVersion': 1, 'passed': True, 'phase': 'missing-' + name})
        migration = state / 'prisma/migrations/synthetic-migration/migration.sql'
        migration.parent.mkdir(parents=True)
        migration.write_text('exact fake migration for adapter-only test')
        db = RestoreDB(prior, protected, state, fault)
        db.live['facts'].append({'id': 'E-fact', 'value': 'fresh-E'})
        current = copy.deepcopy(db.live)
        adapter_helper = RestoreHelper()
        with patch.dict(globals(), read_prerequisites=lambda args: {}):
            result = restore_missing(db, state, prior, first, protected, current, adapter_helper, SimpleNamespace(state=state))
        assert result['passed'] is True and result['restrictedRoleVerified'] is True
        assert result['sourceQuiescentBeforeAndAfter'] is True
        assert result['restoredFullRows']['postContinuationRows'] == 6652
        assert adapter_helper.calls == ['validate_restore_cases', 'validate_schema_inventory', 'restore_equivalence', 'validate_restore_cases']
        assert [call[0] for call in db.calls].count('apply_role') == 1
        return result

run_restore()
for fault, message in [('active-source', 'still running'), ('existing-restore', 'already exists'),
                       ('constraint', 'equivalence rejected'), ('new-E-row', 'equivalence rejected'),
                       ('role-mutates-state', 'role apply changed')]:
    rejected(lambda: run_restore(fault), message)
`)
})
