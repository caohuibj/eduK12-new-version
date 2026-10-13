"""Qualify only this reviewed Teacher patch; cached runtime stages compile once."""
import hashlib,json,subprocess,tempfile,time
from pathlib import Path
plan=json.loads(Path('teacher-home-plan.json').read_text())
assert plan['route']=='teacher-home' and plan['changed']==['frontend','backend']
evidence=Path('teacher-home-evidence');evidence.mkdir(exist_ok=True)
reuse=json.loads(Path('teacher-home-reuse.json').read_text()) if Path('teacher-home-reuse.json').exists() else {'mode':'none'}
results={'head':plan['head'],'components':plan['components'],'phases':[],'images':{},'bases':{}}
reuse_checks=reuse.get('mode')=='checks-only'
if reuse_checks:
 assert reuse['head']==plan['head'] and reuse['components']==plan['components']
 results['reusedFrom']={'runId':reuse['runId'],'artifactId':reuse['artifactId'],'sourceHead':reuse['sourceHead']}
def run(args,timeout=1200):subprocess.run(args,check=True,timeout=timeout)
def output(args):return subprocess.check_output(args,text=True).strip()
def phase(name,fn):
 start=time.monotonic();status='failure'
 try:fn();status='success'
 finally:
  results['phases'].append({'name':name,'status':status,'seconds':round(time.monotonic()-start,2)})
  (evidence/'checks.json').write_text(json.dumps(results,indent=2))
tests=['src/__tests__/controllers/login-admission.test.ts','src/__tests__/controllers/authLibrary.test.ts','src/__tests__/middleware/auth.test.ts','src/__tests__/middleware/csrf.test.ts','src/__tests__/middleware/loginRateLimit.test.ts','src/__tests__/utils/authCookies.test.ts']
with tempfile.TemporaryDirectory(prefix='teacher-home-') as temp:
 for component in plan['changed']:
  context='server-version/'+component;tag='eduk12-teacher-home-'+component+':'+plan['head'];builder=tag+'-build'
  frozen=[]
  for line in Path(context+'/Dockerfile').read_text().splitlines():
   fields=line.split()
   if len(fields)>1 and fields[0].upper()=='FROM' and (':' in fields[1] or '/' in fields[1]):
    image=fields[1]
    if image not in results['bases']:
     source=reuse['checks']['bases'].get(image,image) if reuse_checks else image
     run(['docker','pull',source],300)
     results['bases'][image]=json.loads(output(['docker','image','inspect',source]))[0]['RepoDigests'][0]
    line=line.replace(image,results['bases'][image],1)
   # Checked-in manifests and generation hooks are byte-unchanged by this patch.
   if component=='backend' and line=='RUN npm run build':line='RUN npx tsc'
   frozen.append(line)
  dockerfile=Path(temp)/(component+'.Dockerfile');dockerfile.write_text('\n'.join(frozen)+'\n')
  args=['docker','buildx','build','--load','-f',str(dockerfile),'--label','org.opencontainers.image.revision='+plan['head']]
  if component=='frontend':args+=['--build-arg','VITE_COGNITIVE_MODULE_ENABLED=true']
  phase(component+'-compile-once',lambda:run(args+['--target','build','-t',builder,context]))
  if component=='frontend':
   changed=[e['file'].removeprefix(context+'/') for e in plan['changes'] if e['file'].startswith(context+'/src/') and e['file'].endswith(('.ts','.tsx'))]
   config=Path(temp)/'tsconfig.teacher-home.json'
   config.write_text(json.dumps({'extends':'./tsconfig.app.json','include':changed+['src/vite-env.d.ts'],'references':[]}))
   cmd='npx eslint '+' '.join(changed)+' && npx tsc -p tsconfig.teacher-home.json --noEmit && npm audit --audit-level=high'
   if reuse_checks:
    results['phases'].append({'name':'affected-frontend-checks','status':'success','reusedFrom':reuse['runId']})
    print('REUSED affected-frontend-checks from official run',reuse['runId'])
   else:
    phase('affected-frontend-checks',lambda:run(['docker','run','--rm','-v',str(config)+':/app/tsconfig.teacher-home.json:ro',builder,'sh','-ec',cmd],600))
  else:
   cmd='npm audit --audit-level=high && npx vitest run '+' '.join(tests)+' --maxWorkers=2 --reporter=json --outputFile=/evidence/auth-tests.json && node scripts/assert-release-test-report.mjs /evidence/auth-tests.json '+' '.join(tests)
   if reuse_checks:
    import shutil
    shutil.copy2('teacher-home-prerequisites/teacher-home-evidence/auth-tests.json',evidence/'auth-tests.json')
    results['phases'].append({'name':'six-existing-auth-contracts','status':'success','reusedFrom':reuse['runId']})
    print('REUSED six-existing-auth-contracts from official run',reuse['runId'])
   else:
    phase('six-existing-auth-contracts',lambda:run(['docker','run','--rm','-e','NODE_ENV=test','-e','CI=true','-v',str(evidence.resolve())+':/evidence',builder,'sh','-ec',cmd],600))
  phase(component+'-runtime-from-cached-build',lambda:run(args+['--target','runtime','-t',tag,context]))
  results['images'][component]=output(['docker','image','inspect','--format','{{.Id}}',tag])
results['backendBuilder']=output(['docker','image','inspect','--format','{{.Id}}','eduk12-teacher-home-backend:'+plan['head']+'-build'])
archive=evidence/'runtime-images.tar.zst'
images=['eduk12-teacher-home-'+c+':'+plan['head'] for c in plan['changed']]+['eduk12-teacher-home-backend:'+plan['head']+'-build']
with archive.open('wb') as stream:
 save=subprocess.Popen(['docker','save',*images],stdout=subprocess.PIPE)
 try:subprocess.run(['zstd','-T2','-3'],stdin=save.stdout,stdout=stream,check=True)
 finally:save.stdout.close()
 assert save.wait()==0
results['imageArchiveSha256']=hashlib.sha256(archive.read_bytes()).hexdigest()
(evidence/'checks.json').write_text(json.dumps(results,indent=2))
