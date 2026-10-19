/** Pure inline-Python/fake-DB contracts. No service, connection or restore. */
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import test from 'node:test'
import {INLINE_PYTHON,inlinePythonSha256,invocation,STATE,BASELINE_LABEL,DB_TIMEOUT_MS} from './c25-c26-db.mjs'

const fixture=String.raw`
import copy
import tempfile
helper = load_helper(DB_HELPER)
def snapshot(rows, columns=None):
    columns = columns or {table: list(value[0]) if value else ['id', 'value'] for table, value in rows.items()}
    return {'columns': columns, 'columnMetadata': {t: [{'column': c, 'ordinal': i + 1} for i, c in enumerate(cs)] for t, cs in columns.items()},
        'projection': {t: {'rows': len(v), 'sha256': digest(v)} for t, v in rows.items()},
        'constraints': [], 'allPublicUserGuards': [], 'governanceGuards': [], 'qualityGuards': []}
def fixtures():
    names = [CHECKPOINTS, QUEUE, 'composite_report_jobs', 'export_batches', 'export_artifacts', 'submission_idempotency_receipts', 'checkin_submission_idempotency_receipts', 'facts']
    rows = {t: [] for t in names + ['empty_%03d' % i for i in range(209)]}
    for table, count in [(CHECKPOINTS, 21), ('composite_report_jobs', 148), ('export_batches', 42), ('export_artifacts', 42), ('facts', 6413)]:
        rows[table] = [{'id': str(i), 'value': 'unchanged'} for i in range(count)]
    rows[QUEUE] = [{'id': 'reports', 'pending': 0, 'complete_schema_column': 'exact'}]
    rows[CHECKPOINTS] = [{'id': str(i), 'attempt_id': 'old-' + str(i), 'payload_encrypted': 'ciphertext', 'payload_hash': 'hash', 'expires_at': 'exact'} for i in range(21)]
    protected = {'schemaVersion': 1, 'coreSnapshotSha256': CORE_SNAPSHOT_SHA256, 'snapshot': snapshot(rows), 'rows': rows}
    primary = copy.deepcopy(protected['snapshot'])
    return protected, primary
class FakeDB:
    def __init__(self, protected):
        self.current = copy.deepcopy(protected); self.calls = []
    def snapshot(self, database):
        assert database == WORKING; self.calls.append(('snapshot', database))
        result = copy.deepcopy(self.current['snapshot']); result['projection'] = snapshot(self.current['rows'])['projection']; return result
    def rows(self, columns, database):
        assert database == WORKING; self.calls.append(('rows', database)); return copy.deepcopy(self.current['rows'])
def summary(protected, primary, *, current=None, actual_primary=None, driver=None):
    current = copy.deepcopy(current or protected); current['snapshot']['projection'] = snapshot(current['rows'])['projection']
    return preservation_summary(protected, current, primary if actual_primary is None else actual_primary, primary, helper, driver or {})
def reject(fn, text):
    try: fn()
    except AssertionError as error:
        assert text in str(error), (text, str(error)); return
    raise AssertionError('fault accepted')
`
function python(body){
 const program=`scope={'__name__':'c26_fixture'}\nexec(compile(${JSON.stringify(INLINE_PYTHON)},'<c26-inline>','exec'),scope)\nexec(compile(${JSON.stringify(fixture+'\n'+body)},'<fake-db>','exec'),scope)`
 const run=spawnSync(process.env.C25_TEST_PYTHON??'python3',['-B','-c',program],{encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
 assert.equal(run.error,undefined);assert.equal(run.signal,null);assert.equal(run.status,0,run.stderr||run.stdout)
}
test('exact baseline protects 6667 rows and blocks both immediate cleanup receipt tables',()=>python(String.raw`
p, primary = fixtures()
assert validate_baseline(p, p['snapshot'], primary, primary)['rows'] == 6667
assert summary(p, primary)['allCoreRowsRetained'] is True
for table in ['submission_idempotency_receipts', 'checkin_submission_idempotency_receipts']:
    bad = copy.deepcopy(p); bad['rows'][table].append(bad['rows']['facts'].pop()); bad['snapshot'] = snapshot(bad['rows'])
    reject(lambda: validate_baseline(bad, bad['snapshot'], primary, primary), 'accepted protected count differs')
`))
test('full old-row multiset, checkpoint ciphertext and complete reports singleton cannot change',()=>python(String.raw`
p, primary = fixtures()
for table, key in [('facts', 'value'), (CHECKPOINTS, 'payload_encrypted'), (QUEUE, 'complete_schema_column')]:
    bad = copy.deepcopy(p); bad['rows'][table][0][key] = 'mutated'
    reject(lambda: summary(p, primary, current=bad), 'old full logical row')
p['rows']['facts'][1] = copy.deepcopy(p['rows']['facts'][0]); p['snapshot'] = snapshot(p['rows'])
bad = copy.deepcopy(p); bad['rows']['facts'].pop(1)
reject(lambda: summary(p, primary, current=bad), 'old full logical row')
bad = copy.deepcopy(p); bad['rows'][QUEUE].append(copy.deepcopy(bad['rows'][QUEUE][0]))
reject(lambda: summary(p, primary, current=bad), 'reports singleton')
`))
test('schema and primary drift fail; only successful driver admits its one completed new checkpoint',()=>python(String.raw`
p, primary = fixtures()
for field in ['columns', 'columnMetadata', 'constraints', 'allPublicUserGuards', 'governanceGuards', 'qualityGuards']:
    bad = copy.deepcopy(p); bad['snapshot'][field] = {}
    reject(lambda: summary(p, primary, current=bad), 'live schema changed')
reject(lambda: summary(p, primary, actual_primary={}), 'primary full snapshot changed')
driver = {'passed': True, 'workload': {'attemptId': 'new-attempt'}}
bad = copy.deepcopy(p); bad['rows'][CHECKPOINTS].append({'id': 'new', 'attempt_id': 'new-attempt', 'payload_encrypted': None, 'payload_hash': None, 'expires_at': None})
assert summary(p, primary, current=bad, driver=driver)['driverPassed'] is True
bad['rows'][CHECKPOINTS][-1]['attempt_id'] = 'other'
reject(lambda: summary(p, primary, current=bad, driver=driver), 'outside the actual fixture')
assert summary(p, primary, current=bad)['driverPassed'] is False
`))
test('complete private fsynced capture survives subsequent preservation failure',()=>python(String.raw`
p, primary = fixtures(); db = FakeDB(p); db.current['rows']['facts'][0]['value'] = 'mutation'
with tempfile.TemporaryDirectory() as temporary:
    state = Path(temporary); captured, rows_binding, snapshot_binding = capture_live(db, state, 'c25-c26-audit-final', 'final')
    for item in [rows_binding, snapshot_binding]:
        file = private_file(state / item['name']); assert sha_file(file) == item['sha256']
    assert json.loads((state / rows_binding['name']).read_text()) == captured
    reject(lambda: summary(p, primary, current=captured), 'old full logical row')
    assert db.calls == [('snapshot', WORKING), ('rows', WORKING)]
    reject(lambda: validate_baseline(captured, p['snapshot'], primary, primary), 'protected snapshot differs')
`))
test('fixed read-only CLI and inherited process-group deadline are bound',()=>{
 const args=['--python','/usr/bin/python3','--tools','/tools','--state',STATE,'--mode','baseline','--label',BASELINE_LABEL]
 assert.equal(invocation(args).node,'/tools/node_modules/node/bin/node');assert.equal(DB_TIMEOUT_MS,295000)
 assert.equal(inlinePythonSha256,createHash('sha256').update(INLINE_PYTHON).digest('hex'))
 for(const [index,value]of [[5,'/tmp/other'],[7,'restore'],[9,'c25-c26-audit-final']]){const bad=[...args];bad[index]=value;assert.throws(()=>invocation(bad))}
})
