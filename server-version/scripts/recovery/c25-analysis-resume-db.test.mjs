/** New pure audit cases. These tests never connect to PostgreSQL or launch an
 * application, worker, migration or restore. They are prepared, not auto-run. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash,createCipheriv,randomBytes} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
import {analysisResumeState,failedAnalysisState} from './c25-analysis-resume-contract.mjs'
import {coreState} from './c25-analysis-contract.mjs'
import {INLINE_PYTHON,CIPHERTEXT_PROOF_JS,inlinePythonSha256,invocation,BASELINE_LABEL,DB_TIMEOUT_MS} from './c25-analysis-resume-db.mjs'

const directory=path.dirname(fileURLToPath(import.meta.url)),helper=path.join(directory,'c25-db.py')
const fixture=String.raw`
import copy
import tempfile
import stat
helper = load_helper(Path(HELPER_PATH))

def snapshot_for(columns, rows):
    return {'columns': copy.deepcopy(columns),
        'columnMetadata': {table: [{'column': column, 'ordinal': i+1,
            'type': 'timestamp without time zone' if column.endswith('_at') else 'text'} for i,column in enumerate(names)] for table,names in columns.items()},
        'projection': {table: {'rows': len(value), 'sha256': digest(value)} for table,value in rows.items()},
        'constraints': [], 'allPublicUserGuards': [], 'governanceGuards': [], 'qualityGuards': []}

def recapture(value):
    value['snapshot'] = snapshot_for(value['snapshot']['columns'], value['rows'])
    value['observedRows'] = sum(map(len, value['rows'].values()))
    return value

def frozen(raw):
    return {camel(k): (v+'Z' if k.endswith('_at') and isinstance(v,str) else copy.deepcopy(v)) for k,v in raw.items()}

def fixtures():
    tables = ['_prisma_migrations','training_attempt_checkpoints','submission_idempotency_receipts',
        'checkin_submission_idempotency_receipts',PARENTS,JOBS,QUEUE,'export_batches','export_artifacts',
        'assessment_unit_snapshots','composite_form_section_attempts','assessments','cognitive_sessions',
        'situational_attempts','assessment_public_templates','assessment_result_facts','facts']
    tables += ['other_%03d'%i for i in range(217-len(tables))]
    columns = {table: ['id','value'] for table in tables}
    columns[QUEUE] = ['id','pending']
    columns[PARENTS] = ['id','user_id','delivery_course_id','composite_assessment_id','attempt_epoch','async_report_epoch',
        'assignment_ref','status','progress','completed_items','completed_at','last_saved_at','started_at','total_time',
        'aggregate_input_hash','task_satisfaction','training_flow_path_encrypted','training_flow_path_hash',
        'frozen_active_slot_set_hash','context_snapshot_hash','training_feedback_snapshot','training_feedback_snapshot_hash']
    columns[JOBS] = ['id','attempt_id','attempt_epoch','slot_set_hash','context_hash','requested_revision','claimed_revision',
        'status','attempt_count','budget_held','lease_token','lease_expires_at','error_code','completed_at','aggregate_input_hash',
        'report_encrypted','created_at','updated_at','next_attempt_at','whole_submission_id']
    columns['training_attempt_checkpoints'] = ['attempt_id','payload_encrypted']
    columns['assessment_unit_snapshots'] = ['id','composite_attempt_id','attempt_epoch','unit_type','terminal_state','completed_at','canonical_result_encrypted']
    columns['composite_form_section_attempts'] = ['id','attempt_id','value']
    for table in ['assessments','cognitive_sessions','situational_attempts']:
        columns[table] = ['id','composite_attempt_id','value']
    columns['assessment_public_templates'] = ['template_hash','template_kind','plaintext_bytes','payload_encrypted','created_at']
    columns['assessment_result_facts'] = ['assessment_id','attempt_epoch','source_result_hash','facts_encrypted']
    columns['export_batches'] = ['id','resource_type','resource_id','created_by','anonymized','formats','status','error_code',
        'record_count','field_count','generation','processing_job_id','processing_started_at','options']
    columns['export_artifacts'] = ['id','resource_type','resource_id','created_by','anonymized','format','status','error_code','batch_id','provenance']
    rows = {table: [] for table in tables}
    rows['_prisma_migrations'] = [{'id':'old-migration','value':'exact'}]
    rows['training_attempt_checkpoints'] = [{'attempt_id':'old-cp-%d'%i,'payload_encrypted':'exact-%d'%i} for i in range(21)]
    rows[QUEUE] = [{'id':'reports','pending':0}]
    for i in range(148):
        row = {key: None for key in columns[JOBS]}
        row.update(id='old-job-%d'%i,attempt_id='old-parent-%d'%i,attempt_epoch=1,status='READY',attempt_count=1,budget_held=False)
        rows[JOBS].append(row)
    for table in ['export_batches','export_artifacts']:
        rows[table] = [{**{key:None for key in columns[table]},'id':'old-'+table+'-%d'%i} for i in range(42)]
    count = sum(map(len, rows.values()))
    rows['facts'] = [{'id':'old-fact-%d'%i,'value':'exact'} for i in range(6667-count)]
    expected = snapshot_for(columns,rows)
    core = {'schemaVersion':1,'coreSnapshotSha256':CORE_SNAPSHOT_SHA256,'snapshot':expected,'rows':copy.deepcopy(rows)}
    partial = {'schemaVersion':1,'coreSnapshotSha256':CORE_SNAPSHOT_SHA256,'snapshot':copy.deepcopy(expected),'rows':copy.deepcopy(rows)}
    partial['rows'][QUEUE][0]['pending'] = 3
    fixture = {'courseId':'new-course','actors':{'teacher':'teacher'},'cases':{}}
    before = {'cases':[],'queue':{'id':'reports','pending':3},'otherJobs':[frozen(row) for row in rows[JOBS]]}
    for name,spec in SPECS.items():
        pid='new-'+name
        p = {key:None for key in columns[PARENTS]}
        p.update(id=pid,user_id='actor-'+name,delivery_course_id='new-course',composite_assessment_id='task-'+name,
            attempt_epoch=1,async_report_epoch=1,status='IN_PROGRESS',progress=0,completed_items=0,
            last_saved_at='2026-10-19T12:00:00.000',started_at='2026-10-19T12:00:00.000',
            training_flow_path_encrypted='old-cipher-'+name,training_flow_path_hash='a'*64,
            frozen_active_slot_set_hash='b'*64,context_snapshot_hash='c'*64,
            training_feedback_snapshot={'keep':'exact'},training_feedback_snapshot_hash='d'*64)
        j = {key:None for key in columns[JOBS]}
        j.update(id='job-'+name,attempt_id=pid,attempt_epoch=1,slot_set_hash='b'*64,context_hash='c'*64,
            requested_revision=spec['revision'],claimed_revision=0,status='PENDING',attempt_count=0,budget_held=True,
            created_at='2026-10-19T12:00:00.010',updated_at='2026-10-19T12:00:00.020',next_attempt_at='2026-10-19T12:00:00.020')
        partial['rows'][PARENTS].append(p); partial['rows'][JOBS].append(j)
        case = {'parent':frozen(p),'job':frozen(j)}
        for label,(table,fk) in FACT_TABLES.items():
            facts=[]
            if label == 'snapshots':
                facts=[{'id':'snapshot-'+name+'-'+str(i),fk:pid,'attempt_epoch':1,'unit_type':kind,
                    'terminal_state':'COMPLETED','completed_at':'2026-10-19T12:00:00.123','canonical_result_encrypted':'immutable-cipher'} for i,kind in enumerate(spec['types'])]
            elif label in ['forms','scales']:
                facts=[{'id':label+'-'+name,fk:pid,'value':'accepted-full-fact'} for _ in range(spec[label])]
            partial['rows'][table] += facts
            case[label]=[frozen(row) for row in facts]
        fixture['cases'][name]={'attemptId':pid,'attemptEpoch':1,'actorId':'actor-'+name,'taskId':'task-'+name}
        before['cases'].append(case)
    recapture(partial)
    return core,partial,before,fixture

def completed(partial):
    value=copy.deepcopy(partial)
    value['rows'][QUEUE][0]['pending']=0
    for name,spec in SPECS.items():
        p=one(value['rows'][PARENTS],'new-'+name);j=one(value['rows'][JOBS],'job-'+name)
        p.update(status='COMPLETED',progress=100,completed_items=len(spec['types']),completed_at='2026-10-19T12:00:00.123',
            last_saved_at='2026-10-19T12:00:00.123',total_time=123,aggregate_input_hash='e'*64,
            task_satisfaction=spec['satisfaction'],training_flow_path_encrypted='new-cipher-'+name)
        j.update(status='READY',claimed_revision=spec['revision'],attempt_count=1,budget_held=False,
            next_attempt_at='2026-10-19T12:00:01.000',report_encrypted='real-cipher-'+name,aggregate_input_hash='e'*64,
            completed_at='2026-10-19T12:00:01.000',updated_at='2026-10-19T12:00:01.000')
    return recapture(value)

def rejected(fn,message=None):
    try: fn()
    except (AssertionError,KeyError,TypeError,ValueError) as error:
        if message is not None: assert message in str(error),(message,str(error))
        return
    raise AssertionError('fault unexpectedly accepted')
`

function pythonContract(body){
 const program=`scope={'__name__':'c25_analysis_resume_contract_fixture'}\nexec(compile(${JSON.stringify(INLINE_PYTHON)},'<resume-inline>','exec'),scope)\nscope['HELPER_PATH']=${JSON.stringify(helper)}\nexec(compile(${JSON.stringify(fixture+'\n'+body)},'<pure-resume-cases>','exec'),scope)\n`
 const run=spawnSync(process.env.C25_TEST_PYTHON??'python3',['-B','-c',program],{encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
 assert.equal(run.error,undefined);assert.equal(run.signal,null);assert.equal(run.status,0,run.stderr||run.stdout)
}

test('admission preserves every original row except exactly reports 0→3 and proves all three full pending rows',()=>{
 pythonContract(String.raw`
core,partial,before,fixture=fixtures()
validate_original(core,core['snapshot'])
summary=admission_summary(core,partial,before,fixture,helper)
assert summary['allOriginal6666RowsExact'] and summary['threeOriginalPendingJobsFullRowExact']
assert summary['acceptedUnitSnapshotsExact']==4 and summary['checkpointRows']==21
assert summary['currentRows']==sum(map(len,partial['rows'].values()))>6667
assert partial['observedRows']==summary['currentRows']
`)
})

test('admission rejects extra queue deltas, fabricated pending counters, altered frozen jobs and other old mutations',()=>{
 pythonContract(String.raw`
core,partial,before,fixture=fixtures()
for pending in [0,1,2,4,-1]:
    bad=copy.deepcopy(partial);bad['rows'][QUEUE][0]['pending']=pending;recapture(bad)
    rejected(lambda:admission_summary(core,bad,before,fixture,helper),'reports budget')
bad=copy.deepcopy(partial);bad['rows'][QUEUE].append({'id':'another','pending':0});recapture(bad)
rejected(lambda:admission_summary(core,bad,before,fixture,helper),'reports budget')
for field,value in [('attempt_count',1),('budget_held',False),('status','READY'),('requested_revision',3),('next_attempt_at','2026-10-19T12:00:02.000')]:
    bad=copy.deepcopy(partial);one(bad['rows'][JOBS],'job-MA')[field]=value;recapture(bad)
    rejected(lambda:admission_summary(core,bad,before,fixture,helper))
for table,field,value in [('_prisma_migrations','value','changed'),('facts','value','changed'),(JOBS,'status','FAILED'),
    ('export_batches','status','FAILED'),('export_artifacts','status','FAILED'),('training_attempt_checkpoints','payload_encrypted','changed')]:
    bad=copy.deepcopy(partial);bad['rows'][table][0][field]=value;recapture(bad)
    rejected(lambda:admission_summary(core,bad,before,fixture,helper),'original full logical row')
`)
})

test('each of the three exact source-derived parent/job completions is admitted without relaxing other columns',()=>{
 pythonContract(String.raw`
core,partial,before,fixture=fixtures();current=completed(partial)
summary,proof=final_summary(core,partial,current,before,fixture,helper)
assert summary['oldRows']==6667 and summary['allCoreRowsRetained']
assert summary['exactParentCompletionTransitions']==summary['exactJobCompletionTransitions']==3
assert len(proof['cases'])==3 and summary['nonlistedColumnsExact']
assert set(summary['parentCompletionColumns'])==PARENT_COMPLETION_COLUMNS
assert 'training_flow_path_hash' not in PARENT_COMPLETION_COLUMNS
assert 'lease_token' not in JOB_COMPLETION_COLUMNS and 'error_code' not in JOB_COMPLETION_COLUMNS
for name in SPECS:
    for field,value in [('attempt_count',2),('lease_token','lease'),('lease_expires_at','2026-10-19T12:01:00.000'),
        ('error_code','RETRY'),('budget_held',True),('aggregate_input_hash','f'*64),('claimed_revision',99)]:
        bad=copy.deepcopy(current);one(bad['rows'][JOBS],'job-'+name)[field]=value;recapture(bad)
        rejected(lambda:final_summary(core,partial,bad,before,fixture,helper))
    for field,value in [('training_flow_path_hash','f'*64),('training_feedback_snapshot',{'changed':True}),
        ('training_feedback_snapshot_hash','f'*64),('total_time',124),('task_satisfaction','UNKNOWN'),('completed_items',999)]:
        bad=copy.deepcopy(current);one(bad['rows'][PARENTS],'new-'+name)[field]=value;recapture(bad)
        rejected(lambda:final_summary(core,partial,bad,before,fixture,helper))
`)
})

test('all four snapshots, accepted child facts, partial rows, checkpoints and schema remain immutable',()=>{
 pythonContract(String.raw`
core,partial,before,fixture=fixtures();current=completed(partial)
for table,field in [('assessment_unit_snapshots','canonical_result_encrypted'),('composite_form_section_attempts','value'),('assessments','value')]:
    bad=copy.deepcopy(current);bad['rows'][table][0][field]='changed';recapture(bad)
    rejected(lambda:final_summary(core,partial,bad,before,fixture,helper))
partial['rows']['facts'].append({'id':'accepted-partial-extra','value':'immutable'});recapture(partial);current=completed(partial)
bad=copy.deepcopy(current);bad['rows']['facts'].pop();recapture(bad)
rejected(lambda:final_summary(core,partial,bad,before,fixture,helper),'partial full logical row')
bad=copy.deepcopy(current);bad['rows']['training_attempt_checkpoints'].append({'attempt_id':'new-cp','payload_encrypted':'new'});recapture(bad)
rejected(lambda:final_summary(core,partial,bad,before,fixture,helper),'21 checkpoints')
bad=copy.deepcopy(current);bad['snapshot']['constraints'].append({'name':'changed'})
rejected(lambda:final_summary(core,partial,bad,before,fixture,helper),'live schema changed')
bad=copy.deepcopy(current);bad['rows']['facts'].append({'id':'unapproved-addition','value':'new'});recapture(bad)
rejected(lambda:final_summary(core,partial,bad,before,fixture,helper),'unapproved added rows')
bad=copy.deepcopy(current);bad['rows']['assessment_unit_snapshots'].append(copy.deepcopy(bad['rows']['assessment_unit_snapshots'][0]));recapture(bad)
rejected(lambda:final_summary(core,partial,bad,before,fixture,helper),'accepted fact inventory')
`)
})

test('only one correctly scoped completed CSV pair and exact report layout append candidates are admitted',()=>{
 pythonContract(String.raw`
core,partial,before,fixture=fixtures();current=completed(partial)
common={'resource_type':'TRAINING_ANALYSIS','resource_id':'new-course','created_by':'teacher','anonymized':True,'status':'READY','error_code':None}
options={'version':1,'table':'long','selector':{'courseId':'new-course'},'manifest':{'courseId':'new-course','actor':{'id':'teacher','role':'TEACHER'}}}
current['rows']['export_batches'].append({**common,'id':'new-batch','formats':['csv'],'record_count':4,'field_count':24,'generation':1,
    'processing_job_id':None,'processing_started_at':None,'options':{'anonymize':True,'creatorRole':'TEACHER','trainingAnalysis':options}})
current['rows']['export_artifacts'].append({**common,'id':'new-artifact','format':'csv','batch_id':'new-batch',
    'provenance':{'version':2,'resourceType':'TRAINING_ANALYSIS','creatorRole':'TEACHER','audience':'teacher',
        'generation':'00000000-0000-4000-8000-000000000001','trainingAnalysis':options}})
recapture(current)
summary,_=final_summary(core,partial,current,before,fixture,helper)
assert summary['ordinaryAddedRows']=={'export_batches':1,'export_artifacts':1}
for table,field,value in [('export_batches','created_by','other'),('export_artifacts','resource_id','other'),
    ('export_artifacts','batch_id','other'),('export_artifacts','format','zip'),('export_batches','status','PROCESSING')]:
    bad=copy.deepcopy(current);bad['rows'][table][-1][field]=value;recapture(bad)
    rejected(lambda:final_summary(core,partial,bad,before,fixture,helper))
bad=copy.deepcopy(current);bad['rows']['assessment_public_templates'].append({'template_hash':'a'*64,'template_kind':'OTHER',
    'plaintext_bytes':1,'payload_encrypted':'cipher','created_at':'2026-10-19T12:00:01.000'});recapture(bad)
rejected(lambda:final_summary(core,partial,bad,before,fixture,helper),'report layouts')
`)
})

test('failed semantic assertion still leaves exclusive 0600 full rows, schema, columns and final snapshot',()=>{
 pythonContract(String.raw`
core,partial,before,fixture=fixtures();bad=completed(partial)
bad['rows'][QUEUE][0]['pending']=9;recapture(bad)
class FakeDB:
    def snapshot(self):return copy.deepcopy(bad['snapshot'])
    def rows(self,columns):return copy.deepcopy(bad['rows'])
with tempfile.TemporaryDirectory() as temporary:
    state=Path(temporary)
    captured,binding,snapshot_binding=capture_live(FakeDB(),state,'c25-analysis-resume-audit-final','final')
    rejected(lambda:final_summary(core,partial,captured,before,fixture,helper),'reports budget')
    for item in [binding,snapshot_binding]:
        file=state/item['name'];assert file.is_file() and stat.S_IMODE(file.stat().st_mode)==0o600
        assert sha_file(file)==item['sha256']
    saved=json.loads((state/binding['name']).read_text())
    assert saved==bad and len(saved['rows'])==217 and saved['rows'][QUEUE][0]['pending']==9
    assert json.loads((state/snapshot_binding['name']).read_text())==bad['snapshot']
    try:capture_live(FakeDB(),state,'c25-analysis-resume-audit-final','final')
    except FileExistsError:pass
    else:raise AssertionError('capture was overwritten')
`)
})

test('ciphertext proof authenticates report binding/content and semantic path equality without an application import',()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'c25-resume-cipher-'))
 try{
  const key=randomBytes(32),runtime=path.join(temporary,'runtime-private.json')
  fs.writeFileSync(runtime,JSON.stringify({DATA_ENCRYPTION_KEY:key.toString('hex')}),{mode:0o600})
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
  const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')
  const encrypt=v=>{const iv=randomBytes(16),c=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([c.update(JSON.stringify(v)),c.final()]);return [iv,c.getAuthTag(),body].map(x=>x.toString('hex')).join(':')}
  const cases=Array.from({length:3},(_,i)=>{
   const same={schemaVersion:1,value:{path:['accepted'],taskSatisfaction:'SATISFIED'}}
   const p={id:'attempt-'+i,attempt_epoch:1,frozen_active_slot_set_hash:'a'.repeat(64),context_snapshot_hash:'b'.repeat(64),aggregate_input_hash:'c'.repeat(64),training_flow_path_hash:hash(same.value)}
   const before={...p,training_flow_path_encrypted:encrypt(same)};p.training_flow_path_encrypted=encrypt(same)
   const binding={attemptId:p.id,attemptEpoch:1,slotSetHash:p.frozen_active_slot_set_hash,contextHash:p.context_snapshot_hash,aggregateInputHash:p.aggregate_input_hash}
   const content={report:{id:p.id,unitReports:[]},policies:[]}
   return {before,parent:p,scales:[],job:{report_encrypted:encrypt({schemaVersion:1,binding,...content,contentHash:hash(content)})}}
  })
  const input={cases,templates:[],scaleFacts:[],newTemplateHashes:[]}
  const run=value=>spawnSync(process.execPath,['--input-type=module','-e',CIPHERTEXT_PROOF_JS,runtime],{input:JSON.stringify(value),encoding:'utf8',timeout:10000,maxBuffer:1024*1024})
  const good=run(input);assert.equal(good.status,0,good.stderr);assert.deepEqual(JSON.parse(good.stdout),{authenticatedReports:3,unchangedDecryptedPaths:3,newReferencedTemplates:0})
  const changed=structuredClone(input);changed.cases[0].parent.training_flow_path_encrypted=encrypt({schemaVersion:1,value:{path:['tampered']}});assert.notEqual(run(changed).status,0)
  const corrupt=structuredClone(input);corrupt.cases[0].job.report_encrypted='00:00:00';assert.notEqual(run(corrupt).status,0)
  const unrelated=structuredClone(input);unrelated.newTemplateHashes=['f'.repeat(64)];assert.notEqual(run(unrelated).status,0)
 }finally{fs.rmSync(temporary,{recursive:true,force:true})}
})

test('adapter admission is fixed, read-only, capture-first and bounded by the 300-second launcher',()=>{
 const argv=['--python','/usr/bin/python3','--node','/tmp/tools/node_modules/node/bin/node','--db-helper',helper,
  '--contract',path.join(directory,'c25-analysis-resume-contract.mjs'),'--tools','/tmp/tools','--state',analysisResumeState,
  '--failure-state',failedAnalysisState,'--core-state',coreState,'--mode','baseline','--label',BASELINE_LABEL]
 assert.deepEqual(invocation(argv).args.slice(0,3),['-B','-c',INLINE_PYTHON])
 assert.equal(inlinePythonSha256,createHash('sha256').update(INLINE_PYTHON).digest('hex'));assert.equal(DB_TIMEOUT_MS,295000)
 const change=(key,value)=>argv.map((item,i)=>argv[i-1]===key?value:item)
 for(const mode of ['restore','migration','upgrade','prepare','drain'])assert.throws(()=>invocation(change('--mode',mode)))
 for(const [key,value]of [['--state',failedAnalysisState],['--failure-state',analysisResumeState],['--core-state','/tmp/other'],['--node','/usr/bin/node'],['--contract','/tmp/contract.mjs'],['--label','c25-analysis-audit-baseline']])assert.throws(()=>invocation(change(key,value)))
 assert.throws(()=>invocation([...argv,'--mode','final']))
 const main=INLINE_PYTHON.slice(INLINE_PYTHON.lastIndexOf('\ndef main():'))
 assert.ok(main.indexOf('evidence_inputs(args)')<main.indexOf('helper.Database(args.tools, args.state)'))
 assert.ok(main.indexOf('capture_live(db, args.state, args.label, args.mode)')<main.indexOf('validate_original(core, expected)'))
 assert.ok(main.indexOf('capture_live(db, args.state, args.label, args.mode)')<main.indexOf('assert_source_quiescent(db)'))
 assert.ok(main.includes("default_transaction_read_only=on"));assert.ok(main.includes("result['finalSnapshot'] = snapshot_binding"))
 assert.doesNotMatch(main,/\bdb\.(?:restore|dump)\s*\(/)
 assert.ok(!CIPHERTEXT_PROOF_JS.includes('import(')&&!CIPHERTEXT_PROOF_JS.includes('require('))
})
