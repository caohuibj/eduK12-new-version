#!/usr/bin/env python3
"""One persistent namespace, one isolated validated C21 clone, immutable C23 qualification.
No continuation/replay is automatic. A partial failure retains every private log.
"""
import argparse,fcntl,importlib.util,json,os,re,shutil,signal,socket,subprocess,sys,time,urllib.request
from pathlib import Path
from urllib.parse import urlparse
sys.dont_write_bytecode=True
BASE=Path(__file__).resolve().parent;BACKEND=BASE.parents[1]/'backend';REPO=BACKEND.parents[1]
def module(name,file):
 s=importlib.util.spec_from_file_location(name,BASE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=module('c23_db','c23-checkpoint-db.py');support=module('c23_support','c18-study-http.py')
sha_file,digest,manifest=m.sha_file,m.digest,support.manifest
preflight=module('c23_preflight','c23-checkpoint-preflight.py')
FLOOR,PHASES=preflight.FLOOR,preflight.PHASES
def main():
 os.umask(0o077)
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--tools',type=Path,required=True);p.add_argument('--descriptor',type=Path,required=True);p.add_argument('--expected-descriptor-sha256',required=True);p.add_argument('--state',type=Path,required=True);p.add_argument('--expected-head',required=True);p.add_argument('--expected-source-receipt-sha256',required=True);p.add_argument('--through',choices=PHASES,default='restore');p.add_argument('--build-receipt',type=Path,required=True);p.add_argument('--expected-build-receipt-sha256',required=True);p.add_argument('--preflight-only',action='store_true');a=p.parse_args()
 assert sha_file(a.descriptor)==a.expected_descriptor_sha256
 assert a.expected_descriptor_sha256=='3c56792af3eb299f221a5f863d7225248d713d72fd5598fe399750a54edc0fe7', 'descriptor must be the reviewed C21 checkpoint'
 descriptor=json.loads(a.descriptor.read_text());assert descriptor['stopped'] is True and descriptor['scope']=='READ_ONLY_C21_CHECKPOINT_DESCRIPTOR_NOT_A_NEW_RUN_RECEIPT';source=Path(descriptor['dataRoot']).resolve();evidence=Path(descriptor['evidenceRoot']).resolve()
 for item in descriptor['files'].values():assert sha_file(Path(item['path']))==item['sha256'] and Path(item['path']).stat().st_size==item['bytes']
 tools,state=a.tools.resolve(),a.state.resolve();requested=PHASES[:PHASES.index(a.through)+1]
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
 preflight.build_changes(changed)
 assert build['steps'] and all(step['exitCode']==0 for step in build['steps'])
 preflight.emitted_build(build['steps'],BACKEND,node)
 tsconfig=json.loads((BACKEND/'tsconfig.json').read_text());assert tsconfig['compilerOptions'].get('noEmit',False) is False and tsconfig['compilerOptions'].get('emitDeclarationOnly',False) is False and tsconfig['compilerOptions']['outDir']=='./dist'
 assert build['dependenciesUnchanged'] is True and build['clientUnchanged'] is True
 prior_prisma=build.get('prismaClientReceipt',build.get('priorPrismaReceipt'));assert prior_prisma;prior_prisma_path=Path(prior_prisma['path']);assert sha_file(prior_prisma_path)==prior_prisma['sha256']
 generated=json.loads(prior_prisma_path.read_text());assert generated['inputsUnchanged'] is True and generated['client']==build['client']
 assert generated['inputs']['prisma/schema.prisma']==build['inputs']['prisma/schema.prisma']
 if generated.get('scope')=='EXISTING_GENERATED_CLIENT_VERIFIED_NOT_GENERATION_PROVENANCE':
  assert generated['passed'] is True and generated['clientUnchanged'] is True and generated['dependenciesUnchanged'] is True
  assert generated['dependencies']==build['dependencies']
  assert generated['verificationToolSha256']==sha_file(BASE/'c23-checkpoint-verify-client.py')
  assert generated['schemaAgreement']['schemaTokensMatch'] is True and generated['runtimeMetadata']['inlineSchemaExact'] is True and generated['runtimeMetadata']['runtimeFieldMetadataMatches'] is True and generated['runtimeMetadata']['modelMappingsMatch'] is True and generated['runtimeMetadata']['enumValuesAndMappingsMatch'] is True and generated['installedNativeEngineMatches'] is True
 else:
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
 compiler_reuse={'producerHead':build['head'],'executionHead':a.expected_head,'receiptSha256':a.expected_build_receipt_sha256,'changedGitPaths':changed,'changedMigrations':migration_changes,'runtimeMigrations':{relative:sha_file(BACKEND/relative) for relative in current_inputs if relative.startswith('prisma/migrations/')},'compilerInputsDistClientUnchanged':True,'compilerSha256':digest(build['compiler']),'dependencyClosureSha256':digest(build['dependencies']),'dependencyFiles':len(build['dependencies']),'prismaClientReceiptSha256':prior_prisma['sha256'],'prismaEvidenceScope':generated.get('scope','ORIGINAL_GENERATION_RECEIPT')}
 client_verifier=module('c23_existing_client','c23-checkpoint-verify-client.py')
 fresh=client_verifier.schema_agreement(BACKEND);support.stopped(source)
 receipt=Path(descriptor['files']['finalReceipt']['path']);assert sha_file(receipt)==a.expected_source_receipt_sha256
 prior=json.loads(receipt.read_text());preflight.source_receipt(prior,sha_file(Path(descriptor['files']['finalSnapshot']['path'])))
 mem_available=next(int(l.split()[1])*1024 for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:'))
 lock=(tools/'.measurement.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 copybytes=sum(p.stat().st_size for d in ['pgdata','uploads','exports'] for p in (source/d).rglob('*') if p.is_file())
 assert copybytes==descriptor['plannedCloneBytes']
 budget=preflight.clone_budget(shutil.disk_usage(state.parent).free,copybytes,mem_available)
 assert {d:manifest(source/d) for d in ['pgdata','uploads','exports']}==json.loads(Path(descriptor['files']['resumedDataManifest']['path']).read_text()),'C21 stopped data differs from accepted manifest'
 if a.preflight_only:
  print(json.dumps({'status':'PREFLIGHT_ONLY_NOT_QUALIFIED','head':a.expected_head,'buildReceiptSha256':a.expected_build_receipt_sha256,'descriptorSha256':a.expected_descriptor_sha256,'budget':budget}));lock.close();return
 os.umask(0o077);state.mkdir(mode=0o700)
 runtime=json.loads(Path(descriptor['files']['runtimeTemplatePrivate']['path']).read_text())
 for key,role in [('DATABASE_URL_OWNER','eduk12_owner'),('DATABASE_URL','eduk12_runtime'),('DATABASE_URL_RUNTIME','eduk12_runtime')]:
  u=urlparse(runtime[key]);assert u.hostname=='127.0.0.1' and u.username==role and u.path=='/eduk12_recovery'
 runtime.update(PUBLIC_ASSESSMENT_IP_GET_LIMIT='10000',PUBLIC_ASSESSMENT_IP_FINAL_LIMIT='10000',PUBLIC_ASSESSMENT_TOKEN_GET_LIMIT='10000',PUBLIC_ASSESSMENT_TOKEN_FINAL_LIMIT='10000',PUBLIC_ASSESSMENT_RECOVERY_GET_LIMIT='10000',PUBLIC_ASSESSMENT_RECOVERY_FINAL_LIMIT='10000',BACKGROUND_WORKERS_ENABLED='false',HEAVY_PROCESSING_ENABLED='false',VIDEO_PROCESSING_ENABLED='false',PERF_ISOLATED_TEST_MODE='1',PERF_SQL_EVENT_COUNT='1')
 effective={**runtime,'PORT':'0','REDIS_URL':'redis://127.0.0.1:0','UPLOAD_DIR':'<state>/uploads','EXPORT_DIR':'<state>/exports'}
 for key in ['DATABASE_URL_OWNER','DATABASE_URL','DATABASE_URL_RUNTIME']:
  u=urlparse(effective[key]);effective[key]=u._replace(netloc=f'{u.username}:{u.password}@127.0.0.1:0').geturl()
 perf_env={'PUBLIC_ASSESSMENT_IP_GET_LIMIT':'10000','PUBLIC_ASSESSMENT_IP_FINAL_LIMIT':'10000','PUBLIC_ASSESSMENT_TOKEN_GET_LIMIT':'10000','PUBLIC_ASSESSMENT_TOKEN_FINAL_LIMIT':'10000','PUBLIC_ASSESSMENT_RECOVERY_GET_LIMIT':'10000','PUBLIC_ASSESSMENT_RECOVERY_FINAL_LIMIT':'10000'}
 env={'PATH':f'{node.parent}:{pg}:/usr/bin:/bin','HOME':str(state),'TMPDIR':str(state),'LANG':'C.UTF-8','TZ':'UTC','NODE_ENV':'test','PYTHONDONTWRITEBYTECODE':'1'}
 result={'passed':False,'scope':'C23_CHECKPOINT_HTTP_PG_RESTORE_NOT_C26_CAPACITY','phases':{},'sourceReceiptSha256':sha_file(receipt),'sourceReceiptPassed':prior.get('passed'),'sourceReceiptAcceptance':'BOUND_C21_DESCRIPTOR_NOT_OLD_DATA_ROOT_RECEIPT','cloneBytes':copybytes,'budget':budget,'freshPrisma':fresh,'buildReceiptSha256':a.expected_build_receipt_sha256,'compilerReuse':compiler_reuse}
 status={'state':'preparing','ports':{},'pids':{},'startedAt':time.time()};children=[];logs=[];pinned=before=None
 def record():
  t=state/'status.tmp';t.write_text(json.dumps(status,indent=2));t.replace(state/'status.json')
 def binding():
  paths=[*business,'server-version/scripts/recovery'];tracked=subprocess.check_output(['git','ls-files','-z','--',*paths],cwd=REPO).split(b'\0');extra=subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z','--',*paths],cwd=REPO).split(b'\0')
  inputs=[]
  for name in sorted(set(tracked+extra)-{b''}):
   file=REPO/os.fsdecode(name);assert file.is_file() and not file.is_symlink();inputs.append({'path':os.fsdecode(name),'mode':file.stat().st_mode&0o777,'sha256':sha_file(file)})
  return {'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip(),'sourceInputs':inputs,'sourceInputsSha256':digest(inputs),'runtimeFingerprint':json.loads(subprocess.check_output([node,BASE/'runtime-fingerprint.cjs',BACKEND],text=True)),'generatedClientManifestSha256':digest(manifest(BACKEND/'node_modules/.prisma/client')),'tools':{str(v.relative_to(tools)):sha_file(v) for v in [node,pg/'postgres',pg/'psql',pg/'pg_dump',pg/'pg_restore',redis]},'postgresLibraryBytes':{str(v.relative_to(tools)):{'realpath':str(v.resolve()),'sha256':sha_file(v)} for v in sorted((tools/'postgresql/lib').rglob('*')) if v.is_file()},'installedDependencyLockSha256':sha_file(BACKEND/'node_modules/.package-lock.json') if (BACKEND/'node_modules/.package-lock.json').is_file() else None,'runtimeConfigurationSha256':digest(effective),'performanceConfigurationSha256':digest(perf_env),'phases':requested}
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
  assert sha_file(a.descriptor)==a.expected_descriptor_sha256
  assert all(sha_file(Path(item['path']))==item['sha256'] for item in descriptor['files'].values()),'accepted source evidence changed'
  assert binding()==pinned,'frozen source, artifact, tools or config changed'
  assert sha_file(a.build_receipt)==a.expected_build_receipt_sha256,'build receipt changed'
 def interrupted(*_):raise KeyboardInterrupt
 for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,interrupted)
 try:
  record();pinned=binding();(state/'frozen-inputs.json').write_text(json.dumps(pinned,indent=2));result['frozenInputsSha256']=sha_file(state/'frozen-inputs.json')
  before=manifest(source)
  assert {d:manifest(source/d) for d in ['pgdata','uploads','exports']}==json.loads(Path(descriptor['files']['resumedDataManifest']['path']).read_text()),'C21 stopped data differs from final accepted manifest'
  (state/'source-byte-manifest-before.json').write_text(json.dumps(before));result['sourceManifestSha256']=digest(before)
  for d in ['pgdata','uploads','exports']:
   original=manifest(source/d);shutil.copytree(source/d,state/d,copy_function=shutil.copy2);assert manifest(state/d)==original;guard()
  shutil.copy2(Path(descriptor['files']['legacyFixturePrivate']['path']),state/'fixture-private.json')
  shutil.copy2(Path(descriptor['files']['c21FixturePrivate']['path']),state/'c21-fixture-private.json')
  held=[]
  for name in ['postgres','redis','api']:
   sock=socket.socket();sock.bind(('127.0.0.1',0));held.append(sock);status['ports'][name]=sock.getsockname()[1]
  for sock in held:sock.close()
  dbport,rport,aport=[status['ports'][k] for k in ['postgres','redis','api']]
  for key in ['DATABASE_URL_OWNER','DATABASE_URL','DATABASE_URL_RUNTIME']:
   u=urlparse(runtime[key]);runtime[key]=u._replace(netloc=f'{u.username}:{u.password}@127.0.0.1:{dbport}').geturl()
  runtime.update(PORT=str(aport),REDIS_URL=f'redis://127.0.0.1:{rport}',UPLOAD_DIR=str(state/'uploads'),EXPORT_DIR=str(state/'exports'))
  (state/'runtime-private.json').write_text(json.dumps(runtime));result['privateRuntimeFileSha256']=sha_file(state/'runtime-private.json');public={k:v for k,v in runtime.items() if k!='DATABASE_URL_OWNER'}
  postgres=start([pg/'postgres','-D',state/'pgdata','-h','127.0.0.1','-p',dbport,'-k','','-c','timezone=UTC','-c','shared_buffers=128MB','-c','max_connections=40'],'postgres');ready(dbport,postgres)
  # Retry only the structured startup SQLSTATE; never suppress auth/config errors.
  driver="const {Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL_OWNER,connectionTimeoutMillis:2000});(async()=>{try{await c.connect();await c.query('SELECT 1');process.stdout.write('ready')}catch(e){process.stdout.write(e.code||'UNKNOWN');process.exitCode=e.code==='57P03'?75:1}finally{await c.end()}})()"
  deadline=time.monotonic()+60;polls=[]
  while True:
   probe=subprocess.run([node,'--require',BASE/'loopback-only.cjs','-e',driver],cwd=BACKEND,env={**env,'DATABASE_URL_OWNER':runtime['DATABASE_URL_OWNER']},text=True,capture_output=True,timeout=8);polls.append({'exit':probe.returncode,'result':probe.stdout});(state/'postgres-readiness.json').write_text(json.dumps(polls))
   if probe.returncode==0 and probe.stdout=='ready':break
   assert probe.returncode==75 and probe.stdout=='57P03';guard();assert time.monotonic()<deadline;time.sleep(.2)
  status.update(head=a.expected_head,node='v24.21.0',runtimeFingerprint=pinned['runtimeFingerprint']);record();db=m.Database(tools,state)
  public={k:v for k,v in runtime.items() if k!='DATABASE_URL_OWNER'}
  result['privateRuntimeFileSha256']=sha_file(state/'runtime-private.json')
  assert db.snapshot()==json.loads(Path(descriptor['files']['finalSnapshot']['path']).read_text()),'stopped clone does not match bound source checkpoint'
  http=False
  for phase in requested:
   verify();guard()
   if phase in ['upgrade','restore']:
    status['state']='upgrading' if phase=='upgrade' else 'restoring';record();argv=['python3',BASE/'c23-checkpoint-db.py','--tools',tools,'--state',state,'--phase',phase];run(argv,'c23-'+phase,timeout=600)
   else:
    if not http:
     rp=start([redis,'--bind','127.0.0.1','--port',rport,'--dir',state,'--save','','--appendonly','no','--maxmemory','128mb','--maxmemory-policy','noeviction'],'redis');ready(rport,rp)
     api=start([node,'--require',BASE/'loopback-only.cjs','dist/index.js'],'api',public);ready(aport,api);status['apiUrl']=f'http://127.0.0.1:{aport}'
     for endpoint in ['health','ready']:
      with urllib.request.urlopen(status['apiUrl']+'/'+endpoint,timeout=8) as response:assert response.status==200
     http=True
    status['state']='running';record();argv=[node,'--require',BASE/'loopback-only.cjs',BASE/f'c23-checkpoint-{phase}.mjs',state];run(argv,'c23-'+phase,public,timeout=600 if phase=='functional' else 300)
   result['phases'][phase]=json.loads((state/f'c23-{phase}-result.json').read_text());assert result['phases'][phase]['passed'] is True
   result.setdefault('phaseProducers',{})[phase]={'argv':list(map(str,argv)),'inputBindingSha256':result['frozenInputsSha256'],'resultSha256':sha_file(state/f'c23-{phase}-result.json')}
   db.original_rows_unchanged(json.loads((state/'c23-original-rows-private.json').read_text()));verify();guard()
  result['passed']=set(result['phases'])==set(PHASES)
  result['requestedPrefixPassed']=True
 except BaseException as e:
  result['errorType']=type(e).__name__
  import traceback
  (state/'c23-launcher-error-private.log').write_text(traceback.format_exc())
  raise
 finally:
  for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,signal.SIG_IGN)
  result['finalSnapshotVerified']=False
  cleanup=[]
  def stop_child(name,proc):
   try:
    if name in ['postgres','redis','api'] and proc.poll() is not None:
     cleanup.append({'name':name,'error':'UnexpectedServiceExitBeforeShutdown'})
    if proc.poll() is None:
     os.killpg(proc.pid,signal.SIGINT if name=='postgres' else signal.SIGTERM)
     try:proc.wait(timeout=25)
     except subprocess.TimeoutExpired:
      cleanup.append({'name':name,'error':'GracefulShutdownTimeout'});os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=5)
   except ProcessLookupError:proc.poll()
   except Exception as error:cleanup.append({'name':name,'error':type(error).__name__})
   if name in ['postgres','redis','api']:
    try:preflight.service_exit(name,proc.returncode)
    except AssertionError:cleanup.append({'name':name,'error':'UnexpectedShutdownExit','returncode':proc.returncode})
  # Quiesce every writer before calling a snapshot final. PostgreSQL remains
  # available solely for the bounded read-only snapshot, then stops last.
  for name,proc,_ in reversed(children):
   if name!='postgres':stop_child(name,proc)
  writers_stopped=all(proc.poll() is not None for name,proc,_ in children if name!='postgres')
  if 'db' in locals() and writers_stopped and not cleanup:
   try:
    original=state/'c23-original-rows-private.json'
    if original.exists():result['finalOriginalRowsPreserved']=db.original_rows_unchanged(json.loads(original.read_text()))
    (state/'c23-final-db-snapshot.json').write_text(json.dumps(db.snapshot()));result['finalSnapshotSha256']=sha_file(state/'c23-final-db-snapshot.json');result['finalSnapshotVerified']=True
   except Exception as error:result['finalSnapshotError']=type(error).__name__;result['passed']=False
  for name,proc,_ in reversed(children):
   if name=='postgres':stop_child(name,proc)
  for log in logs:log.close()
  for name,port in status['ports'].items():
   try:
    with socket.create_connection(('127.0.0.1',port),timeout=.2):cleanup.append({'name':name,'error':'PortStillOpen'})
   except OSError:pass
  if (state/'pgdata/postmaster.pid').exists():cleanup.append({'name':'postgres','error':'PostmasterPidStillPresent'})
  result['cleanupVerified']=not cleanup and all(p.poll() is not None for _,p,_ in children);result['processExits']={n:p.returncode for n,p,_ in children}
  try:
   after=manifest(source);(state/'source-byte-manifest-after.json').write_text(json.dumps(after));result['sourceUnchanged']=before is not None and after==before and not (source/'pgdata/postmaster.pid').exists()
  except Exception:result['sourceUnchanged']=False
  try:result['inputsUnchanged']=pinned is not None and binding()==pinned and sha_file(state/'runtime-private.json')==result['privateRuntimeFileSha256'] and sha_file(a.build_receipt)==a.expected_build_receipt_sha256 and sha_file(prior_prisma_path)==prior_prisma['sha256'] and dependency_manifest()==build['dependencies'] and sha_file(a.descriptor)==a.expected_descriptor_sha256 and all(sha_file(Path(item['path']))==item['sha256'] for item in descriptor['files'].values())
  except Exception:result['inputsUnchanged']=False
  isolation=all(result[k] for k in ['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified']);result['passed']=result['passed'] and preflight.complete(result)
  status.update(state='stopped',cleanupVerified=result['cleanupVerified'],cleanupErrors=cleanup,endedAt=time.time());record();(state/'c23-runtime-result.json').write_text(json.dumps(result,indent=2));lock.close()
  print(json.dumps({k:result[k] for k in ['passed','cleanupVerified','sourceUnchanged','inputsUnchanged']}),flush=True)
  if not isolation:raise RuntimeError('C23 isolation or cleanup validation failed')
if __name__=='__main__':main()
