"""Bounded PR356 checks. All database traffic is loopback/synthetic; no deployment."""
import os,sys,json,subprocess,tempfile,re,hashlib,tarfile,shutil,uuid
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('PR356_EVIDENCE_DIR',str(ROOT/'pr356-evidence'))).resolve();OUT.mkdir(parents=True,exist_ok=True)
B=json.loads((ROOT/'.github/scripts/pr356-bindings.json').read_text());BACK=ROOT/'server-version/backend'
def receipt(name,value):
 (OUT/(name+'.json')).write_text(json.dumps({'sourceHead':os.environ.get('GITHUB_SHA'),'run':os.environ.get('GITHUB_RUN_ID'),'attempt':os.environ.get('GITHUB_RUN_ATTEMPT'),**value},indent=2)+'\n')
def run(name,args,cwd=ROOT,env=None):
 print(name,flush=True)
 with (OUT/(name+'.log')).open('wb') as f:p=subprocess.run([str(x) for x in args],cwd=cwd,env=env,stdout=f,stderr=subprocess.STDOUT)
 data=(OUT/(name+'.log')).read_bytes();receipt(name,{'command':[str(x) for x in args],'exitCode':p.returncode,'logSHA256':hashlib.sha256(data).hexdigest()})
 if p.returncode:raise RuntimeError(name+' failed; see retained log (not echoed to avoid private synthetic data)')
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
assert_app()
mode=sys.argv[1]
if mode=='database':
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
elif mode=='images':
 for component in ['backend','frontend']:
  context=ROOT/'server-version'/component;tag='pr356-'+component+':'+git('rev-parse','HEAD')
  run('build-'+component,['docker','build','--target','runtime','--build-arg','NPM_REGISTRY=https://registry.npmjs.org','--tag',tag,str(context)])
  inspect=subprocess.check_output(['docker','image','inspect',tag],text=True);(OUT/(component+'-image.json')).write_text(inspect)
  if component=='frontend':
   cid=subprocess.check_output(['docker','create',tag],text=True).strip()
   try:subprocess.run(['docker','cp',cid+':/usr/share/nginx/html',str(OUT/'dist')],check=True)
   finally:subprocess.run(['docker','rm',cid],check=True,stdout=subprocess.DEVNULL)
  # Keep exact qualified bytes for affected-only retries; worker uses backend.
  run('save-'+component,['docker','image','save','--output',OUT/(component+'.tar'),tag])
  with (OUT/(component+'.tar')).open('rb') as archive:archive_sha=hashlib.file_digest(archive,'sha256').hexdigest()
  receipt(component+'-archive',{'tag':tag,'imageId':json.loads(inspect)[0]['Id'],'sha256':archive_sha})
 manifest={'components':B['components'],'head':git('rev-parse','HEAD'),'files':{str(p.relative_to(OUT/'dist')):{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in sorted((OUT/'dist').rglob('*')) if p.is_file()}}
 receipt('frontend-dist',manifest)
elif mode=='audits':
 for component in ['backend','frontend']:run('audit-'+component,['npm','audit','--package-lock-only','--audit-level=high'],ROOT/'server-version'/component)
else:raise ValueError('Unknown mode')
