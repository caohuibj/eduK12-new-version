"""Bounded PR356 checks. All database traffic is loopback/synthetic; no deployment."""
import os,sys,json,subprocess,tempfile,re,hashlib,tarfile,shutil,uuid,stat,datetime,fnmatch
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('PR356_EVIDENCE_DIR',str(ROOT/'pr356-evidence'))).resolve();OUT.mkdir(parents=True,exist_ok=True)
B=json.loads((ROOT/'.github/scripts/pr356-bindings.json').read_text());BACK=ROOT/'server-version/backend'
def receipt(name,value):
 (OUT/(name+'.json')).write_text(json.dumps({'sourceHead':os.environ.get('GITHUB_SHA'),'run':os.environ.get('GITHUB_RUN_ID'),'attempt':os.environ.get('GITHUB_RUN_ATTEMPT'),**value},indent=2)+'\n')
def utc_now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def run(name,args,cwd=ROOT,env=None,check=True):
 print(name,flush=True);started=utc_now()
 with (OUT/(name+'.log')).open('wb') as f:p=subprocess.run([str(x) for x in args],cwd=cwd,env=env,stdout=f,stderr=subprocess.STDOUT)
 data=(OUT/(name+'.log')).read_bytes();result={'command':[str(x) for x in args],'cwd':str(cwd),'exitCode':p.returncode,'logSHA256':hashlib.sha256(data).hexdigest(),'startedAt':started,'completedAt':utc_now()}
 receipt(name,result)
 if check and p.returncode:raise RuntimeError(name+' failed; see retained log (not echoed to avoid private synthetic data)')
 return result
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
def assert_app():
 for c,t in B['components'].items():assert git('rev-parse','HEAD:server-version/'+c)==t,'Application drift'
