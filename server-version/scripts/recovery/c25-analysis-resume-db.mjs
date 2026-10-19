/** C19 missing-phase read-only audit. No restore, migration, FINAL or worker is
 * dispatched here. Every live capture is durable before semantic validation. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {INLINE_PYTHON as ORIGINAL_INLINE_PYTHON} from './c25-analysis-db.mjs'
import {coreState,coreSnapshotSha256} from './c25-analysis-contract.mjs'
import {analysisResumeState,failedAnalysisState} from './c25-analysis-resume-contract.mjs'

const directory=path.dirname(fileURLToPath(import.meta.url))
export const BASELINE_LABEL='c25-analysis-resume-audit-baseline'
export const DB_TIMEOUT_MS=295000
export const CORE_SNAPSHOT_SHA256=coreSnapshotSha256

/** Built-ins only: authenticate captured ciphertext without importing an
 * application runtime or opening a connection. Nothing private is printed. */
export const CIPHERTEXT_PROOF_JS=String.raw`
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash,createDecipheriv} from 'node:crypto'
import {gunzipSync} from 'node:zlib'
const input=JSON.parse(fs.readFileSync(0,'utf8'))
const runtime=JSON.parse(fs.readFileSync(process.argv[1],'utf8'))
assert.match(runtime.DATA_ENCRYPTION_KEY,/^[a-fA-F0-9]{64}$/)
const key=Buffer.from(runtime.DATA_ENCRYPTION_KEY,'hex'),limit=8*1024*1024
const sha=value=>createHash('sha256').update(value).digest('hex')
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value
const hash=value=>sha(JSON.stringify(canonical(value)))
function decode(value){
 assert.equal(typeof value,'string');assert.ok(value.length>0&&value.length<2*(limit+1024)+66)
 let plain
 if(value.startsWith('ekc1:')){
  const m=/^ekc1:(gz|js):([a-f0-9]{16}):([1-9][0-9]*):([a-f0-9]{64}):([A-Za-z0-9+/]+={0,2})$/.exec(value);assert.ok(m)
  const size=Number(m[3]);assert.ok(Number.isSafeInteger(size)&&size<=limit);assert.equal(m[2],sha(key).slice(0,16))
  const packed=Buffer.from(m[5],'base64');assert.equal(packed.toString('base64'),m[5]);assert.ok(packed.length>=29&&packed.length<=limit+1024)
  const d=createDecipheriv('aes-256-gcm',key,packed.subarray(0,12));d.setAAD(Buffer.from(value.slice(0,-m[5].length)));d.setAuthTag(packed.subarray(12,28))
  const body=Buffer.concat([d.update(packed.subarray(28)),d.final()]);plain=m[1]==='gz'?gunzipSync(body,{maxOutputLength:size}):body
  assert.equal(plain.length,size);assert.equal(sha(plain),m[4])
 }else{
  const p=value.split(':');assert.equal(p.length,3);for(const x of p)assert.match(x,/^(?:[a-fA-F0-9]{2})+$/)
  assert.equal(p[0].length,32);assert.equal(p[1].length,32)
  const d=createDecipheriv('aes-256-gcm',key,Buffer.from(p[0],'hex'));d.setAuthTag(Buffer.from(p[1],'hex'))
  plain=Buffer.concat([d.update(Buffer.from(p[2],'hex')),d.final()]);assert.ok(plain.length<=limit)
 }
 return JSON.parse(plain.toString('utf8'))
}
const referenced=new Set()
for(const item of input.cases){
 const b=item.before,p=item.parent,j=item.job
 const oldPath=decode(b.training_flow_path_encrypted),newPath=decode(p.training_flow_path_encrypted)
 assert.equal(oldPath.schemaVersion,1);assert.equal(newPath.schemaVersion,1);assert.deepEqual(newPath,oldPath)
 assert.equal(hash(oldPath.value),b.training_flow_path_hash);assert.equal(hash(newPath.value),p.training_flow_path_hash)
 assert.equal(p.training_flow_path_hash,b.training_flow_path_hash)
 const binding={attemptId:p.id,attemptEpoch:p.attempt_epoch,slotSetHash:p.frozen_active_slot_set_hash,contextHash:p.context_snapshot_hash,aggregateInputHash:p.aggregate_input_hash}
 let report=decode(j.report_encrypted)
 if(report.schemaVersion===2){
  assert.equal(report.codec,'gzip-json-v1');assert.ok(Number.isSafeInteger(report.plainBytes)&&report.plainBytes>0&&report.plainBytes<=limit)
  const packed=Buffer.from(report.payload,'base64');assert.equal(packed.toString('base64'),report.payload)
  const plain=gunzipSync(packed,{maxOutputLength:limit});assert.equal(plain.length,report.plainBytes);assert.equal(sha(plain),report.plainSha256);report=JSON.parse(plain)
 }
 assert.deepEqual(report.binding,binding)
 if(report.kind==='COMPOSITE_REPORT_FACTS'){
  assert.equal(report.version,1);assert.equal(report.personal.id,p.id);assert.equal(report.units.length,item.scales.length);assert.ok(report.units.length>0)
  assert.deepEqual([...report.units.map(x=>x.assessmentId)].sort(),item.scales.map(x=>x.id).sort())
  for(const unit of report.units){const fact=input.scaleFacts.find(x=>x.assessment_id===unit.assessmentId&&x.attempt_epoch===p.attempt_epoch);assert.ok(fact);assert.equal(unit.sourceResultHash,fact.source_result_hash)}
  const template=input.templates.find(x=>x.template_hash===report.layout);assert.ok(template);assert.equal(template.template_kind,'COMPOSITE_REPORT_LAYOUT')
  const decoded=decode(template.payload_encrypted);assert.equal(decoded.version,1);assert.equal(decoded.kind,template.template_kind)
  assert.equal(Buffer.byteLength(JSON.stringify(canonical(decoded.value))),template.plaintext_bytes)
  assert.equal(hash({storageVersion:1,kind:decoded.kind,value:decoded.value}),template.template_hash)
  assert.equal(decoded.value.version,1);assert.equal(decoded.value.units.length,report.units.length)
  assert.equal(decoded.value.root.assessmentId,p.composite_assessment_id);referenced.add(template.template_hash)
 }else{
  assert.equal(report.schemaVersion,1);assert.equal(report.report.id,p.id);assert.ok(Array.isArray(report.report.unitReports));assert.ok(Array.isArray(report.policies))
  assert.equal(report.contentHash,hash({report:report.report,policies:report.policies}))
  assert.equal(report.report.unitReports.length,item.scales.length)
 }
}
for(const added of input.newTemplateHashes)assert.ok(referenced.has(added),'Unrelated appended template')
console.log(JSON.stringify({authenticatedReports:input.cases.length,unchangedDecryptedPaths:input.cases.length,newReferencedTemplates:input.newTemplateHashes.length}))
`

