#!/usr/bin/env python3
"""Dedicated C21 dual/guards/restore tail: preserve twelve accepted race cases.
No continuation/replay is automatic. A partial failure retains every private log.
"""
import argparse,fcntl,importlib.util,json,os,re,shutil,signal,socket,subprocess,sys,time,urllib.request
from pathlib import Path
from urllib.parse import urlparse
sys.dont_write_bytecode=True
BASE=Path(__file__).resolve().parent;BACKEND=BASE.parents[1]/'backend';REPO=BACKEND.parents[1]
def module(name,file):
 s=importlib.util.spec_from_file_location(name,BASE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=module('c21_db','c21-group-ip-db.py');support=module('c21_support','c18-study-http.py')
sha_file,digest,manifest=m.sha_file,m.digest,support.manifest
FLOOR=8*1024**3
PHASES=['races-remainder','restore']
RACE_FIX_SHA256='5ba22f977478d2332ab9414ded3c80da0a77ac251c272e28f1294f5f2447f2fe'
RACE_FIX_COMMIT='b5286addf114c9f218fd33ffc9dcf7e80ecc1168'
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--tools',type=Path,required=True);p.add_argument('--source-state',type=Path,required=True);p.add_argument('--state',type=Path,required=True);p.add_argument('--expected-head',required=True);p.add_argument('--expected-source-receipt-sha256',required=True);p.add_argument('--through',choices=PHASES,default='restore');p.add_argument('--failed-state',type=Path,required=True);p.add_argument('--expected-failed-receipt-sha256',required=True);p.add_argument('--expected-failed-snapshot-sha256',required=True);p.add_argument('--accepted-state',type=Path,required=True);p.add_argument('--expected-accepted-receipt-sha256',required=True);p.add_argument('--expected-accepted-snapshot-sha256',required=True);p.add_argument('--earlier-accepted-state',type=Path,required=True);p.add_argument('--build-receipt',type=Path,required=True);p.add_argument('--expected-build-receipt-sha256',required=True);a=p.parse_args()
 tools,source,state=[v.resolve() for v in [a.tools,a.source_state,a.state]];failed=a.failed_state.resolve();accepted=a.accepted_state.resolve();earlier=a.earlier_accepted_state.resolve();requested=PHASES[:PHASES.index(a.through)+1]
 assert re.fullmatch('[0-9a-f]{40}',a.expected_head)
 assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip()==a.expected_head
 business=['server-version/backend/src','server-version/backend/prisma','server-version/backend/scripts','server-version/backend/package.json','server-version/backend/package-lock.json','server-version/backend/tsconfig.json']
 qualification_sources=[*business,'server-version/scripts/recovery']
 assert subprocess.run(['git','diff','--quiet','HEAD','--',*qualification_sources],cwd=REPO).returncode==0,'commit business and qualification harness/helper sources before qualification'
 assert not subprocess.check_output(['git','ls-files','--others','--exclude-standard','--',*qualification_sources],cwd=REPO).strip(),'untracked qualification source is not part of the reviewed HEAD'
 assert not state.exists() and source!=state and source not in state.parents and state not in source.parents and REPO not in state.parents
 node=tools/'node_modules/node/bin/node';pg=tools/'postgresql/bin';redis=tools/'redis/bin/redis-server'
 assert subprocess.check_output([node,'--version'],text=True).strip()=='v24.21.0'
 assert '16.15' in subprocess.check_output([pg/'postgres','--version'],text=True)
 assert 'v=7.4.11 ' in subprocess.check_output([redis,'--version'],text=True)
 assert sha_file(a.build_receipt)==a.expected_build_receipt_sha256
 build=json.loads(a.build_receipt.read_text());assert build['nodeVersion']=='v24.21.0' and build['nodeSha256']==sha_file(node) and build['inputsUnchanged'] is True
 assert subprocess.run(['git','merge-base','--is-ancestor',build['head'],a.expected_head],cwd=REPO).returncode==0,'compiler producer is not an ancestor'
 changed=subprocess.check_output(['git','diff','--name-only',build['head'],a.expected_head],cwd=REPO,text=True).splitlines()
 migration_prefix='server-version/backend/prisma/migrations/'
 assert all(name.startswith(migration_prefix) or name=='server-version/backend/scripts/runtime-table-policy.json' or (name.startswith('server-version/scripts/recovery/c21-')) for name in changed),'compiler reuse permits only migration SQL and new C21 harness changes'
 assert build['steps'] and all(step['exitCode']==0 for step in build['steps'])
 assert any('tsc' in step['name'] for step in build['steps'])
 assert build['dependenciesUnchanged'] is True and build['clientUnchanged'] is True
 prior_prisma=build['priorPrismaReceipt'];prior_prisma_path=Path(prior_prisma['path']);assert sha_file(prior_prisma_path)==prior_prisma['sha256']
 generated=json.loads(prior_prisma_path.read_text());assert generated['inputsUnchanged'] is True and generated['client']==build['client']
 assert generated['inputs']['prisma/schema.prisma']==build['inputs']['prisma/schema.prisma']
 assert any('prisma' in step['name'] and step['exitCode']==0 for step in generated['steps'])
 assert generated['nodeSha256']==build['nodeSha256'] and generated['nodeVersion']==build['nodeVersion']
 assert subprocess.run(['git','merge-base','--is-ancestor',generated['head'],build['head']],cwd=REPO).returncode==0
 def dependency_manifest():
  entries={}
  for directory,dirs,files in os.walk(BACKEND/'node_modules',followlinks=True):
   dirs[:]=sorted(d for d in dirs if d not in ['.cache','.vite','.vite-temp'])
   for name in sorted(files):
    f=Path(directory)/name
    if f.is_file():entries[str(f.relative_to(BACKEND))]={'realpath':str(f.resolve()),'sha256':sha_file(f)}
  return entries
 assert dependency_manifest()==build['dependencies'],'compiler dependency closure differs'
 assert set(build['compiler'])=={'node_modules/typescript/bin/tsc','node_modules/typescript/lib/_tsc.js','node_modules/typescript/package.json'}
 assert all(sha_file(BACKEND/relative)==expected for relative,expected in build['compiler'].items())
 current_inputs={str(f.relative_to(BACKEND)) for root in ['src','prisma'] for f in (BACKEND/root).rglob('*') if f.is_file() and '/__tests__/' not in str(f)}|{'package.json','package-lock.json','tsconfig.json'}
 assert current_inputs==set(build['inputs']),'compiler source inventory changed, including extra files'
 migration_changes=[]
 for section in ['inputs','dist','client']:
  assert build[section]
  for relative,expected in build[section].items():
   actual=sha_file(BACKEND/relative)
   if actual!=expected:
    assert section=='inputs' and relative.startswith('prisma/migrations/') and 'server-version/backend/'+relative in changed,relative+' differs from compiler receipt'
    migration_changes.append({'path':relative,'compilerProducerSha256':expected,'runtimeSha256':actual})
 assert {str(f.relative_to(BACKEND)) for f in (BACKEND/'dist').rglob('*') if f.is_file()}==set(build['dist'])
 assert {str(f.relative_to(BACKEND)) for f in (BACKEND/'node_modules/.prisma/client').rglob('*') if f.is_file()}==set(build['client'])
 compiler_reuse={'producerHead':build['head'],'executionHead':a.expected_head,'receiptSha256':a.expected_build_receipt_sha256,'changedGitPaths':changed,'changedMigrations':migration_changes,'runtimeMigrations':{relative:sha_file(BACKEND/relative) for relative in current_inputs if relative.startswith('prisma/migrations/')},'compilerInputsDistClientUnchanged':True,'compilerSha256':digest(build['compiler']),'dependencyClosureSha256':digest(build['dependencies']),'dependencyFiles':len(build['dependencies']),'priorPrismaReceiptSha256':prior_prisma['sha256']}
 fresh=m.fresh_prisma(BACKEND);support.stopped(source)
 receipt=source/'c20-runtime-result.json';assert sha_file(receipt)==a.expected_source_receipt_sha256
 prior=json.loads(receipt.read_text());assert all(prior.get(k) is True for k in ['cleanupVerified','sourceUnchanged','inputsUnchanged'])
 assert sha_file(source/'c20-final-db-snapshot.json')==prior['finalSnapshotSha256']
 support.stopped(failed)
 assert failed!=source and failed!=state and failed not in state.parents and state not in failed.parents
 failed_receipt=failed/'c21-runtime-result.json';assert sha_file(failed_receipt)==a.expected_failed_receipt_sha256
 failure=json.loads(failed_receipt.read_text());assert failure['passed'] is False and failure['phases']=={}
 assert all(failure.get(k) is True for k in ['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified'])
 assert failure['sourceReceiptSha256']==a.expected_source_receipt_sha256 and failure['buildReceiptSha256']==a.expected_build_receipt_sha256
 assert sha_file(failed/'c21-final-db-snapshot.json')==a.expected_failed_snapshot_sha256==failure['finalSnapshotSha256']
 assert sha_file(failed/'frozen-inputs.json')==failure['frozenInputsSha256']
 frozen_failure=json.loads((failed/'frozen-inputs.json').read_text())
 assert accepted not in [failed,source,state] and accepted not in state.parents and state not in accepted.parents
 previous_status=json.loads((accepted/'status.json').read_text());assert previous_status['state']=='stopped' and previous_status['cleanupVerified'] is True and previous_status['cleanupErrors']==[]
 for port in previous_status['ports'].values():
  with socket.socket() as sock:sock.settimeout(.2);assert sock.connect_ex(('127.0.0.1',port))!=0
 accepted_file=accepted/'c21-races-continuation-runtime-result.json';assert sha_file(accepted_file)==a.expected_accepted_receipt_sha256
 previous=json.loads(accepted_file.read_text());assert previous['passed'] is False
 assert all(previous.get(k) is True for k in ['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified','originalFailedEvidenceUnchanged','acceptedEvidenceUnchanged'])
 assert previous['continuation']['originalFailedReceiptSha256']==a.expected_failed_receipt_sha256
 assert a.expected_accepted_receipt_sha256=='08b2176c6da3435a75f0a165474de888f133d4aabc07895ca2df3283478bcfb0'
 assert earlier not in [state,failed,accepted,source] and earlier not in state.parents and state not in earlier.parents
 assert sha_file(earlier/'c21-continuation-runtime-result.json')==previous['continuation']['priorContinuationReceiptSha256']=='1960ed6391356305b59e2a5a9d88db278749138237ce6d58ac543b655850f594'
 earlier_receipt=json.loads((earlier/'c21-continuation-runtime-result.json').read_text())
 earlier_evidence=manifest(earlier);assert earlier_evidence==json.loads((accepted/'accepted-run-evidence-after.json').read_text()),'earlier accepted evidence changed'
 assert previous['sourceReceiptSha256']==a.expected_source_receipt_sha256 and previous['buildReceiptSha256']==a.expected_build_receipt_sha256
 assert sha_file(accepted/'c21-final-db-snapshot.json')==a.expected_accepted_snapshot_sha256==previous['finalSnapshotSha256']
 assert sha_file(accepted/'frozen-inputs.json')==previous['frozenInputsSha256']
 accepted_frozen=json.loads((accepted/'frozen-inputs.json').read_text());accepted_head=accepted_frozen['head']
 assert subprocess.run(['git','merge-base','--is-ancestor',accepted_head,a.expected_head],cwd=REPO).returncode==0
 delta=subprocess.check_output(['git','diff','--name-only',accepted_head,a.expected_head],cwd=REPO,text=True).splitlines()
 race_path='server-version/scripts/recovery/c21-group-ip-races.mjs'
 allowed={race_path,'server-version/scripts/recovery/c21-group-ip-final-continuation.py'}
 assert set(delta)<=allowed and race_path in delta,'tail source changes exceed exact race fixture repair'
 assert subprocess.run(['git','merge-base','--is-ancestor',RACE_FIX_COMMIT,a.expected_head],cwd=REPO).returncode==0
 assert re.fullmatch('[0-9a-f]{64}',RACE_FIX_SHA256) and sha_file(REPO/race_path)==RACE_FIX_SHA256,'race fixture repair is not the reviewed producer'
 for entry in accepted_frozen['sourceInputs']:
  assert (REPO/entry['path']).stat().st_mode&0o777==entry['mode']
  assert sha_file(REPO/entry['path'])==(RACE_FIX_SHA256 if entry['path']==race_path else entry['sha256']),'accepted input changed outside pinned race fixture'
 assert set(previous['phases'])=={'upgrade','functional','performance'} and set(previous['phaseProducers'])==set(previous['phases'])
 accepted_results={};accepted_producers={}
 for phase in ['upgrade','functional','performance']:
  file=accepted/f'c21-{phase}-result.json';value=json.loads(file.read_text());producer=previous['phaseProducers'][phase]
  assert value['passed'] is True and value==previous['phases'][phase]
  assert sha_file(file)==producer['resultSha256'] and producer['inputBindingSha256']==previous['continuation']['priorFrozenInputsSha256']==earlier_receipt['frozenInputsSha256']
  assert value==earlier_receipt['phases'][phase] and producer['resultSha256']==earlier_receipt['phaseProducers'][phase]['resultSha256']
  accepted_results[phase]=value;accepted_producers[phase]={**producer,'acceptedViaReceiptSha256':a.expected_accepted_receipt_sha256}
 race_failure=json.loads((accepted/'c21-races-result.json').read_text());assert race_failure['passed'] is False
 assert sha_file(accepted/'c21-races-result.json')=='ae5b42a40c1366f6c8bcf535190ae6d3474c9cfe035bc40951d034f9cd058e72'
 expected_cases=[(name,order) for name in ['delivery_insert','incoming_delivery_update','delivery_update','delivery_delete','study_insert'] for order in ['freeze_then_mutation','mutation_then_freeze']]+[('delivery_update_row_parent_lock_cycle',None),('delivery_delete_row_parent_lock_cycle',None)]
 assert [(row['case'],row.get('order')) for row in race_failure['measurements']]==expected_cases
 assert len(race_failure['checks'])==12 and race_failure['counts']==[] and race_failure['requests']==[]
 partial_race={'passed':False,'acceptedCaseCount':12,'checks':race_failure['checks'],'measurements':race_failure['measurements'],'producerSource':race_failure['source'],'resultSha256':sha_file(accepted/'c21-races-result.json'),'runtimeReceiptSha256':a.expected_accepted_receipt_sha256,'inputBindingSha256':previous['frozenInputsSha256'],'scope':'ONLY_TWELVE_COMPLETED_CASES;_FAILED_DUAL_NOT_CLASSIFIED_OR_ACCEPTED'}
 assert race_failure['source']['harnessSha256']==next(e['sha256'] for e in accepted_frozen['sourceInputs'] if e['path']==race_path)
 assert {d:manifest(failed/d) for d in ['pgdata','uploads','exports']}==json.loads((accepted/'resumed-data-manifest-after.json').read_text()),'same clone changed since previous stopped checkpoint'
 accepted_evidence=manifest(accepted)
 def original_evidence_manifest():
  entries=[]
  for file in sorted(failed.rglob('*')):
   relative=file.relative_to(failed)
   if relative.parts[0] in ['pgdata','uploads','exports']:continue
   assert not file.is_symlink()
   if file.is_file():entries.append({'path':str(relative),'mode':file.stat().st_mode&0o777,'sha256':sha_file(file),'size':file.stat().st_size})
   else:assert file.is_dir();entries.append({'path':str(relative),'mode':file.stat().st_mode&0o777,'type':'directory'})
  return entries
 original_evidence=original_evidence_manifest();assert digest(original_evidence)==previous['continuation']['originalEvidenceSha256'],'original failed evidence changed since accepted continuation'
 continuation_binding={'originalFailedReceiptSha256':a.expected_failed_receipt_sha256,'priorContinuationReceiptSha256':a.expected_accepted_receipt_sha256,'priorFinalSnapshotSha256':a.expected_accepted_snapshot_sha256,'priorFrozenInputsSha256':previous['frozenInputsSha256'],'priorHead':accepted_head,'executionHead':a.expected_head,'sourceDelta':delta,'raceFixtureBeforeSha256':race_failure['source']['harnessSha256'],'raceFixtureAfterSha256':RACE_FIX_SHA256,'raceFixtureCommit':RACE_FIX_COMMIT,'priorFailedRaceResultSha256':sha_file(accepted/'c21-races-result.json'),'earlierAcceptedEvidenceSha256':digest(earlier_evidence),'originalEvidenceSha256':digest(original_evidence),'acceptedEvidenceSha256':digest(accepted_evidence),'noMigrationReplay':True,'noAclReconciliation':True,'noAcceptedPhaseReplay':True,'noSecondClone':True}
 lock=(tools/'.measurement.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 copybytes=0
 assert shutil.disk_usage(state.parent).free-copybytes-512*1024**2>=FLOOR,'continuation 512MiB output reserve crosses 8GiB floor'
 os.umask(0o077);state.mkdir(mode=0o700)
 runtime=json.loads((accepted/'runtime-private.json').read_text())
 for key,role in [('DATABASE_URL_OWNER','eduk12_owner'),('DATABASE_URL','eduk12_runtime'),('DATABASE_URL_RUNTIME','eduk12_runtime')]:
  u=urlparse(runtime[key]);assert u.hostname=='127.0.0.1' and u.username==role and u.path=='/eduk12_recovery'
 runtime.update(BACKGROUND_WORKERS_ENABLED='false',HEAVY_PROCESSING_ENABLED='false',VIDEO_PROCESSING_ENABLED='false',PERF_ISOLATED_TEST_MODE='1',PERF_SQL_EVENT_COUNT='1')
 effective={**runtime,'PORT':'0','REDIS_URL':'redis://127.0.0.1:0','UPLOAD_DIR':'<state>/uploads','EXPORT_DIR':'<state>/exports'}
 for key in ['DATABASE_URL_OWNER','DATABASE_URL','DATABASE_URL_RUNTIME']:
  u=urlparse(effective[key]);effective[key]=u._replace(netloc=f'{u.username}:{u.password}@127.0.0.1:0').geturl()
 perf_env={'PUBLIC_ASSESSMENT_IP_GET_LIMIT':'1','PUBLIC_ASSESSMENT_IP_FINAL_LIMIT':'1','PUBLIC_ASSESSMENT_TOKEN_GET_LIMIT':'10000','PUBLIC_ASSESSMENT_TOKEN_FINAL_LIMIT':'10000','PUBLIC_ASSESSMENT_RECOVERY_GET_LIMIT':'10000','PUBLIC_ASSESSMENT_RECOVERY_FINAL_LIMIT':'10000'}
 env={'PATH':f'{node.parent}:{pg}:/usr/bin:/bin','HOME':str(state),'TMPDIR':str(state),'LANG':'C.UTF-8','TZ':'UTC','NODE_ENV':'test','PYTHONDONTWRITEBYTECODE':'1'}
 result={'passed':False,'scope':'C21_ROUND_HTTP_PG_AND_ISOLATED_POLICY_OVERHEAD','phases':dict(accepted_results),'phaseProducers':dict(accepted_producers),'acceptedPhases':['upgrade','functional','performance'],'executedPhases':[],'acceptedPartialRaceEvidence':partial_race,'sourceReceiptSha256':sha_file(receipt),'sourceReceiptPassed':prior.get('passed'),'sourceReceiptAcceptance':'STOPPED_BYTES_ONLY_NOT_PRIOR_QUALIFICATION','cloneBytes':copybytes,'freshPrisma':fresh,'buildReceiptSha256':a.expected_build_receipt_sha256,'compilerReuse':compiler_reuse,'continuation':continuation_binding}
 status={'state':'preparing','ports':{},'pids':{},'startedAt':time.time()};children=[];logs=[];pinned=before=None
 def record():
  t=state/'status.tmp';t.write_text(json.dumps(status,indent=2));t.replace(state/'status.json')
 def binding():
  paths=[*business,'server-version/scripts/recovery'];tracked=subprocess.check_output(['git','ls-files','-z','--',*paths],cwd=REPO).split(b'\0');extra=subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z','--',*paths],cwd=REPO).split(b'\0')
  inputs=[]
  for name in sorted(set(tracked+extra)-{b''}):
   file=REPO/os.fsdecode(name);assert file.is_file() and not file.is_symlink();inputs.append({'path':os.fsdecode(name),'mode':file.stat().st_mode&0o777,'sha256':sha_file(file)})
  return {'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip(),'sourceInputs':inputs,'sourceInputsSha256':digest(inputs),'runtimeFingerprint':json.loads(subprocess.check_output([node,BASE/'runtime-fingerprint.cjs',BACKEND],text=True)),'generatedClientManifestSha256':digest(manifest(BACKEND/'node_modules/.prisma/client')),'tools':{str(v.relative_to(tools)):sha_file(v) for v in [node,pg/'postgres',pg/'psql',pg/'pg_dump',pg/'pg_restore',redis]},'installedDependencyLockSha256':sha_file(BACKEND/'node_modules/.package-lock.json') if (BACKEND/'node_modules/.package-lock.json').is_file() else None,'runtimeConfigurationSha256':digest(effective),'performanceConfigurationSha256':digest(perf_env),'phases':requested}
 def guard():
  assert shutil.disk_usage(state).free>=FLOOR,'8GiB disk floor'
  assert next(int(l.split()[1])*1024 for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:'))>=2*1024**3
  for name,proc,service in children:
   if service:assert proc.poll() is None,name+' exited'
   if name=='api' and proc.poll() is None:assert next(int(l.split()[1])*1024 for l in Path(f'/proc/{proc.pid}/status').read_text().splitlines() if l.startswith('VmRSS:'))<1024**3
  if (state/'stop').exists():raise KeyboardInterrupt
 def start(argv,name,extra=None,service=True):
  log=(state/(name+'.log')).open('w');logs.append(log);proc=subprocess.Popen(list(map(str,argv)),cwd=BACKEND,env={**env,**(extra or {})},stdout=log,stderr=log,start_new_session=True);children.append((name,proc,service))
  if service:status['pids'][name]=proc.pid
  record();return proc
 def run(argv,name,extra=None,timeout=600):
  proc=start(argv,name,extra,False);deadline=time.monotonic()+timeout
  while proc.poll() is None:
   guard();assert time.monotonic()<deadline,name+' timeout';time.sleep(.2)
  (state/(name+'.exit')).write_text(str(proc.returncode)+'\n');assert proc.returncode==0,name+' failed; private raw logs retained'
 def ready(port,proc):
  deadline=time.monotonic()+60
  while time.monotonic()<deadline:
   guard()
   try:
    with socket.create_connection(('127.0.0.1',port),timeout=.3):
     executable=Path(f'/proc/{proc.pid}/exe').resolve();assert executable in [node.resolve(),(pg/'postgres').resolve(),redis.resolve()];result.setdefault('serviceExecutables',{})[str(proc.pid)]={'path':str(executable),'sha256':sha_file(executable)};return
   except OSError:time.sleep(.2)
  raise TimeoutError('readiness exceeded 60 seconds')
 def verify():
  assert binding()==pinned,'frozen source, artifact, tools or config changed'
  assert sha_file(a.build_receipt)==a.expected_build_receipt_sha256,'build receipt changed'
  assert original_evidence_manifest()==original_evidence,'original failed-run evidence changed'
  assert manifest(accepted)==accepted_evidence,'accepted prior continuation evidence changed'
  assert manifest(earlier)==earlier_evidence,'earlier accepted phase evidence changed'
 def interrupted(*_):raise KeyboardInterrupt
 for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,interrupted)
 try:
  record();pinned=binding();(state/'frozen-inputs.json').write_text(json.dumps(pinned,indent=2));result['frozenInputsSha256']=sha_file(state/'frozen-inputs.json');(state/'original-run-evidence-before.json').write_text(json.dumps(original_evidence,indent=2));(state/'accepted-run-evidence-before.json').write_text(json.dumps(accepted_evidence,indent=2));(state/'earlier-accepted-evidence-before.json').write_text(json.dumps(earlier_evidence,indent=2));(state/'resumed-data-manifest-before.json').write_text(json.dumps({d:manifest(failed/d) for d in ['pgdata','uploads','exports']}))
  for key in ['runtimeFingerprint','generatedClientManifestSha256','tools','installedDependencyLockSha256','runtimeConfigurationSha256','performanceConfigurationSha256']:assert pinned[key]==accepted_frozen[key],'accepted runtime input changed: '+key
  before=manifest(source);(state/'source-byte-manifest-before.json').write_text(json.dumps(before));result['sourceManifestSha256']=digest(before);assert result['sourceManifestSha256']==failure['sourceManifestSha256']==previous['sourceManifestSha256'],'original C20 source bytes differ from failed run binding'
  for name in ['fixture-private.json','c21-original-rows-private.json','c21-fixture-private.json',*[f'c21-{phase}-result.json' for phase in accepted_results]]:shutil.copy2(accepted/name,state/name)
  assert original_evidence_manifest()==original_evidence
  guard()
  held=[]
  for name in ['postgres','redis','api']:
   sock=socket.socket();sock.bind(('127.0.0.1',0));held.append(sock);status['ports'][name]=sock.getsockname()[1]
  for sock in held:sock.close()
  dbport,rport,aport=[status['ports'][k] for k in ['postgres','redis','api']]
  for key in ['DATABASE_URL_OWNER','DATABASE_URL','DATABASE_URL_RUNTIME']:
   u=urlparse(runtime[key]);runtime[key]=u._replace(netloc=f'{u.username}:{u.password}@127.0.0.1:{dbport}').geturl()
  runtime.update(PORT=str(aport),REDIS_URL=f'redis://127.0.0.1:{rport}',UPLOAD_DIR=str(failed/'uploads'),EXPORT_DIR=str(failed/'exports'))
  (state/'runtime-private.json').write_text(json.dumps(runtime));result['privateRuntimeFileSha256']=sha_file(state/'runtime-private.json');public={k:v for k,v in runtime.items() if k!='DATABASE_URL_OWNER'}
  postgres=start([pg/'postgres','-D',failed/'pgdata','-h','127.0.0.1','-p',dbport,'-k','','-c','timezone=UTC','-c','shared_buffers=128MB','-c','max_connections=40'],'postgres');ready(dbport,postgres)
  # Retry only the structured startup SQLSTATE; never suppress auth/config errors.
  driver="const {Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL_OWNER,connectionTimeoutMillis:2000});(async()=>{try{await c.connect();await c.query('SELECT 1');process.stdout.write('ready')}catch(e){process.stdout.write(e.code||'UNKNOWN');process.exitCode=e.code==='57P03'?75:1}finally{await c.end()}})()"
  deadline=time.monotonic()+60;polls=[]
  while True:
   probe=subprocess.run([node,'--require',BASE/'loopback-only.cjs','-e',driver],cwd=BACKEND,env={**env,'DATABASE_URL_OWNER':runtime['DATABASE_URL_OWNER']},text=True,capture_output=True,timeout=8);polls.append({'exit':probe.returncode,'result':probe.stdout});(state/'postgres-readiness.json').write_text(json.dumps(polls))
   if probe.returncode==0 and probe.stdout=='ready':break
   assert probe.returncode==75 and probe.stdout=='57P03';guard();assert time.monotonic()<deadline;time.sleep(.2)
  status.update(head=a.expected_head,node='v24.21.0',runtimeFingerprint=pinned['runtimeFingerprint']);record();db=m.Database(tools,state)
  assert db.snapshot()==json.loads((accepted/'c21-final-db-snapshot.json').read_text()),'same-clone DB no longer matches accepted final checkpoint'
  retained_checkpoint=db.snapshot();retained_checkpoint['rows']=db.rows(retained_checkpoint['columns']);(state/'all-preexisting-rows-private.json').write_text(json.dumps(retained_checkpoint))
  result['allPreexistingRowsCheckpointSha256']=sha_file(state/'all-preexisting-rows-private.json')
  # First runtime-role read inventories retained synthetic data; never deletes it.
  inventory_js="""const fs=require('fs');const path=require('path');const {Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL});(async()=>{try{await c.connect();const tables={};for(const t of ['courses','composite_assessments','composite_assessment_access_tokens','anonymous_studies','training_public_rounds','composite_assessment_attempts']){tables[t]=(await c.query('SELECT to_jsonb(t) AS row,xmin::text AS xmin FROM '+t+" t WHERE left(id,8)='c21race_' ORDER BY id")).rows}const grouped={};for(const t of ['composite_assessments','composite_assessment_access_tokens','training_public_rounds','composite_assessment_attempts'])for(const r of tables[t]){const id=t==='composite_assessments'?r.row.id:r.row.composite_id??r.row.composite_assessment_id;(grouped[id]??=[]).push({table:t,id:r.row.id,tokenId:r.row.access_token_id??null,roundId:r.row.training_round_id??(t==='training_public_rounds'?r.row.id:null),courseId:r.row.course_id??r.row.delivery_course_id??null,xmin:r.xmin})}fs.writeFileSync(path.join(process.env.C21_INVENTORY_STATE,process.env.C21_INVENTORY_NAME),JSON.stringify({tables,groupedByParent:grouped},null,2),{mode:0o600});process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length]))))}finally{await c.end()}})().catch(()=>{process.exitCode=1})"""
  def inventory(name):
   run([node,'--require',BASE/'loopback-only.cjs','-e',inventory_js],'c21-'+name,{**public,'C21_INVENTORY_STATE':str(state),'C21_INVENTORY_NAME':name+'.json'},timeout=30)
   return json.loads((state/(name+'.json')).read_text())
  retained_before=inventory('prior-race-inventory-before-private')
  result['priorRaceInventory']={'scope':'RETAINED_ROWS_AND_XMIN;_OLD_FAILED_DUAL_CAUSE_UNCLASSIFIED','beforeSha256':sha_file(state/'prior-race-inventory-before-private.json'),'countsBefore':{table:len(rows) for table,rows in retained_before['tables'].items()}}
  http=False
  for phase in requested:
   verify();guard()
   if phase=='restore':
    status['state']='restoring';record();argv=['python3',BASE/'c21-group-ip-db.py','--tools',tools,'--state',state,'--phase','restore'];run(argv,'c21-restore',timeout=600)
   else:
    if not http:
     rp=start([redis,'--bind','127.0.0.1','--port',rport,'--dir',state,'--save','','--appendonly','no','--maxmemory','128mb','--maxmemory-policy','noeviction'],'redis');ready(rport,rp)
     api=start([node,'--require',BASE/'loopback-only.cjs','dist/index.js'],'api',public);ready(aport,api);status['apiUrl']=f'http://127.0.0.1:{aport}'
     for endpoint in ['health','ready']:
      with urllib.request.urlopen(status['apiUrl']+'/'+endpoint,timeout=8) as response:assert response.status==200
     http=True
    status['state']='running';record();argv=[node,'--require',BASE/'loopback-only.cjs',BASE/'c21-group-ip-races.mjs',state,'--remaining-dual-guards',accepted];run(argv,'c21-races-remainder',public)
   result['executedPhases'].append(phase)
   result['phases'][phase]=json.loads((state/f'c21-{phase}-result.json').read_text());assert result['phases'][phase]['passed'] is True
   result.setdefault('phaseProducers',{})[phase]={'argv':list(map(str,argv)),'inputBindingSha256':result['frozenInputsSha256'],'resultSha256':sha_file(state/f'c21-{phase}-result.json')}
   db.original_rows_unchanged(json.loads((state/'c21-original-rows-private.json').read_text()));result.setdefault('preexistingRowsRetention',{})[phase]=db.original_rows_unchanged(retained_checkpoint);verify();guard()
   if phase=='races-remainder':
    remainder=result['phases'][phase];reuse=remainder['reusedEvidence']
    assert reuse['originalPassed'] is False and reuse['executedAgain'] is False and reuse['acceptedMeasurementCount']==12
    assert reuse['runtimeReceiptSha256']==a.expected_accepted_receipt_sha256 and reuse['raceResultSha256']==partial_race['resultSha256']
    assert [(row['case'],row.get('order')) for row in reuse['cases']]==expected_cases
    executed_names=[row['case'] for row in remainder['measurements']]
    assert executed_names.count('concurrent_new_round_creation')==1 and executed_names.count('concurrent_exact_round_reuse')==1
    assert not set(executed_names)&{name for name,order in expected_cases},'an accepted race case was replayed'
    retained_after=inventory('prior-race-inventory-after-private')
    for table,rows in retained_before['tables'].items():
     after_by_id={row['row']['id']:row for row in retained_after['tables'][table]}
     assert all(after_by_id.get(row['row']['id'])==row for row in rows),'previous synthetic race row/xmin changed: '+table
    result['priorRaceInventory'].update(afterSha256=sha_file(state/'prior-race-inventory-after-private.json'),allPriorSyntheticRowsAndXminRetained=True,countsAfter={table:len(rows) for table,rows in retained_after['tables'].items()})
    result['raceQualification']={'passed':True,'acceptedPriorCases':12,'acceptedPriorResultSha256':partial_race['resultSha256'],'newRemainderResultSha256':sha_file(state/'c21-races-remainder-result.json'),'oldFailedDualCause':'UNCLASSIFIED;_NOT_RELABELED','oldCasesReexecuted':False}

  result['passed']=True
 except BaseException as e:result['errorType']=type(e).__name__;raise
 finally:
  for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,signal.SIG_IGN)
  result['finalSnapshotVerified']=False
  if 'db' in locals():
   try:
    (state/'c21-final-db-snapshot.json').write_text(json.dumps(db.snapshot()));result['finalSnapshotSha256']=sha_file(state/'c21-final-db-snapshot.json');result['finalSnapshotVerified']=True
   except Exception as e:result['finalSnapshotError']=type(e).__name__;result['passed']=False
  cleanup=[]
  for name,proc,service in reversed(children):
   try:
    if proc.poll() is None:
     os.killpg(proc.pid,signal.SIGINT if name=='postgres' else signal.SIGTERM)
     try:proc.wait(timeout=25)
     except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=5)
   except ProcessLookupError:proc.poll()
   except Exception as e:cleanup.append({'name':name,'error':type(e).__name__})
  for log in logs:log.close()
  for name,port in status['ports'].items():
   try:
    with socket.create_connection(('127.0.0.1',port),timeout=.2):cleanup.append({'name':name,'error':'PortStillOpen'})
   except OSError:pass
  if (failed/'pgdata/postmaster.pid').exists():cleanup.append({'name':'postgres','error':'PostmasterPidStillPresent'})
  result['cleanupVerified']=not cleanup and all(p.poll() is not None for _,p,_ in children);result['processExits']={n:p.returncode for n,p,_ in children}
  try:
   after=manifest(source);(state/'source-byte-manifest-after.json').write_text(json.dumps(after));result['sourceUnchanged']=before is not None and after==before and not (source/'pgdata/postmaster.pid').exists()
  except Exception:result['sourceUnchanged']=False
  try:result['inputsUnchanged']=pinned is not None and binding()==pinned and sha_file(state/'runtime-private.json')==result['privateRuntimeFileSha256'] and sha_file(a.build_receipt)==a.expected_build_receipt_sha256 and sha_file(prior_prisma_path)==prior_prisma['sha256'] and dependency_manifest()==build['dependencies']
  except Exception:result['inputsUnchanged']=False
  try:
   preserved=original_evidence_manifest();(state/'original-run-evidence-after.json').write_text(json.dumps(preserved,indent=2));result['originalFailedEvidenceUnchanged']=preserved==original_evidence
   accepted_after=manifest(accepted);(state/'accepted-run-evidence-after.json').write_text(json.dumps(accepted_after,indent=2));result['acceptedEvidenceUnchanged']=accepted_after==accepted_evidence
   earlier_after=manifest(earlier);(state/'earlier-accepted-evidence-after.json').write_text(json.dumps(earlier_after,indent=2));result['earlierAcceptedEvidenceUnchanged']=earlier_after==earlier_evidence
   (state/'resumed-data-manifest-after.json').write_text(json.dumps({d:manifest(failed/d) for d in ['pgdata','uploads','exports']}))
  except Exception:result['originalFailedEvidenceUnchanged']=False;result['acceptedEvidenceUnchanged']=False;result['earlierAcceptedEvidenceUnchanged']=False
  isolation=all(result[k] for k in ['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified','originalFailedEvidenceUnchanged','acceptedEvidenceUnchanged','earlierAcceptedEvidenceUnchanged']);result['passed']=result['passed'] and isolation
  status.update(state='stopped',cleanupVerified=result['cleanupVerified'],cleanupErrors=cleanup,endedAt=time.time());record();(state/'c21-final-continuation-runtime-result.json').write_text(json.dumps(result,indent=2));lock.close()
  print(json.dumps({k:result[k] for k in ['passed','cleanupVerified','sourceUnchanged','inputsUnchanged']}),flush=True)
  if not isolation:raise RuntimeError('C21 isolation or cleanup validation failed')
if __name__=='__main__':main()