def docker(*args,**kwargs):
 env={k:v for k,v in os.environ.items() if k not in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']}
 return subprocess.run(['docker','--host=unix:///var/run/docker.sock',*args],env=env,check=True,**kwargs)
def db_setup():
 u=urlsplit(os.environ['DATABASE_URL']);assert os.environ.get('NODE_ENV')=='test' and os.environ.get('PR356_SCHEMA_ISOLATED')=='1'
 assert u.hostname=='127.0.0.1' and u.port==55439 and u.path=='/pr356_ci_upgrade' and not u.query
 container=os.environ['PR356_POSTGRES_CONTAINER'];assert re.fullmatch(r'[a-zA-Z0-9_-]{1,80}',container)
 def sql(db,q):
  assert re.fullmatch(r'[a-z][a-z0-9_]+',db)
  r=docker('exec',container,'psql','-X','-v','ON_ERROR_STOP=1','-U',u.username,'-d',db,'-At','-c',q,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  return r.stdout.decode().strip()
 def envdb(db):return {**os.environ,'DATABASE_URL':urlunsplit((u.scheme,u.netloc,'/'+db,'',''))}
 def cols(db):return json.loads(sql(db,"SELECT json_object_agg(table_name,columns) FROM (SELECT table_name,json_agg(column_name ORDER BY ordinal_position) AS columns FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations' GROUP BY table_name)x"))
 def digests(db,columns):
  out={}
  for t,cc in columns.items():
   assert re.fullmatch(r'[A-Za-z0-9_]+',t) and all(re.fullmatch(r'[A-Za-z0-9_]+',c) for c in cc)
   selected=','.join('"'+c+'"' for c in cc)
   out[t]=sql(db,f'''SELECT count(*)::text||':'||coalesce(md5(string_agg(h,',' ORDER BY h)),'') FROM (SELECT md5(row_to_json(x)::text) h FROM (SELECT {selected} FROM public."{t}")x)y''')
  return out
 return u,container,sql,envdb,cols,digests

REPOSITORY='caohuibj/eduK12-new-version'
PHASE_CASES={'backend-image':['backend-image-built','backend-image-archived'],
 'frontend-image':['frontend-image-built','frontend-image-archived','frontend-dist-extracted'],
 'backend-audit':['backend-dependency-audit'],'frontend-audit':['frontend-dependency-audit']}
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def digest(path):
 with Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def relative_file(path):
 value=str(path)
 if not value or value.startswith('/') or '\\' in value or any(p in ('','..','.') for p in value.split('/')):raise ValueError('Unsafe input path')
 return value
def verify_working_inputs(inputs,root=None,git_reader=None,required_paths=None):
 """Shared byte/mode/commit validation; performs no application checks."""
 root=Path(root or ROOT);read=git_reader or git
 if inputs.get('schemaVersion')!=1 or not inputs.get('files') or any(not isinstance(inputs.get(k),dict) or not inputs[k] for k in ['configuration','tools','dependencies']):raise ValueError('Complete source/configuration/tools/dependency inputs required')
 files=inputs['files'];paths=[]
 for f in files:
  name=relative_file(f['path']);paths.append(name)
  if f['mode'] not in ['100644','100755'] or not re.fullmatch('[a-f0-9]{40}',f['blob']):raise ValueError('Unsupported input mode/blob')
  path=root/name
  if path.is_symlink() or not path.is_file():raise ValueError('Missing or linked phase input: '+name)
  raw=path.read_bytes();actual=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
  mode='100755' if path.stat().st_mode & stat.S_IXUSR else '100644'
  if actual!=f['blob'] or mode!=f['mode'] or read('rev-parse','HEAD:'+name)!=f['blob']:raise ValueError('Phase source input changed: '+name)
 if len(paths)!=len(set(paths)) or paths!=sorted(paths):raise ValueError('Phase input list must be complete, unique and sorted')
 if not set(required_paths or []).issubset(set(paths)):raise ValueError('Component consumer inputs are incomplete')
 return inputs

def verify_docker_context(component,inputs):
 """Only the registered .dockerignore may exclude generated context files.
 Existing policies have root-level literal/glob patterns; unfamiliar syntax
 stops here instead of guessing exclusion semantics."""
 context=ROOT/'server-version'/component;known={f['path'] for f in inputs['files']};ignore=context/'.dockerignore'
 if str(ignore.relative_to(ROOT)) not in known:raise ValueError('Docker ignore policy is not registered')
 patterns=[line.strip() for line in ignore.read_text().splitlines() if line.strip() and not line.lstrip().startswith('#')]
 if any('/' in p or '\\' in p or p.startswith('!') or '**' in p for p in patterns):raise ValueError('Unsupported Docker ignore syntax; review exact context policy')
 def ignored(relative):return any(fnmatch.fnmatchcase(relative.split('/')[0],pattern) for pattern in patterns)
 for directory,dirs,files in os.walk(context,followlinks=False):
  relative_dir=Path(directory).relative_to(context)
  for name in list(dirs):
   path=Path(directory)/name;rel=path.relative_to(context).as_posix()
   if ignored(rel):dirs.remove(name)
   elif path.is_symlink():raise ValueError('Unregistered linked Docker context directory')
  for name in files:
   path=Path(directory)/name;rel=path.relative_to(context).as_posix()
   if not ignored(rel) and (path.is_symlink() or path.relative_to(ROOT).as_posix() not in known):raise ValueError('Unregistered Docker context file: '+rel)

def validate_phase_inputs(phase,spec,inputs):
 if spec.get('id')!=phase or spec.get('caseIds')!=PHASE_CASES[phase] or spec.get('inputs')!=inputs:raise ValueError('Phase specification drift')
 if spec.get('inputsSHA256')!=hashlib.sha256(canonical(inputs).encode()).hexdigest():raise ValueError('Phase input digest drift')
 component=phase.split('-')[0];context='server-version/'+component
 required=set(git('ls-tree','-r','--name-only','HEAD','--',context).splitlines()) if phase.endswith('-image') else {context+'/package.json',context+'/package-lock.json'}
 required.add('.github/scripts/pr356-qualification.py')
 verify_working_inputs(inputs,required_paths=required)
 if git('status','--porcelain','--untracked-files=all','--',context):raise ValueError('Dirty component input tree')
 if phase.endswith('-image'):verify_docker_context(component,inputs)
 return inputs

def phase_context(phase):
 if os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('GITHUB_REPOSITORY')!=REPOSITORY:raise ValueError('Official same-repository workflow required')
 head=git('rev-parse','HEAD');run_id=os.environ.get('GITHUB_RUN_ID','');attempt=os.environ.get('GITHUB_RUN_ATTEMPT','')
 if os.environ.get('GITHUB_SHA')!=head or not re.fullmatch('[a-f0-9]{40}',head) or not re.fullmatch('[1-9][0-9]*',run_id) or not re.fullmatch('[1-9][0-9]*',attempt):raise ValueError('Official producer identity required')
 spec=json.loads(Path(os.environ['PR356_PHASE_SPEC']).read_text());inputs=json.loads(Path(os.environ['PR356_PHASE_INPUTS']).read_text())
 validate_phase_inputs(phase,spec,inputs)
 return {'spec':spec,'inputs':inputs,'source':{'repository':REPOSITORY,'runId':run_id,'head':head,'producerAttempt':int(attempt)}}

def tool_identity(command):
 executable=shutil.which(command)
 if not executable:raise RuntimeError('Missing producer tool: '+command)
 path=Path(executable).resolve()
 return {'version':subprocess.check_output([command,'--version'],text=True).strip(),'executableSHA256':digest(path)}
def output_files(root):
 files={}
 for path in sorted(root.rglob('*')):
  if path.is_symlink():raise ValueError('Linked output is not a producer artifact')
  if path.is_file():files[path.relative_to(OUT).as_posix()]={'sha256':digest(path),'bytes':path.stat().st_size}
 return files

def phase_proof(phase,context,command,outputs,status='success'):
 outputs.setdefault('upstream',[])
 validate_phase_inputs(phase,context['spec'],context['inputs'])
 proof={'schemaVersion':1,'kind':'pr356-phase-proof','phaseId':phase,'status':status,'source':context['source'],
  'inputs':context['inputs'],'inputsSHA256':hashlib.sha256(canonical(context['inputs']).encode()).hexdigest(),
  'command':{'argv':command['command'],'cwd':command['cwd'],'exitCode':command['exitCode'],'logSHA256':command['logSHA256'],'startedAt':command['startedAt'],'completedAt':command['completedAt']},
  'checks':[{'id':i,'status':'passed' if status=='success' else 'failed'} for i in PHASE_CASES[phase]],'outputs':outputs}
 (OUT/'phase-receipt.json').write_text(json.dumps(proof,indent=2)+'\n')
 return proof

def pin_dockerfile_sources(original,resolve_base):
 """Preserve every byte except registered external FROM image tokens."""
 aliases=set();resolved={};mappings=[];lines=[]
 for number,line in enumerate(original.splitlines(keepends=True),1):
  match=re.match(r'^(FROM\s+)(\S+)([^\r\n]*)(\r?\n|$)',line,re.IGNORECASE)
  if not match:lines.append(line);continue
  prefix,image,suffix,ending=match.groups()
  alias=re.fullmatch(r'\s+[Aa][Ss]\s+([A-Za-z0-9_-]+)\s*',suffix) if suffix else None
  if suffix and not alias:raise ValueError('Unsupported registered FROM syntax')
  if image.lower() not in aliases:
   if not re.fullmatch(r'(node|nginx):[A-Za-z0-9._-]+',image):raise ValueError('Unapproved external base reference')
   if image not in resolved:resolved[image]=resolve_base(image,len(resolved))
   material=resolved[image];immutable=material['immutableReference']
   repository='docker.io/library/'+image.split(':',1)[0]
   if not re.fullmatch(re.escape(repository)+r'@sha256:[a-f0-9]{64}',immutable):raise ValueError('Official immutable FROM digest required')
   mappings.append({'line':number,'original':image,'immutable':immutable,'stage':alias.group(1) if alias else None})
   line=prefix+immutable+suffix+ending
  if alias:aliases.add(alias.group(1).lower())
  lines.append(line)
 if not mappings:raise ValueError('Registered Dockerfile has no external FROM')
 return ''.join(lines),mappings,list(resolved.values())

def docker_environment():
 return {k:v for k,v in os.environ.items() if k not in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']}

def prepare_pinned_dockerfile(component,docker_command):
 original_path=ROOT/'server-version'/component/'Dockerfile';original_bytes=original_path.read_bytes();original=original_bytes.decode('utf-8')
 def resolve_base(reference,index):
  official='docker.io/library/'+reference
  pull=run('base-'+str(index)+'-pull',docker_command+['pull',official],env=docker_environment())
  inspect=run('base-'+str(index)+'-inspect',docker_command+['image','inspect',official],env=docker_environment())
  rows=json.loads((OUT/('base-'+str(index)+'-inspect.log')).read_text())
  if len(rows)!=1 or not re.fullmatch('sha256:[a-f0-9]{64}',rows[0].get('Id','')):raise ValueError('Official base image inspect required')
  name=reference.split(':',1)[0];accepted={name,'library/'+name,'docker.io/library/'+name}
  digests={v.split('@',1)[1] for v in rows[0].get('RepoDigests',[]) if '@' in v and v.split('@',1)[0] in accepted and re.fullmatch('sha256:[a-f0-9]{64}',v.split('@',1)[1])}
  if len(digests)!=1:raise ValueError('Missing or ambiguous official base manifest digest')
  immutable='docker.io/library/'+name+'@'+next(iter(digests))
  return {'configuredReference':reference,'officialResolutionReference':official,'immutableReference':immutable,'resolvedEngineImageId':rows[0]['Id'],
   'repoDigests':rows[0]['RepoDigests'],'pullCommand':pull,'inspectCommand':inspect}
 pinned,mappings,materials=pin_dockerfile_sources(original,resolve_base)
 path=OUT/'Dockerfile.pinned';path.write_bytes(pinned.encode('utf-8'))
 record={'strategy':'resolve-official-FROM-and-build-by-immutable-digest','originalPath':original_path.relative_to(ROOT).as_posix(),
  'originalSHA256':hashlib.sha256(original_bytes).hexdigest(),'generatedPath':'Dockerfile.pinned','generatedSHA256':digest(path),
  'changes':'Only external FROM image tokens; all local stages and other bytes retained','mappings':mappings,'materials':materials}
 (OUT/'dockerfile-materials.json').write_text(json.dumps(record,indent=2)+'\n')
 return path,record

def build_component(component):
 if any(p.name not in ['phase-spec.json','phase-inputs.json'] for p in OUT.iterdir()):raise ValueError('Producer output is not fresh; preserve prior evidence and use verify-local')
 phase=component+'-image';context=phase_context(phase);source_before=context['inputs'];docker_command=['docker','--host=unix:///var/run/docker.sock']
 execution={'python':{'version':sys.version,'executableSHA256':digest(sys.executable)},'node':tool_identity('node'),
  'dockerVersion':json.loads(subprocess.check_output(docker_command+['version','--format','{{json .}}'],text=True,env=docker_environment())),
  'sourceInputsSHA256Before':hashlib.sha256(canonical(source_before).encode()).hexdigest()}
 pinned,materials=prepare_pinned_dockerfile(component,docker_command)
 execution['dockerfileMaterials']=materials
 tag='pr356-'+component+':'+context['source']['head']
 build=run('build-'+component,docker_command+['build','--file',str(pinned),'--target','runtime','--build-arg','NPM_REGISTRY=https://registry.npmjs.org','--tag',tag,str(ROOT/'server-version'/component)],env=docker_environment())
 inspect=json.loads(subprocess.check_output(docker_command+['image','inspect',tag],text=True,env=docker_environment()))
 if len(inspect)!=1 or not re.fullmatch('sha256:[a-f0-9]{64}',inspect[0].get('Id','')):raise ValueError('A single immutable image ID is required')
 (OUT/(component+'-image.json')).write_text(json.dumps(inspect,indent=2)+'\n')
 run('save-'+component,docker_command+['image','save','--output',str(OUT/(component+'.tar')),inspect[0]['Id']],env=docker_environment())
 receipt(component+'-archive',{'tag':tag,'imageId':inspect[0]['Id'],'sha256':digest(OUT/(component+'.tar')),'bytes':(OUT/(component+'.tar')).stat().st_size})
 if component=='frontend':
  cid=subprocess.check_output(docker_command+['create',inspect[0]['Id']],text=True,env=docker_environment()).strip()
  try:run('extract-frontend-dist',docker_command+['cp',cid+':/usr/share/nginx/html',str(OUT/'dist')],env=docker_environment())
  finally:subprocess.run(docker_command+['rm',cid],check=True,stdout=subprocess.DEVNULL,env=docker_environment())
  manifest={'schemaVersion':1,'components':B['components'],'head':context['source']['head'],'sourceHead':context['source']['head'],
   'run':context['source']['runId'],'attempt':context['source']['producerAttempt'],'source':context['source'],
   'files':{str(p.relative_to(OUT/'dist')):{'sha256':digest(p),'bytes':p.stat().st_size} for p in sorted((OUT/'dist').rglob('*')) if p.is_file()}}
  if not manifest['files'] or any(p.is_symlink() for p in (OUT/'dist').rglob('*')):raise ValueError('Complete regular frontend dist required')
  (OUT/'frontend-dist.json').write_text(json.dumps(manifest,indent=2)+'\n')
 execution['sourceInputsSHA256After']=hashlib.sha256(canonical(validate_phase_inputs(phase,context['spec'],context['inputs'])).encode()).hexdigest()
 (OUT/'execution-inputs.json').write_text(json.dumps(execution,indent=2)+'\n')
 all_files=output_files(OUT);image_files={k:v for k,v in all_files.items() if k!='frontend-dist.json' and not k.startswith('dist/')}
 outputs={'image':{'imageId':inspect[0]['Id'],'archive':component+'.tar','archiveSHA256':digest(OUT/(component+'.tar'))},
  'executionInputs':execution,'artifactFiles':{phase:image_files}}
 if component=='frontend':
  outputs['artifactFiles']['frontend-dist']={k:v for k,v in all_files.items() if k=='frontend-dist.json' or k.startswith('dist/')}
  outputs['dist']={'path':'dist','manifest':'frontend-dist.json'}
 phase_proof(phase,context,build,outputs)
 return 0

def audit_component(component):
 if any(p.name not in ['phase-spec.json','phase-inputs.json'] for p in OUT.iterdir()):raise ValueError('Audit output is not fresh; preserve the prior execution')
 phase=component+'-audit';context=phase_context(phase)
 execution={'python':{'version':sys.version,'executableSHA256':digest(sys.executable)},'node':tool_identity('node'),'npm':tool_identity('npm')}
 result=run('audit-'+component,['npm','audit','--package-lock-only','--audit-level=high','--registry=https://registry.npmjs.org','--json'],ROOT/'server-version'/component,check=False)
 phase_proof(phase,context,result,{'files':output_files(OUT),'executionInputs':execution},'success' if result['exitCode']==0 else 'failed')
 return result['exitCode']

def legacy_database():
  u,container,sql,envdb,cols,digests=db_setup();assert sql('pr356_ci_upgrade',"SELECT count(*) FROM pg_tables WHERE schemaname='public'")=='0','Fresh schema-only owned DB required'
  tmp=Path(tempfile.mkdtemp(prefix='pr356-main-',dir=os.environ.get('RUNNER_TEMP','/tmp')))
  archive=tmp/'main.tar';archive.write_bytes(subprocess.check_output(['git','archive',B['base'],'server-version/backend'],cwd=ROOT))
  with tarfile.open(archive) as tar:tar.extractall(tmp,filter='data')
  old=tmp/'server-version/backend';(old/'node_modules').symlink_to(BACK/'node_modules',target_is_directory=True)
  old_env=envdb('pr356_ci_upgrade')
  run('main-230-migrate',[BACK/'node_modules/.bin/prisma','migrate','deploy'],old,old_env)
  assert sql('pr356_ci_upgrade','SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')=='230'
  run('main-client-generate',[BACK/'node_modules/.bin/prisma','generate'],old,old_env)
  run('old-data-real-final',[BACK/'node_modules/.bin/tsx',ROOT/'.github/scripts/pr356-restore-fixture.cjs'],old,old_env)
  columns=cols('pr356_ci_upgrade');before=digests('pr356_ci_upgrade',columns);assert not before['survey_package_report_artifacts'].startswith('0:')
  receipt('old-data-before-upgrade',{'base':B['base'],'columns':columns,'digests':before,'containsRealFinalAndEncryptedReport':True})
  run('candidate-237-migrate',[BACK/'node_modules/.bin/prisma','migrate','deploy'],BACK,old_env)
  run('candidate-client-generate',[BACK/'node_modules/.bin/prisma','generate'],BACK,old_env)
  assert sql('pr356_ci_upgrade','SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')=='237'
  assert digests('pr356_ci_upgrade',columns)==before,'Existing facts changed during upgrade'
  assert sql('pr356_ci_upgrade','SELECT count(*) FROM survey_package_report_artifacts WHERE budget_version IS NOT NULL')=='0','Legacy report was backfilled'
  # Read through current authorization + integrity reader, not just SQL hashes.
  script="const fs=require('node:fs');const i=JSON.parse(fs.readFileSync(process.env.PR356_EVIDENCE_DIR+'/old-report-identity.json'));const db=require('./src/config/database.ts').prisma;(async()=>{try{const r=await require('./src/modules/survey/governed-package.reports.ts').readGovernedPackageReports(i.actor,i);if(r.list.length!==i.packageReportRows||r.semantics!=='SAVED_AT_FINAL_NO_RESCORING')throw Error('Legacy report read failed')}finally{await require('./src/config/queue.ts').closeQueues(true);await db.$disconnect()}})().catch(e=>{console.error(e);process.exitCode=1})"
  run('current-reader-legacy-final',[BACK/'node_modules/.bin/tsx','-e',script],BACK,old_env)
  allcolumns=cols('pr356_ci_upgrade');allrows=digests('pr356_ci_upgrade',allcolumns)
  dump=OUT/'synthetic-upgrade.dump'
  with dump.open('wb') as f:docker('exec',container,'pg_dump','-U',u.username,'--format=custom','--no-owner','--no-acl','pr356_ci_upgrade',stdout=f)
  sql('postgres','CREATE DATABASE pr356_ci_restore')
  with dump.open('rb') as f:docker('exec','-i',container,'pg_restore','-U',u.username,'--no-owner','--no-acl','--exit-on-error','-d','pr356_ci_restore',stdin=f,stdout=subprocess.DEVNULL)
  assert digests('pr356_ci_restore',allcolumns)==allrows,'Restored rows changed'
  run('restored-reader-legacy-final',[BACK/'node_modules/.bin/tsx','-e',script],BACK,envdb('pr356_ci_restore'))
  protected=sql('pr356_ci_restore',"DO $$ BEGIN BEGIN UPDATE survey_package_report_artifacts SET budget_version=1; RAISE EXCEPTION 'MUTATION_WAS_ALLOWED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Survey governed content is append-only' THEN RAISE; END IF; END; END $$;")
  assert digests('pr356_ci_restore',allcolumns)==allrows
  receipt('schema-upgrade-restore',{'base':B['base'],'migrations':[230,237],'existingColumnValuesUnchanged':True,'legacyBudgetStillNull':True,'currentReaderAndRestoredReader':True,'appendOnlyProtection':True,'dumpSHA256':hashlib.sha256(dump.read_bytes()).hexdigest(),'tables':len(allrows),'syntheticOnly':True})
  # Main source differs from the last partial/continuation execution. Run the
  # currently unqualified whole-file vertical and worker journeys once, separately.
  for label,db,file,flag,count in [('vertical','eduk12_dot356_vertical_20261026_'+uuid.uuid4().hex[:10],'measurement-content/dot356-standard-vertical.postgres.integration.test.ts','DOT356_STANDARD_VERTICAL',4),('receipt','pr356_receipt_recovery_test_'+uuid.uuid4().hex[:10],'measurement-content/training-receipt-recovery.postgres.integration.test.ts','PR356_RECEIPT_RECOVERY_ISOLATED',1)]:
   sql('postgres','CREATE DATABASE "'+db+'"');e=envdb(db);e[flag]='1';e['DOT356_VERTICAL_OUTPUT']=str(OUT/'vertical-observation.json')
   assert not any(e.get(k)=='1' for k in ['DOT356_STANDARD_AUTHORITY_CONTINUE','DOT356_STANDARD_RECEIPT_CONTINUE','PR356_RECEIPT_WORKER_CONTINUE','PR356_RECEIPT_VERIFY_ONLY'])
   run(label+'-schema',[BACK/'node_modules/.bin/prisma','migrate','deploy'],BACK,e)
   report=OUT/(label+'-tests.json')
   run(label+'-journey',[BACK/'node_modules/.bin/vitest','run','src/__tests__/'+file,'--maxWorkers=1','--reporter=default','--reporter=json','--outputFile='+str(report)],BACK,e)
   x=json.loads(report.read_text());assert x['success'] and x['numPassedTests']==count and x['numFailedTests']==0 and x['numPendingTests']==0
  receipt('database-complete',{'freshVertical':4,'freshActualWorker':1,'upgradeRestore':True,'noSkippedAssertions':True})

def main():
 assert_app()
 mode=sys.argv[1] if len(sys.argv)>1 else ''
 if mode in ['backend-image','frontend-image']:return build_component(mode.split('-')[0])
 if mode in ['backend-audit','frontend-audit']:return audit_component(mode.split('-')[0])
 if mode=='audits':
  # Compatibility wrapper: both audits retain a real exit; never stop after the
  # first finding. Independent phase outputs/specs are still required.
  global OUT
  original_out=OUT;results=[]
  original_spec=os.environ.get('PR356_PHASE_SPEC');original_inputs=os.environ.get('PR356_PHASE_INPUTS')
  for component in ['backend','frontend']:
   phase=component+'-audit';OUT=original_out/phase;OUT.mkdir(parents=True,exist_ok=False)
   os.environ['PR356_PHASE_SPEC']=os.environ['PR356_'+component.upper()+'_AUDIT_SPEC']
   os.environ['PR356_PHASE_INPUTS']=os.environ['PR356_'+component.upper()+'_AUDIT_INPUTS']
   results.append(audit_component(component))
  OUT=original_out
  if original_spec is not None:os.environ['PR356_PHASE_SPEC']=original_spec
  if original_inputs is not None:os.environ['PR356_PHASE_INPUTS']=original_inputs
  return 0 if all(x==0 for x in results) else 1
 raise ValueError('Use one independent image/audit phase; DB phases use pr356-database.py. Combined images are unsupported.')
if __name__=='__main__':sys.exit(main())