export const INLINE_PYTHON=String.raw`
import argparse
from collections import Counter
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import traceback

sys.dont_write_bytecode = True
original = {'__name__': 'c25_analysis_resume_immutable_library'}
exec(compile(${JSON.stringify(ORIGINAL_INLINE_PYTHON)}, '<immutable-analysis-inline>', 'exec'), original)
sha_file, digest = original['sha_file'], original['digest']
private_file = original['private_file']
load_helper, assert_projection = original['load_helper'], original['assert_projection']
assert_schema, assert_source_quiescent = original['assert_schema'], original['assert_source_quiescent']
STATE = Path(${JSON.stringify(analysisResumeState)})
FAILED_STATE = Path(${JSON.stringify(failedAnalysisState)})
CORE_STATE = Path(${JSON.stringify(coreState)})
DB_HELPER = Path(${JSON.stringify(path.join(directory,'c25-db.py'))})
CONTRACT = Path(${JSON.stringify(path.join(directory,'c25-analysis-resume-contract.mjs'))})
CORE_SNAPSHOT_SHA256 = ${JSON.stringify(CORE_SNAPSHOT_SHA256)}
BASELINE_LABEL = ${JSON.stringify(BASELINE_LABEL)}
PROTECTED_FILE = 'c25-analysis-resume-protected-rows-private.json'
SCOPE = 'C25_C19_MISSING_PHASE_EXACT_PARTIAL_ROW_PROTECTION'
PARENTS, JOBS, QUEUE = 'composite_assessment_attempts', 'composite_report_jobs', 'composite_report_queue_budget'
PARENT_COMPLETION_COLUMNS = frozenset(['status', 'progress', 'completed_items', 'completed_at', 'total_time',
    'last_saved_at', 'aggregate_input_hash', 'task_satisfaction', 'training_flow_path_encrypted'])
JOB_COMPLETION_COLUMNS = frozenset(['status', 'claimed_revision', 'attempt_count', 'budget_held',
    'next_attempt_at', 'report_encrypted', 'aggregate_input_hash', 'completed_at', 'updated_at'])
# Leases and errors are deliberately NOT exceptions: they start and finish NULL.
APPEND_TABLES = frozenset(['export_batches', 'export_artifacts', 'assessment_public_templates'])
SPECS = {'MA': {'types': ['FORM_SECTION', 'SCALE'], 'forms': 1, 'scales': 1, 'revision': 2, 'satisfaction': 'SATISFIED'},
         'SA': {'types': ['FORM_SECTION'], 'forms': 1, 'scales': 0, 'revision': 1, 'satisfaction': 'NOT_SATISFIED'},
         'MB': {'types': ['SCALE'], 'forms': 0, 'scales': 1, 'revision': 1, 'satisfaction': 'SATISFIED'}}
FACT_TABLES = {'forms': ('composite_form_section_attempts', 'attempt_id'), 'scales': ('assessments', 'composite_attempt_id'),
    'cognitive': ('cognitive_sessions', 'composite_attempt_id'), 'sjt': ('situational_attempts', 'composite_attempt_id'),
    'checkpoints': ('training_attempt_checkpoints', 'attempt_id'), 'snapshots': ('assessment_unit_snapshots', 'composite_attempt_id')}

def private_json(file, value):
    descriptor = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        json.dump(value, handle, indent=2)
        handle.flush()
        os.fsync(handle.fileno())

def counter(rows):
    return Counter(json.dumps(row, sort_keys=True, separators=(',', ':')) for row in rows)

def instant(value):
    assert isinstance(value, str) and value, 'nonempty timestamp required'
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)

def camel(column):
    words = column.split('_')
    return words[0] + ''.join(word[0].upper() + word[1:] for word in words[1:])

def frozen_row_matches(table, raw, frozen, snapshot):
    columns = snapshot['columns'][table]
    assert set(raw) == set(columns) and set(frozen) == {camel(c) for c in columns}, 'frozen full-column inventory differs: ' + table
    times = {m['column'] for m in snapshot['columnMetadata'][table] if m.get('type', '').startswith('timestamp')}
    for column in columns:
        value = frozen[camel(column)]
        if column in times and value is not None and raw[column] is not None:
            assert instant(raw[column]) == instant(value), 'frozen timestamp differs: ' + table + '.' + column
        else:
            assert raw[column] == value, 'frozen full logical value differs: ' + table + '.' + column

def by_id(rows, column='id'):
    result = {row[column]: row for row in rows}
    assert len(result) == len(rows), 'duplicate row identity'
    return result

def one(rows, identifier):
    result = [row for row in rows if row['id'] == identifier]
    assert len(result) == 1, 'missing or duplicated frozen identity'
    return result[0]

def validate_original(document, expected):
    original['validate_protected'](document, expected)
    assert document['rows'][QUEUE] == [{'id': 'reports', 'pending': 0}], 'original reports budget is not exactly zero'

def validate_capture(capture):
    assert capture['schemaVersion'] == 1 and capture['coreSnapshotSha256'] == CORE_SNAPSHOT_SHA256
    assert_projection(capture['snapshot'], capture['rows'])
    assert len(capture['rows']) == 217, 'current capture must contain all 217 tables'
    count = sum(map(len, capture['rows'].values()))
    assert capture['observedRows'] == count, 'observed current row count differs'
    return count

def retained_original(core, current, helper, admission):
    assert_schema(core['snapshot'], current['snapshot'])
    validate_capture(current)
    old, now = core['rows'], current['rows']
    assert old[QUEUE] == [{'id': 'reports', 'pending': 0}]
    assert now[QUEUE] == [{'id': 'reports', 'pending': 3 if admission else 0}], 'reports budget is not the exact permitted state'
    # Remove one exact singleton, never a table-wide/column-wide projection.
    checked = 0
    for table, rows in old.items():
        original_rows = [row for row in rows if not (table == QUEUE and row == {'id': 'reports', 'pending': 0})] if admission else rows
        assert not helper.row_counter(original_rows) - helper.row_counter(now[table]), 'original full logical row changed or disappeared: ' + table
        checked += len(original_rows)
    assert checked == (6666 if admission else 6667)
    assert counter(now['training_attempt_checkpoints']) == counter(old['training_attempt_checkpoints']), 'all 21 checkpoints must remain exact'
    assert len(now['training_attempt_checkpoints']) == 21
    return checked

def frozen_cases(before, fixture, capture, *, parents_pending):
    assert set(fixture['cases']) == set(SPECS) and len(before['cases']) == 3
    assert before['queue'] == {'id': 'reports', 'pending': 3}
    assert len(before['otherJobs']) == 148
    current, snapshot = capture['rows'], capture['snapshot']
    parent_ids = [fixture['cases'][name]['attemptId'] for name in SPECS]
    assert len(set(parent_ids)) == 3
    jobs = [row for row in current[JOBS] if row['attempt_id'] in parent_ids]
    assert len(jobs) == 3 and len(current[JOBS]) == 151, 'exact old 148 and new three jobs required'
    result = []
    assert len({row['parent']['id'] for row in before['cases']}) == 3
    for name, spec in SPECS.items():
        identity = fixture['cases'][name]
        frozen = next((row for row in before['cases'] if row['parent']['id'] == identity['attemptId']), None)
        assert frozen is not None, 'missing frozen attempt'
        p = one(current[PARENTS], identity['attemptId'])
        j = one(jobs, frozen['job']['id'])
        assert p['user_id'] == identity['actorId'] and p['delivery_course_id'] == fixture['courseId']
        assert p['composite_assessment_id'] == identity['taskId'] and p['attempt_epoch'] == identity['attemptEpoch']
        assert p['async_report_epoch'] == identity['attemptEpoch'] and p['assignment_ref'] is None
        assert j['attempt_id'] == p['id'] and j['attempt_epoch'] == p['attempt_epoch']
        assert j['slot_set_hash'] == p['frozen_active_slot_set_hash'] and j['context_hash'] == p['context_snapshot_hash']
        assert j['requested_revision'] == spec['revision']
        if parents_pending:
            frozen_row_matches(PARENTS, p, frozen['parent'], snapshot)
            frozen_row_matches(JOBS, j, frozen['job'], snapshot)
            assert p['status'] == 'IN_PROGRESS' and p['progress'] == 0 and p['completed_items'] == 0
            assert all(p[c] is None for c in ['completed_at', 'total_time', 'aggregate_input_hash', 'task_satisfaction'])
            assert j['status'] == 'PENDING' and j['attempt_count'] == 0 and j['budget_held'] is True and j['claimed_revision'] == 0
            assert all(j[c] is None for c in ['lease_token', 'lease_expires_at', 'error_code', 'completed_at', 'aggregate_input_hash', 'report_encrypted'])
        for label, (table, fk) in FACT_TABLES.items():
            rows = [row for row in current[table] if row[fk] == p['id']]
            old_rows = frozen[label]
            assert len(rows) == len(old_rows), 'accepted fact inventory changed: ' + table
            if label == 'checkpoints':
                assert not rows
            else:
                old_by_id = by_id(old_rows)
                for row in rows:
                    assert row['id'] in old_by_id, 'new or replaced accepted fact'
                    frozen_row_matches(table, row, old_by_id[row['id']], snapshot)
            if label in ['forms', 'scales']:
                assert len(rows) == spec[label]
            if label in ['cognitive', 'sjt']:
                assert not rows
        snapshots = [row for row in current['assessment_unit_snapshots'] if row['composite_attempt_id'] == p['id']]
        assert sorted(row['unit_type'] for row in snapshots) == sorted(spec['types'])
        assert all(row['terminal_state'] == 'COMPLETED' and row['attempt_epoch'] == p['attempt_epoch'] for row in snapshots)
        result.append({'name': name, 'parent': p, 'job': j, 'snapshots': snapshots,
                       'scales': [row for row in current['assessments'] if row['composite_attempt_id'] == p['id']]})
    assert sum(len(case['snapshots']) for case in result) == 4
    old_jobs = by_id(before['otherJobs'])
    other = [row for row in current[JOBS] if row['attempt_id'] not in parent_ids]
    assert len(other) == len(old_jobs) == 148
    for row in other:
        assert row['id'] in old_jobs
        frozen_row_matches(JOBS, row, old_jobs[row['id']], snapshot)
    assert sum(row['budget_held'] is True for row in current[JOBS]) == (3 if parents_pending else 0), 'held job inventory does not explain reports budget'
    return result

def admission_summary(core, current, before, fixture, helper):
    retained_original(core, current, helper, True)
    cases = frozen_cases(before, fixture, current, parents_pending=True)
    assert not ({x['parent']['id'] for x in cases} & {x['id'] for x in core['rows'][PARENTS]}), 'partial parents must be new'
    assert not ({x['job']['id'] for x in cases} & {x['id'] for x in core['rows'][JOBS]}), 'partial jobs must be new'
    return {'allOriginal6666RowsExact': True, 'originalReportsRowExactExceptPending0To3': True,
            'threeOriginalPendingJobsFullRowExact': True, 'acceptedUnitSnapshotsExact': 4,
            'allCheckpointRowsExact': True, 'checkpointRows': 21, 'tables': 217,
            'currentRows': current['observedRows'], 'currentSnapshotSha256': digest(current['snapshot'])}

def transition(before, after, allowed, kind):
    assert set(before) == set(after), kind + ' column inventory changed'
    assert allowed <= set(before), kind + ' completion column missing'
    assert {k: v for k, v in before.items() if k not in allowed} == {k: v for k, v in after.items() if k not in allowed}, 'non-completion column changed: ' + kind

def final_summary(core, partial, current, before, fixture, helper):
    admission_summary(core, partial, before, fixture, helper)
    retained_original(core, current, helper, False)
    assert_schema(partial['snapshot'], current['snapshot'])
    cases = frozen_cases(before, fixture, current, parents_pending=False)
    ids = {case['parent']['id'] for case in cases}
    job_ids = {case['job']['id'] for case in cases}
    additions = {}
    for table, rows in partial['rows'].items():
        if table == QUEUE:
            assert rows == [{'id': 'reports', 'pending': 3}]
            continue
        exempt_ids = ids if table == PARENTS else job_ids if table == JOBS else set()
        immutable = [row for row in rows if row.get('id') not in exempt_ids]
        now_immutable = [row for row in current['rows'][table] if row.get('id') not in exempt_ids]
        previous, now = counter(immutable), counter(now_immutable)
        assert not previous - now, 'partial full logical row changed or deleted: ' + table
        added = [json.loads(row) for row in (now - previous).elements()]
        assert not added or table in APPEND_TABLES, 'unapproved added rows: ' + table
        if added:
            additions[table] = added
    proof_cases = []
    for case in cases:
        p, j, spec = case['parent'], case['job'], SPECS[case['name']]
        bp, bj = one(partial['rows'][PARENTS], p['id']), one(partial['rows'][JOBS], j['id'])
        transition(bp, p, PARENT_COMPLETION_COLUMNS, 'parent')
        transition(bj, j, JOB_COMPLETION_COLUMNS, 'job')
        assert p['status'] == 'COMPLETED' and p['progress'] == 100
        assert p['completed_items'] == len(case['snapshots']) and p['task_satisfaction'] == spec['satisfaction']
        completed = max(instant(row['completed_at']) for row in case['snapshots'])
        assert instant(p['completed_at']) == instant(p['last_saved_at']) == completed, 'completion timestamps are not accepted snapshot time'
        total = max(0, (completed - instant(bp['started_at'])) // timedelta(milliseconds=1))
        assert p['total_time'] == total, 'completion duration differs from accepted snapshot time'
        assert re.fullmatch('[a-f0-9]{64}', p['aggregate_input_hash'] or ''), 'real aggregate hash required'
        assert isinstance(p['training_flow_path_encrypted'], str) and p['training_flow_path_encrypted']
        assert j['status'] == 'READY' and j['attempt_count'] == 1 and j['budget_held'] is False
        assert j['claimed_revision'] == j['requested_revision'] == spec['revision']
        assert all(j[c] is None for c in ['lease_token', 'lease_expires_at', 'error_code'])
        assert j['aggregate_input_hash'] == p['aggregate_input_hash']
        assert isinstance(j['report_encrypted'], str) and j['report_encrypted'], 'real encrypted report required'
        assert instant(j['completed_at']) >= completed
        assert instant(j['updated_at']) >= instant(bj['updated_at']) and instant(j['updated_at']) >= instant(j['completed_at'])
        assert instant(j['next_attempt_at']) >= instant(bj['next_attempt_at'])
        proof_cases.append({**case, 'before': bp})
    batches, artifacts = additions.get('export_batches', []), additions.get('export_artifacts', [])
    assert len(batches) == len(artifacts) and len(batches) <= 1, 'at most one ordinary export pair is allowed'
    if batches:
        batch, artifact = batches[0], artifacts[0]
        for row in [batch, artifact]:
            assert row['resource_type'] == 'TRAINING_ANALYSIS' and row['resource_id'] == fixture['courseId']
            assert row['created_by'] == fixture['actors']['teacher'] and row['anonymized'] is True
            assert row['status'] == 'READY' and row['error_code'] is None
        assert artifact['batch_id'] == batch['id'] and artifact['format'] == 'csv' and batch['formats'] == ['csv']
        assert batch['record_count'] == 4 and batch['field_count'] == 24
        assert batch['generation'] == 1, 'ordinary export must be claimed only once'
        assert batch['processing_job_id'] is None and batch['processing_started_at'] is None
        assert batch['options']['trainingAnalysis'] == artifact['provenance']['trainingAnalysis']
        options, provenance = batch['options']['trainingAnalysis'], artifact['provenance']
        assert options['version'] == 1 and options['table'] == 'long'
        assert options['selector']['courseId'] == options['manifest']['courseId'] == fixture['courseId']
        assert options['manifest']['actor'] == {'id': fixture['actors']['teacher'], 'role': 'TEACHER'}
        assert batch['options']['anonymize'] is True and batch['options']['creatorRole'] == 'TEACHER'
        assert provenance['version'] == 2 and provenance['resourceType'] == 'TRAINING_ANALYSIS'
        assert provenance['creatorRole'] == 'TEACHER' and provenance['audience'] == 'teacher'
        # The original worker replaces the initial batch ID with randomUUID()
        # at publication; it is a UUID, not a second batch identity.
        assert re.fullmatch('[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', provenance['generation']), 'published export generation must be a UUIDv4'
    new_templates = additions.get('assessment_public_templates', [])
    assert len(new_templates) <= 2 and all(row['template_kind'] == 'COMPOSITE_REPORT_LAYOUT' for row in new_templates), 'only at most two new report layouts are allowed'
    return ({'allCoreRowsRetained': True, 'oldTables': 217, 'oldRows': 6667,
             'originalReportsBudgetRestoredExactly': True, 'allPartialRowsRetained': True,
             'partialRows': partial['observedRows'], 'checkpointRows': 21, 'allCheckpointRowsExact': True,
             'acceptedUnitSnapshotsExact': 4, 'exactParentCompletionTransitions': 3, 'exactJobCompletionTransitions': 3,
             'parentCompletionColumns': sorted(PARENT_COMPLETION_COLUMNS), 'jobCompletionColumns': sorted(JOB_COMPLETION_COLUMNS),
             'nonlistedColumnsExact': True, 'liveSchemaExact': True, 'currentRows': current['observedRows'],
             'currentSnapshotSha256': digest(current['snapshot']), 'ordinaryAddedRows': {k: len(v) for k, v in additions.items()}},
            {'cases': proof_cases, 'templates': current['rows']['assessment_public_templates'],
             'scaleFacts': current['rows']['assessment_result_facts'], 'newTemplateHashes': [row['template_hash'] for row in new_templates]})

def capture_live(db, state, label, mode):
    # Persist the raw snapshot (including schema and every column) immediately.
    # A later row-query failure therefore still leaves the actual snapshot.
    snapshot = db.snapshot()
    snapshot_path = state / ('c25-analysis-resume-final-db-snapshot.json' if mode == 'final' else label + '-db-snapshot.json')
    private_json(snapshot_path, snapshot)
    rows = db.rows(snapshot['columns'])
    capture = {'schemaVersion': 1, 'coreSnapshotSha256': CORE_SNAPSHOT_SHA256,
               'observedRows': sum(map(len, rows.values())), 'snapshot': snapshot, 'rows': rows}
    capture_path = state / (PROTECTED_FILE if mode == 'baseline' else label + '-rows-private.json')
    private_json(capture_path, capture)
    return capture, {'name': capture_path.name, 'sha256': sha_file(capture_path)}, {'name': snapshot_path.name, 'sha256': sha_file(snapshot_path)}

def all_bindings(value):
    result = {}
    def visit(node):
        if isinstance(node, dict):
            if isinstance(node.get('path'), str) and re.fullmatch('[a-f0-9]{64}', str(node.get('sha256', ''))):
                path = Path(node['path'])
                assert path.is_absolute()
                digest_value = sha_file(private_file(path))
                assert digest_value == node['sha256'], 'prerequisite file binding changed'
                assert str(path) not in result or result[str(path)] == digest_value
                result[str(path)] = digest_value
            for child in node.values():
                visit(child)
        elif isinstance(node, list):
            for child in node:
                visit(child)
    visit(value)
    return result

def evidence_inputs(args):
    assert args.state == STATE and args.failure_state == FAILED_STATE and args.core_state == CORE_STATE
    assert args.node == args.tools / 'node_modules/node/bin/node' and args.contract == CONTRACT and args.db_helper == DB_HELPER
    for directory in [args.state, args.failure_state, args.core_state]:
        assert directory.is_absolute() and directory.resolve() == directory and directory.is_dir()
        assert all(not part.is_symlink() for part in [directory, *directory.parents])
    prerequisite_file = private_file(args.state / 'c25-analysis-resume-prerequisites.json')
    references = {str(prerequisite_file): sha_file(prerequisite_file)}
    python_helpers = sorted(DB_HELPER.parent.glob('*.py'))
    assert len(python_helpers) == 72, 'immutable 72-file Python helper inventory changed'
    backend = DB_HELPER.parents[2] / 'backend'
    bound = [args.node, args.contract, DB_HELPER.parent / 'c25-analysis-resume-db.mjs',
        DB_HELPER.parent / 'c25-analysis-db.mjs', DB_HELPER.parent / 'c25-missing-db.mjs',
        backend / 'prisma/schema.prisma',
        backend / 'src/modules/assessment-runtime/unified-aggregate-finalizer.service.ts',
        backend / 'src/modules/assessment-runtime/report-outbox.service.ts', *python_helpers]
    assert all(file.is_file() and not file.is_symlink() for file in bound), 'unbound helper/source alias'
    source_bindings = {str(file): sha_file(file) for file in bound}
    run = subprocess.run([str(args.node), str(args.contract), '--validate-prerequisites', str(args.state)],
        text=True, capture_output=True, timeout=30, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
    assert run.returncode == 0, 'hash-bound resume prerequisites rejected'
    output = json.loads(run.stdout)
    assert output['valid'] is True and output['sourceRows'] == 6667 and output['sourceSnapshotSha256'] == CORE_SNAPSHOT_SHA256
    assert sha_file(prerequisite_file) == references[str(prerequisite_file)]
    prerequisites = json.loads(prerequisite_file.read_text())
    references.update(all_bindings(prerequisites))
    required = [args.failure_state / name for name in ['c25-analysis-result.json', 'c25-analysis-protected-rows-private.json',
        'c25-analysis-before-drain-private.json', 'c25-analysis-fixture-private.json']]
    required.append(args.core_state / 'c25-missing-final-db-snapshot.json')
    assert all(str(file) in references for file in required), 'required original full rows, failed receipt, private facts or schema are not bound'
    assert all(sha_file(Path(file)) == value for file, value in source_bindings.items()), 'bound audit helper changed'
    references.update(source_bindings)
    runtime = private_file(args.state / 'runtime-private.json')
    references[str(runtime)] = sha_file(runtime)
    core = json.loads(required[1].read_text())
    before = json.loads(required[2].read_text())
    fixture = json.loads(required[3].read_text())
    expected = json.loads(required[4].read_text())
    return core, expected, before, fixture, prerequisites, references

def read_partial(state):
    receipt_file = private_file(state / (BASELINE_LABEL + '-result.json'))
    receipt = json.loads(receipt_file.read_text())
    assert receipt['passed'] is True and receipt['mode'] == 'baseline' and receipt['scope'] == SCOPE
    binding = receipt['protectedRowsFile']
    assert binding['name'] == PROTECTED_FILE
    file = private_file(state / PROTECTED_FILE)
    assert sha_file(file) == binding['sha256'], 'partial full-row baseline changed'
    return json.loads(file.read_text()), {str(file): binding['sha256'], str(receipt_file): sha_file(receipt_file)}

def prove_ciphertexts(args, proof, db):
    run = subprocess.run([str(args.node), '--input-type=module', '-e', ${JSON.stringify(CIPHERTEXT_PROOF_JS)}, str(args.state / 'runtime-private.json')],
        input=json.dumps(proof), text=True, capture_output=True, timeout=30, env=db.env)
    db.exits['c25-analysis-resume-ciphertext-proof'] = run.returncode
    assert run.returncode == 0, 'captured report/path ciphertext authentication or binding failed'
    result = json.loads(run.stdout)
    assert result == {'authenticatedReports': 3, 'unchangedDecryptedPaths': 3, 'newReferencedTemplates': len(proof['newTemplateHashes'])}
    return result

def main():
    parser = argparse.ArgumentParser(description='Read-only missing-phase C19 audit; never restore or migrate')
    for name in ['db-helper', 'tools', 'state', 'failure-state', 'core-state', 'node', 'contract']:
        parser.add_argument('--' + name, required=True, type=Path)
    parser.add_argument('--mode', required=True, choices=['baseline', 'preserve', 'final'])
    parser.add_argument('--label', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    assert args.state == STATE and args.state.is_dir() and all(not part.is_symlink() for part in [args.state, *args.state.parents])
    assert re.fullmatch('c25-analysis-resume-[a-z-]+', args.label)
    assert (args.label == BASELINE_LABEL) == (args.mode == 'baseline')
    result_path = args.state / (args.label + '-result.json')
    descriptor = os.open(result_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    result = {'schemaVersion': 1, 'passed': False, 'mode': args.mode, 'scope': SCOPE,
        'coreSnapshotSha256': CORE_SNAPSHOT_SHA256, 'migrationRerun': False, 'newDatabaseRestoreExecuted': False,
        'historicalBaselinesCopied': False}
    db, failure = None, None
    try:
        core, expected, before, fixture, prerequisites, references = evidence_inputs(args)
        result['inheritedEvidence'] = references
        helper = load_helper(args.db_helper)
        db = helper.Database(args.tools, args.state)
        db.env['PGOPTIONS'] += ' -c default_transaction_read_only=on'
        result['databaseReadOnly'] = True
        # This is intentionally before quiescence, schema, queue, row, frozen
        # fact or completion assertions. Failed assertions cannot erase it.
        current, capture_binding, snapshot_binding = capture_live(db, args.state, args.label, args.mode)
        result['currentRowsFile'], result['currentSnapshotFile'] = capture_binding, snapshot_binding
        result['currentRows'] = current['observedRows']
        if args.mode == 'baseline':
            result['protectedRowsFile'] = capture_binding
        if args.mode == 'final':
            result['finalSnapshot'] = snapshot_binding
            result['snapshotSha256'] = snapshot_binding['sha256']
        assert_source_quiescent(db) if args.mode in ['baseline', 'final'] else None
        validate_original(core, expected)
        if args.mode == 'baseline':
            summary = admission_summary(core, current, before, fixture, helper)
        else:
            partial, partial_references = read_partial(args.state)
            references.update(partial_references)
            summary, proof = final_summary(core, partial, current, before, fixture, helper)
            result['reportMaterializationProof'] = prove_ciphertexts(args, proof, db)
        result['protectedCoreFacts'] = summary
        result['currentSnapshotSha256'] = digest(current['snapshot'])
        inherited = prerequisites['originalCore']
        audit_file = private_file(CORE_STATE / 'c25-missing-audit-final-result.json')
        assert str(audit_file) in references
        audit = json.loads(audit_file.read_text())
        result['inheritedCorePreservation'] = {'execution': 'INHERITED_ACCEPTED_CORE_AUDIT_AND_RESTORE', 'accepted': inherited['accepted']}
        result['retainedFacts'] = audit['retainedFacts']
        result['retainedFactsExecution'] = 'INHERITED_ACCEPTED_CORE_AUDIT_AND_RESTORE'
        assert all(sha_file(Path(file)) == value for file, value in references.items()), 'audit input changed during capture or validation'
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
            handle.flush()
            os.fsync(handle.fileno())
    print(json.dumps({'passed': result['passed'], 'mode': args.mode, 'result': result_path.name, 'resultSha256': sha_file(result_path)}))
    if failure is not None:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
`

