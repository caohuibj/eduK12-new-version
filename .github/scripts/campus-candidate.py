"""Source-bound campus qualification; no deployment or unrelated acceptance.
Each component installs/compiles once. Runtime targets consume cached stages.
Unchanged instrument generation hooks are not campus gates: backend tsc consumes
unchanged checked-in manifests. Dockerfiles and dependencies remain unchanged.
"""
import json, os, subprocess, tempfile, time
from pathlib import Path
p=json.loads(Path('campus-plan.json').read_text()); assert p['route']=='campus'
evidence=Path('campus-evidence'); evidence.mkdir(exist_ok=True)
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
backend_tests=['src/__tests__/campus/registration-code.test.ts','src/__tests__/campus/mfa-totp.contract.test.ts','src/__tests__/integration/campusRegistrationCode.postgres.integration.test.ts','src/__tests__/integration/campusAuthRealm.postgres.integration.test.ts','src/__tests__/integration/campusTotp.postgres.integration.test.ts','src/__tests__/integration/campusAdmission.postgres.integration.test.ts','src/__tests__/integration/campusParentPeer.postgres.integration.test.ts','src/__tests__/integration/campusStaffInviteGovernance.postgres.integration.test.ts','src/__tests__/middleware/csrf.test.ts']
frontend_tests=['src/school/'+f for f in ['SchoolMark.test.tsx','SchoolLanding.test.tsx','SchoolParentPortal.test.tsx','SchoolWorkspace.test.tsx','SchoolWorkspaceShell.test.tsx','SchoolEntryMfa.test.tsx']]
with tempfile.TemporaryDirectory(prefix='campus-ci-') as temp:
 for component in p['changed']:
  context='server-version/'+component;tag='eduk12-campus-'+component+':'+p['head'];builder=tag+'-build'
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
    run(['docker','run','-d','--name','campus-ci-postgres','-e','POSTGRES_USER=ptool','-e','POSTGRES_PASSWORD=ptool123','-e','POSTGRES_DB=campus_ci_test','-p','127.0.0.1:5432:5432','postgres:16']);resources.append('campus-ci-postgres')
    run(['docker','run','-d','--name','campus-ci-redis','-p','127.0.0.1:6379:6379','redis:7']);resources.append('campus-ci-redis')
    for attempt in range(30):
     if subprocess.run(['docker','exec','campus-ci-postgres','pg_isready','-U','ptool'],stdout=subprocess.DEVNULL).returncode==0:break
     time.sleep(1)
    else:raise RuntimeError('isolated PostgreSQL readiness timeout')
    db='postgresql://ptool:ptool123@127.0.0.1:5432/campus_ci_test?schema=public'
    env=['CI=true','NODE_ENV=test','DATABASE_URL='+db,'RELEASE_INTEGRATION_DATABASE_URL='+db,'REDIS_URL=redis://127.0.0.1:6379','JWT_SECRET=synthetic-campus-ci-secret-not-production','CAMPUS_ELIGIBILITY_HMAC_KEY='+'12'*32,'CAMPUS_MFA_ENCRYPTION_KEY='+'34'*32]
    docker=['docker','run','--rm','--network','host','-v',str(evidence.resolve())+':/evidence']
    for value in env:docker+=['-e',value]
    phase('isolated-schema-fixture',lambda:run(docker+[builder,'npx','prisma','migrate','deploy'],300))
    cmd='npm audit --audit-level=high && npx vitest run '+' '.join(backend_tests)+' --maxWorkers=2 --reporter=json --outputFile=/evidence/backend-tests.json && node scripts/assert-release-test-report.mjs /evidence/backend-tests.json '+' '.join(backend_tests)
    phase('backend-registration-realm-mfa',lambda:run(docker+[builder,'sh','-ec',cmd],900))
   finally:
    for name in resources:subprocess.run(['docker','rm','-f',name],check=True)
  phase(component+'-runtime',lambda:run(args+['--target','runtime','-t',tag,context]))
  results['images'][component]=output(['docker','image','inspect','--format','{{.Id}}',tag])
  if component=='frontend':
   container=output(['docker','create',tag])
   try:run(['docker','cp',container+':/usr/share/nginx/html',str(evidence/'frontend')])
   finally:run(['docker','rm',container])
(evidence/'checks.json').write_text(json.dumps(results,indent=2))
