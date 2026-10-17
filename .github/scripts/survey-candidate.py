"""Exact-input Survey qualification on disposable GitHub services; never deploys.
Build each changed component once, preserve phase evidence and immutable runtimes.
Commands and image identities are recorded without credentials or user data.
"""
import hashlib,json,os,shlex,subprocess,sys,tempfile,time,urllib.request
from pathlib import Path
ROOT=Path.cwd(); E=ROOT/'survey-candidate-evidence'; E.mkdir(exist_ok=True)
P=json.loads((ROOT/'survey-candidate-plan.json').read_text())
assert P['route']=='survey-candidate' and os.environ.get('CI')=='true' and os.environ.get('GITHUB_ACTIONS')=='true'
STATE=E/'checks.json'
C=json.loads(STATE.read_text()) if STATE.exists() else {'head':P['head'],'sourceHead':os.environ['SURVEY_SOURCE_HEAD'],'tree':P['tree'],'components':P['components'],'phases':[],'images':{},'builders':{},'bases':{},'scope':'Synthetic isolated Survey only; no deployment, public external data or physical timing certification'}
assert C['head']==P['head'] and C['components']==P['components']
TMP=ROOT/'survey-candidate-private';TMP.mkdir(mode=0o700,exist_ok=True)
DB='postgresql://ptool:ptool123@127.0.0.1:5432/survey_candidate_ci_test?schema=public'
RDB='postgresql://survey_ci_runtime:survey-ci-only-runtime@127.0.0.1:5432/survey_candidate_ci_test?schema=public'
ENV={'CI':'true','GITHUB_ACTIONS':'true','NODE_ENV':'test','DATABASE_URL':DB,'DATABASE_URL_ADMIN':DB,'DATABASE_URL_RUNTIME':RDB,'RELEASE_INTEGRATION_DATABASE_URL':DB,'PR26_INTEGRATION_DATABASE_URL':DB,'COGNITIVE_INTEGRATION_DB_URL':DB,'REPORT_OUTBOX_INTEGRATION_DATABASE_URL':DB,'REDIS_URL':'redis://127.0.0.1:6379','JWT_SECRET':'synthetic-survey-ci-jwt-secret-not-production','DATA_ENCRYPTION_KEY':'55'*32,'DATA_PSEUDONYM_KEY':'56'*32,'SURVEY_MFA_ENCRYPTION_KEY':'45'*32,'ASSET_SIGNING_SECRET':'synthetic-survey-ci-assets-not-production','SURVEY_WORKSPACE_ENABLED':'true','SURVEY_PUBLICATION_ENABLED':'true','SURVEY_ANALYTICS_ENABLED':'true','COGNITIVE_MODULE_ENABLED':'true','BACKGROUND_WORKERS_ENABLED':'false','ASSET_MIGRATION_COMPLETE':'true','SURVEY_CI_ISOLATED':'1','SURVEY_CI_SOURCE_SHA':P['head']}
def save():STATE.write_text(json.dumps(C,indent=2)+'\n')
def run(args,timeout=1200,**kwargs):
 # Commands are fingerprinted, never copied with synthetic authentication values.
 C.setdefault('commands',[]).append({'executable':args[0],'sha256':hashlib.sha256(json.dumps(args,separators=(',',':')).encode()).hexdigest(),'environmentSha256':hashlib.sha256(json.dumps({**ENV,**{k:v for k,v in kwargs.get('env',{}).items() if k in ENV}},sort_keys=True).encode()).hexdigest()});save()
 return subprocess.run(args,check=True,timeout=timeout,**kwargs)
def out(args,timeout=120):return subprocess.check_output(args,text=True,timeout=timeout).strip()
def phase(name,fn):
 assert name not in [p['name'] for p in C['phases']], 'A completed phase cannot silently repeat'
 start=time.monotonic();record={'name':name,'status':'running'};C['phases'].append(record);save()
 try:fn();record['status']='success'
 except BaseException as error:record['status']='failure';record['errorType']=type(error).__name__;raise
 finally:record['seconds']=round(time.monotonic()-start,3);save()
def tag(component,builder=False):return 'eduk12-survey-candidate-'+component+':'+P['head']+('-build' if builder else '')
def docker_env(overrides=None):
 env={**ENV,**(overrides or {})};cmd=['docker','run','--rm','--network','host','-v',str(E)+':/evidence']
 for k,v in env.items():cmd+=['-e',k+'='+str(v)]
 return cmd
