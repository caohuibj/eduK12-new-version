import sys,subprocess,os,json,hashlib,datetime,time
from pathlib import Path
root=Path('/workspace/eduK12-new-version');out=Path('/tmp/cognitive-course-scope-20261031');name,component=sys.argv[1:3]
node='/workspace/eduk12-cloud/tools/node_modules/.bin/node';cwd=root/'server-version'/component
files=['src/__tests__/cognitive/assignment-course-scope.test.ts'] if component=='backend' else ['src/training/courseAssessments.test.ts','src/modules/cognitive/__tests__/api.test.ts']
argv=[node,'node_modules/vitest/vitest.mjs','run',*files,'--reporter=json','--outputFile='+str(out/(name+'.json'))]
if component=='frontend':argv+=['--testNamePattern=uses enrolled course scopes|GET /cognitive/assignments/my$']
if name=='backend-candidate':argv+=['--testNamePattern=narrows memberships|retains closed-admission|does not read assignments']
inputs=['server-version/'+p for p in ['backend/src/modules/cognitive/assignment.service.ts','backend/src/modules/cognitive/cognitive.controller.ts','backend/src/__tests__/cognitive/assignment-course-scope.test.ts','frontend/src/modules/cognitive/api.ts','frontend/src/modules/cognitive/__tests__/api.test.ts','frontend/src/training/courseAssessments.ts','frontend/src/training/courseAssessments.test.ts']]
for c in ['backend','frontend']:inputs+=['server-version/'+c+'/'+p for p in ['package.json','package-lock.json','vitest.config.ts','vite.config.ts','tsconfig.json'] if (root/'server-version'/c/p).exists()]
def hashes():return {p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in inputs}
before=hashes();env=os.environ.copy();env['COGNITIVE_COURSE_MEASURE_OUTPUT']=str(out/(name+'.ndjson'));start=datetime.datetime.now(datetime.timezone.utc).isoformat();timer=time.monotonic()
with (out/(name+'.log')).open('wb') as log:r=subprocess.run(argv,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
d={'kind':'ACTUAL_UNSIGNED_LOCAL_PROCESS_RECORD','name':name,'argv':argv,'cwd':str(cwd),'startedAt':start,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsedSeconds':time.monotonic()-timer,'exitCode':r.returncode,'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=root,text=True).strip(),'sourceAssociation':'Uncommitted source bytes hashed below; HEAD identifies base only, not execution authentication.','node':subprocess.check_output([node,'--version'],text=True).strip(),'before':before,'after':hashes(),'logSHA256':hashlib.sha256((out/(name+'.log')).read_bytes()).hexdigest()}
for ext in ['json','ndjson']:
 p=out/(name+'.'+ext)
 if p.exists():d[ext+'SHA256']=hashlib.sha256(p.read_bytes()).hexdigest()
(out/(name+'-execution.json')).write_text(json.dumps(d,indent=2)+'\n');print(json.dumps({k:d[k] for k in ['name','exitCode','elapsedSeconds']}));sys.exit(r.returncode)