export const inlinePythonSha256=createHash('sha256').update(INLINE_PYTHON).digest('hex')
export function invocation(argv){
 const names=['python','node','db-helper','contract','tools','state','failure-state','core-state','mode','label'],values={}
 assert.equal(argv.length,names.length*2,'exact resume audit arguments required')
 for(let i=0;i<argv.length;i+=2){const key=argv[i]?.replace(/^--/,'');assert.ok(argv[i]?.startsWith('--')&&names.includes(key)&&!Object.hasOwn(values,key));assert.ok(argv[i+1]&&!argv[i+1].startsWith('--'));values[key]=argv[i+1]}
 for(const key of names.filter(key=>!['mode','label'].includes(key))){assert.ok(path.isAbsolute(values[key]));assert.equal(path.resolve(values[key]),values[key])}
 assert.equal(values.state,analysisResumeState);assert.equal(values['failure-state'],failedAnalysisState);assert.equal(values['core-state'],coreState)
 assert.equal(values['db-helper'],path.join(directory,'c25-db.py'));assert.equal(values.contract,path.join(directory,'c25-analysis-resume-contract.mjs'))
 assert.equal(values.node,path.join(values.tools,'node_modules/node/bin/node'))
 assert.ok(['baseline','preserve','final'].includes(values.mode),'only read-only audit modes are available')
 assert.match(values.label,/^c25-analysis-resume-[a-z-]+$/);assert.equal(values.label===BASELINE_LABEL,values.mode==='baseline')
 return {python:values.python,node:values.node,args:['-B','-c',INLINE_PYTHON,...names.filter(key=>key!=='python').flatMap(key=>['--'+key,values[key]])]}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  process.umask(0o077)
  const command=invocation(process.argv.slice(2));assert.equal(process.execPath,command.node);assert.ok(fs.statSync(command.python).isFile())
  const run=spawnSync(command.python,command.args,{stdio:'inherit',detached:false,timeout:DB_TIMEOUT_MS,killSignal:'SIGKILL',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
  if(run.error)throw run.error
  process.exitCode=run.status===0&&!run.signal?0:1
 }catch(error){console.error(JSON.stringify({passed:false,errorType:error.name,message:'Resume audit failed; inspect private evidence.'}));process.exitCode=1}
}