def report(file,selected):
 d=json.loads((E/file).read_text());assert d.get('success') and d.get('numTotalTests',0)>0 and d.get('numFailedTests',0)==0 and d.get('numPendingTests',0)==0
 for f in selected:
  matches=[s for s in d.get('testResults',[]) if s.get('name','').endswith(f)]
  assert len(matches)==1 and matches[0].get('assertionResults') and all(a['status']=='passed' for a in matches[0]['assertionResults']),f+' missing, skipped or failed'
def archive_image(component,builder):
 suffix='-builder' if builder else ''
 archive=E/(component+suffix+'-image.tar.zst')
 def emit():
  a=subprocess.Popen(['docker','save',tag(component,builder)],stdout=subprocess.PIPE)
  try:run(['zstd','-T2','-3','-o',str(archive)],stdin=a.stdout,timeout=600);assert a.wait()==0
  finally:
   if a.poll() is None:a.kill()
  (E/(archive.name+'.sha256')).write_text(out(['sha256sum',str(archive)]).split()[0]+'  '+archive.name+'\n')
 phase(component+suffix+'-archive',emit)
def build():
 C['executionInputs']={'node':out(['node','--version']),'docker':out(['docker','version','--format','{{.Client.Version}}']),'runnerOS':os.environ.get('RUNNER_OS'),'scripts':{str(f):out(['git','hash-object',str(f)]) for f in sorted((ROOT/'.github/scripts').glob('survey-candidate*')) if f.is_file()},'workflow':out(['git','hash-object','.github/workflows/ci-survey-candidate.yml']),'environmentSha256':hashlib.sha256(json.dumps(ENV,sort_keys=True).encode()).hexdigest()};save()
 for component in ['backend','frontend']:
  context=ROOT/'server-version'/component;lines=[]
  for line in (context/'Dockerfile').read_text().splitlines():
   fields=line.split()
   if len(fields)>1 and fields[0].upper()=='FROM' and (':' in fields[1] or '/' in fields[1]):
    image=fields[1]
    if image not in C['bases']:
     run(['docker','pull',image],600);C['bases'][image]=json.loads(out(['docker','image','inspect',image]))[0]['RepoDigests'][0];save()
    line=line.replace(image,C['bases'][image],1)
   # Unchanged generated scientific catalogs remain the checked-in build input.
   # The changed Survey code and all actual TypeScript consumers compile once.
   if component=='backend' and line=='RUN npm run build':line='RUN npx tsc'
   lines.append(line)
  df=TMP/(component+'.Dockerfile');df.write_text('\n'.join(lines)+'\n')
  C.setdefault('effectiveDockerfiles',{})[component]=hashlib.sha256(df.read_bytes()).hexdigest();save()
  args=['docker','buildx','build','--load','-f',str(df),'--label','org.opencontainers.image.revision='+P['head'],'--build-arg','NPM_REGISTRY=https://registry.npmjs.org']
  if component=='backend':args+=['--build-arg','DEBIAN_MIRROR=deb.debian.org']
  else:args+=['--build-arg','VITE_COGNITIVE_MODULE_ENABLED=true']
  phase(component+'-compile',lambda:run(args+['--target','build','-t',tag(component,True),str(context)],1800))
  C['builders'][component]=out(['docker','image','inspect','--format','{{.Id}}',tag(component,True)]);save()
  archive_image(component,True)
  if component=='frontend':
   changed=[e['file'].removeprefix('server-version/frontend/') for e in P['changes'] if e['file'].startswith('server-version/frontend/src/') and e['file'].endswith(('.ts','.tsx'))]
   cmd='npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.cognitive.json --noEmit && npx eslint '+shlex.join(changed)
   phase('frontend-changed-types-lint',lambda:run(docker_env()+[tag(component,True),'sh','-ec',cmd],600))
  phase(component+'-dependency-audit',lambda:run(docker_env()+[tag(component,True),'npm','audit','--audit-level=high'],300))
  phase(component+'-runtime',lambda:run(args+['--target','runtime','-t',tag(component),str(context)],900))
  C['images'][component]=out(['docker','image','inspect','--format','{{.Id}}',tag(component)]);save()
  archive_image(component,False)

