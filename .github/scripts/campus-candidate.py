"""Source-bound campus qualification; no deployment or unrelated acceptance.
Each component installs/compiles once. Runtime targets consume cached stages.
Unchanged instrument generation hooks are not campus gates: backend tsc consumes
unchanged checked-in manifests. Dockerfiles and dependencies remain unchanged.
"""
import json, os, subprocess, tempfile, time
from pathlib import Path
backend_repair=os.environ.get('BACKEND_SECURITY_EFFICIENCY_CANDIDATE')=='true'
candidate_name='backend-security-efficiency' if backend_repair else 'campus'
p=json.loads(Path(candidate_name+'-plan.json').read_text()); assert p['route']==candidate_name
if backend_repair:
 assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('CI')=='true'
 assert p['changed']==['backend'] and p['tests'] and p['focusedTests']
evidence=Path(candidate_name+'-evidence'); evidence.mkdir(exist_ok=True)
results={'head':p['head'],'components':p['components'],'phases':[],'images':{},'bases':{}}
def run(args,timeout=1800): subprocess.run(args,check=True,timeout=timeout)
def output(args):return subprocess.check_output(args,text=True).strip()
def phase(name,fn):
 start=time.monotonic()
 try:fn();status='success'
 except Exception:status='failure';raise
 finally:
  results['phases'].append({'name':name,'status':status,'seconds':round(time.monotonic()-start,2)})
  (evidence/'checks.json').write_text(json.dumps(results,indent=2))