def services():
 run(['docker','run','-d','--name','survey-ci-postgres','-e','POSTGRES_USER=ptool','-e','POSTGRES_PASSWORD=ptool123','-e','POSTGRES_DB=survey_candidate_ci_test','-p','127.0.0.1:5432:5432','postgres:16.15-bookworm'],180)
 run(['docker','run','-d','--name','survey-ci-redis','-p','127.0.0.1:6379:6379','redis:7.4.11-bookworm'],180)
 for _ in range(60):
  if subprocess.run(['docker','exec','survey-ci-postgres','pg_isready','-U','ptool'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0 and subprocess.run(['docker','exec','survey-ci-redis','redis-cli','ping'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
  time.sleep(1)
 else:raise RuntimeError('Isolated service readiness timeout')
 C['services']={n:out(['docker','inspect','--format','{{.Image}}',n]) for n in ['survey-ci-postgres','survey-ci-redis']};save()
 phase('integrated-migration',lambda:run(docker_env()+[tag('backend',True),'npx','prisma','migrate','deploy'],300))
 env={**os.environ,**ENV,'SURVEY_CI_IMAGE_ID':C['builders']['backend']}
 phase('restricted-runtime-bootstrap',lambda:run(['python3','-B','.github/scripts/survey-candidate-recovery.py','bootstrap',tag('backend',True),str(E)],300,env=env))
def backend_tests():
 selected=P['backendTests'];cmd='npx vitest run '+shlex.join(selected)+' --no-file-parallelism --reporter=json --outputFile=/evidence/backend-tests.json'
 def check():run(docker_env()+[tag('backend',True),'sh','-ec',cmd],900);report('backend-tests.json',selected)
 phase('selected-backend-contracts',check)
def frontend_tests():
 selected=P['frontendTests'];cmd='npx vitest run '+shlex.join(selected)+' --maxWorkers=2 --reporter=json --outputFile=/evidence/frontend-tests.json'
 def check():run(docker_env()+[tag('frontend',True),'sh','-ec',cmd],900);report('frontend-tests.json',selected)
 phase('selected-frontend-contracts',check)
def runtime():
 env={**ENV,'SURVEY_CI_IMAGE_ID':C['builders']['backend']}
 phase('production-redis-runtime',lambda:run(docker_env(env)+['-v',str(ROOT/'.github/scripts/survey-candidate-runtime.cjs')+':/probe.cjs:ro',tag('backend',True),'node','/probe.cjs'],300))
 phase('legacy-upgrade-new-schema-restore',lambda:run(['python3','-B','.github/scripts/survey-candidate-recovery.py','verify',tag('backend',True),str(E)],600,env={**os.environ,**env}))
def browser():
 # CA trust is confined to this explicitly approved disposable browser HOME.
 assert os.environ.get('SURVEY_CI_EPHEMERAL_CA_APPROVED')=='true','Ephemeral browser-CA permission missing'
 private=TMP/'browser';private.mkdir(mode=0o700,exist_ok=True)
 run(['sudo','tee','-a','/etc/hosts'],30,input='\n127.0.0.1 survey.eduk12.top training.eduk12.top\n',text=True,stdout=subprocess.DEVNULL)
 cert=private/'tls';cert.mkdir(mode=0o700,exist_ok=True)
 run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',str(cert/'ca.key'),'-out',str(cert/'ca.crt'),'-subj','/CN=Survey isolated CI only'],30,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 run(['openssl','req','-newkey','rsa:2048','-nodes','-keyout',str(cert/'site.key'),'-out',str(cert/'site.csr'),'-subj','/CN=survey.eduk12.top'],30,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 (cert/'ext.cnf').write_text('subjectAltName=DNS:survey.eduk12.top,DNS:training.eduk12.top\n')
 run(['openssl','x509','-req','-in',str(cert/'site.csr'),'-CA',str(cert/'ca.crt'),'-CAkey',str(cert/'ca.key'),'-CAcreateserial','-out',str(cert/'site.crt'),'-days','1','-extfile',str(cert/'ext.cnf')],30,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 home=private/'home';nss=home/'.pki/nssdb';nss.mkdir(parents=True)
 run(['certutil','-N','-d','sql:'+str(nss),'--empty-password'],30)
 run(['certutil','-A','-n','survey-isolated-ci','-t','C,,','-i',str(cert/'ca.crt'),'-d','sql:'+str(nss)],30)
 env={**ENV,'NODE_ENV':'production','DATABASE_URL':RDB,'PORT':'3000','COOKIE_SECURE':'true','CORS_ORIGIN':'https://training.eduk12.top','TRUST_PROXY_HOPS':'1','RUNTIME_ROLE_REQUIRED':'true','SOCKET_REDIS_REQUIRED':'true','LOG_LEVEL':'warn'}
 cmd=['docker','run','-d','--name','survey-ci-api','--network','host']
 for k,v in env.items():cmd+=['-e',k+'='+v]
 run(cmd+[tag('backend')],60)
 for _ in range(60):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3000/ready',timeout=2)as r:
    if r.status==200:break
  except Exception:pass
  time.sleep(1)
 else:raise RuntimeError('Real candidate API not ready')
 # Same immutable frontend bytes/security headers; only isolated ingress routing/TLS differs.
 nginx=(ROOT/'server-version/frontend/nginx.conf').read_text().replace('server backend:3000 resolve;','server 127.0.0.1:3000;').replace('listen 80;','listen 3189 ssl;\n    ssl_certificate /ci-tls/site.crt;\n    ssl_certificate_key /ci-tls/site.key;')
 nginx=nginx.replace('proxy_set_header Host $host;', 'proxy_set_header Host $host;\n        proxy_set_header Origin https://$host;')
 config=private/'nginx.conf';config.write_text(nginx)
 run(['docker','run','-d','--name','survey-ci-web','--network','host','-v',str(config)+':/etc/nginx/conf.d/default.conf:ro','-v',str(cert)+':/ci-tls:ro',tag('frontend')],60)
 fixture=private/'fixture.json'
 seedenv={**ENV,'SURVEY_CANDIDATE_ISOLATED':'1','SURVEY_CANDIDATE_FIXTURE':'/private/fixture.json','SURVEY_CANDIDATE_SURVEY_URL':'https://survey.eduk12.top:3189','SURVEY_CANDIDATE_ADMIN_URL':'https://training.eduk12.top:3189'}
 run(docker_env(seedenv)+['--user',str(os.getuid())+':'+str(os.getgid()),'-v',str(private)+':/private','-v',str(ROOT/'server-version/backend/scripts/survey-candidate-fixture.ts')+':/probe.ts:ro',tag('backend',True),'node','--experimental-strip-types','/probe.ts'],120)
 os.chmod(fixture,0o600)
 executable=out(['node','-e',"console.log(require('./.github/release-tools/node_modules/playwright-core').chromium.executablePath())"]);assert Path(executable).is_file()
 browserenv={**os.environ,'HOME':str(home),'BROWSER_EXECUTABLE':executable,'SURVEY_CANDIDATE_ISOLATED':'1','SURVEY_CANDIDATE_FIXTURE':str(fixture),'SURVEY_CANDIDATE_OUTPUT':str(E/'browser'),'SURVEY_CI_SOURCE_SHA':P['head'],'SURVEY_CI_FRONTEND_IMAGE_ID':C['images']['frontend'],'SURVEY_CI_BACKEND_IMAGE_ID':C['images']['backend']}
 phase('three-role-real-browser',lambda:run(['node','server-version/e2e/survey-candidate-browser.cjs'],600,env=browserenv))
 C['browserTransport']={'kind':'loopback HTTPS with ephemeral independent NSS trust','productionTLSClaim':False,'originMapping':'test ingress rewrites canonical HTTPS Origin; production origin contracts are separate'};save()
def cleanup():
 errors=[]
 try:
  for name in ['survey-ci-web','survey-ci-api']:
   try:
    p=subprocess.run(['docker','logs','--tail','150',name],capture_output=True,text=True)
    if p.returncode==0:(E/(name+'.log')).write_text(p.stdout+p.stderr)
   except Exception as error:C.setdefault('cleanupLogErrors',[]).append({'resource':name,'errorType':type(error).__name__})
  for name in ['survey-ci-web','survey-ci-api','survey-ci-redis','survey-ci-postgres']:
   try:
    if subprocess.run(['docker','inspect',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:run(['docker','rm','-f','-v',name],60)
   except Exception as error:errors.append({'resource':name,'errorType':type(error).__name__})
 finally:
  if TMP.exists():
   import shutil;shutil.rmtree(TMP)
  C['privateBrowserMaterialRemoved']=not TMP.exists();C['isolatedResourcesRemoved']=not errors;C['cleanupErrors']=errors;save()
 if errors:raise RuntimeError('Isolated container cleanup failed; private browser material removed')
if __name__=='__main__':
 action=sys.argv[1];assert action in ['build','services','backend-tests','frontend-tests','runtime','browser','cleanup']
 {'build':build,'services':services,'backend-tests':backend_tests,'frontend-tests':frontend_tests,'runtime':runtime,'browser':browser,'cleanup':cleanup}[action]()