backend_tests=['src/__tests__/campus/local-auth-origin.test.ts','src/__tests__/campus/registration-code.test.ts','src/__tests__/campus/mfa-totp.contract.test.ts','src/__tests__/integration/campusRegistrationCode.postgres.integration.test.ts','src/__tests__/integration/campusAuthRealm.postgres.integration.test.ts','src/__tests__/integration/campusTotp.postgres.integration.test.ts','src/__tests__/integration/campusAdmission.postgres.integration.test.ts','src/__tests__/integration/campusParentPeer.postgres.integration.test.ts','src/__tests__/integration/campusStaffInviteGovernance.postgres.integration.test.ts','src/__tests__/middleware/csrf.test.ts']
if backend_repair: backend_tests=p['tests']
frontend_tests=['src/school/'+f for f in ['SchoolMark.test.tsx','SchoolLanding.test.tsx','SchoolParentPortal.test.tsx','SchoolWorkspace.test.tsx','SchoolWorkspaceShell.test.tsx','SchoolEntryMfa.test.tsx']]
with tempfile.TemporaryDirectory(prefix='campus-ci-') as temp:
 for component in p['changed']:
  context='server-version/'+component;tag='eduk12-'+candidate_name+'-'+component+':'+p['head'];builder=tag+'-build'
  frozen=[]
  for line in Path(context+'/Dockerfile').read_text().splitlines():
   fields=line.split()
   if len(fields)>1 and fields[0].upper()=='FROM' and (':' in fields[1] or '/' in fields[1]):
    image=fields[1]
    if image not in results['bases']:
     run(['docker','pull',image],600)
     results['bases'][image]=json.loads(output(['docker','image','inspect',image]))[0]['RepoDigests'][0]
    line=line.replace(image,results['bases'][image],1)
   if component=='backend' and line=='RUN npm run build':line='RUN npx tsc'
   frozen.append(line)
  dockerfile=Path(temp)/(component+'.Dockerfile');dockerfile.write_text('\n'.join(frozen)+'\n')
  args=['docker','buildx','build','--load','-f',str(dockerfile),'--label','org.opencontainers.image.revision='+p['head']]
  args+=['--build-arg','VITE_COGNITIVE_MODULE_ENABLED=true'] if component=='frontend' else ['--build-arg','DEBIAN_MIRROR=mirrors.tuna.tsinghua.edu.cn']
  phase(component+'-compile',lambda:run(args+['--target','build','-t',builder,context]))
  if component=='frontend':
   changed=[e['file'].removeprefix(context+'/') for e in p['changes'] if e['file'].startswith(context+'/') and e['file'].endswith(('.ts','.tsx'))]
   config=Path(temp)/'tsconfig.campus.json';config.write_text(json.dumps({'extends':'./tsconfig.app.json','include':['src/school/SchoolApp.tsx','src/vite-env.d.ts','src/test/setup.ts']+frontend_tests,'references':[]}))
   cmd='npx eslint '+' '.join(changed)+' && npx tsc -p tsconfig.campus.json --noEmit && npm audit --audit-level=high && npx vitest run '+' '.join(frontend_tests)+' --maxWorkers=2 --reporter=json --outputFile=/evidence/frontend-tests.json'
   phase('frontend-contracts',lambda:run(['docker','run','--rm','-v',str(evidence.resolve())+':/evidence','-v',str(config)+':/app/tsconfig.campus.json:ro',builder,'sh','-ec',cmd],900))
   report=json.loads((evidence/'frontend-tests.json').read_text());assert report['success'] and report['numPendingTests']==0 and report['numTotalTests']>0
   for test in frontend_tests:
    suite=next(x for x in report['testResults'] if x['name'].endswith(test));assert suite['assertionResults'] and all(x['status']=='passed' for x in suite['assertionResults'])
  else:
   resources=[]
   try:
    postgres_image='postgres:16.15-bookworm' if backend_repair else 'postgres:16'
    redis_image='redis:7.4.11-bookworm' if backend_repair else 'redis:7'
    run(['docker','run','-d','--name','campus-ci-postgres','-e','POSTGRES_USER=ptool','-e','POSTGRES_PASSWORD=ptool123','-e','POSTGRES_DB=campus_ci_test','-p','127.0.0.1:5432:5432',postgres_image]);resources.append('campus-ci-postgres')
    run(['docker','run','-d','--name','campus-ci-redis','-p','127.0.0.1:6379:6379',redis_image]);resources.append('campus-ci-redis')
    for attempt in range(30):
     if subprocess.run(['docker','exec','campus-ci-postgres','pg_isready','-U','ptool'],stdout=subprocess.DEVNULL).returncode==0:break
     time.sleep(1)
    else:raise RuntimeError('isolated PostgreSQL readiness timeout')
    db='postgresql://ptool:ptool123@127.0.0.1:5432/campus_ci_test?schema=public'
    env=['CI=true','NODE_ENV=test','DATABASE_URL='+db,'RELEASE_INTEGRATION_DATABASE_URL='+db,'REDIS_URL=redis://127.0.0.1:6379','JWT_SECRET=synthetic-campus-ci-secret-not-production','CAMPUS_ELIGIBILITY_HMAC_KEY='+'12'*32,'CAMPUS_MFA_ENCRYPTION_KEY='+'34'*32]
    if backend_repair:
     env+=['ASSET_SIGNING_SECRET=synthetic-backend-ci-assets-not-production-20261013','DATA_ENCRYPTION_KEY='+'55'*32,'DATA_PSEUDONYM_KEY='+'56'*32,'SURVEY_MFA_ENCRYPTION_KEY='+'45'*32,'ASSET_MIGRATION_COMPLETE=true','UPLOAD_DIR=/tmp/backend-security-efficiency-uploads','PR26_INTEGRATION_DATABASE_URL='+db,'COGNITIVE_INTEGRATION_DB_URL='+db,'POW_INTEGRATION_REDIS_URL=redis://127.0.0.1:6379/15']
    docker=['docker','run','--rm','--network','host','-v',str(evidence.resolve())+':/evidence']
    for value in env:docker+=['-e',value]
    phase('isolated-schema-fixture',lambda:run(docker+[builder,'npx','prisma','migrate','deploy'],300))
    parallelism='--no-file-parallelism' if backend_repair else '--maxWorkers=2'
    cmd='npm audit --audit-level=high && npx vitest run '+' '.join(backend_tests)+' '+parallelism+' --reporter=json --outputFile=/evidence/backend-tests.json && node scripts/assert-release-test-report.mjs /evidence/backend-tests.json '+' '.join(backend_tests)
    def backend_contracts():
     run(docker+[builder,'sh','-ec',cmd],900)
     if backend_repair:
      report=json.loads((evidence/'backend-tests.json').read_text())
      assert report['success'] and report['numPendingTests']==0 and report['numTotalTests']>0
      for test in backend_tests:
       suites=[s for s in report['testResults'] if s['name'].endswith(test)]
       assert len(suites)==1 and suites[0]['assertionResults']
       assert all(t['status']=='passed' for t in suites[0]['assertionResults']), 'required backend contract skipped or failed'
    phase('backend-security-efficiency-contracts' if backend_repair else 'backend-registration-realm-mfa',backend_contracts)
    if backend_repair:
     for index,selected in enumerate(p['focusedTests']):
      def focused():
       report='focused-tests-'+str(index)+'.json'
       run(docker+[builder,'npx','vitest','run',selected['file'],'-t',selected['title'],'--no-file-parallelism','--reporter=json','--outputFile=/evidence/'+report],300)
       data=json.loads((evidence/report).read_text())
       suites=[s for s in data['testResults'] if s['name'].endswith(selected['file'])]
       assert len(suites)==1 and data['success']
       targets=[t for t in suites[0]['assertionResults'] if t['title']==selected['title']]
       assert len(targets)==1 and targets[0]['status']=='passed', 'required focused contract skipped or missing'
      phase('backend-focused-'+str(index),focused)
   finally:
    for name in resources:subprocess.run(['docker','rm','-f']+(['-v'] if backend_repair else [])+[name],check=True)
  phase(component+'-runtime',lambda:run(args+['--target','runtime','-t',tag,context]))
  results['images'][component]=output(['docker','image','inspect','--format','{{.Id}}',tag])
  if component=='frontend':
   container=output(['docker','create',tag])
   try:run(['docker','cp',container+':/usr/share/nginx/html',str(evidence/'frontend')])
   finally:run(['docker','rm',container])
(evidence/'checks.json').write_text(json.dumps(results,indent=2))
