import sys,subprocess,os,json,hashlib,datetime,time
from pathlib import Path
root=Path('/workspace/eduK12-new-version');out=Path('/tmp/course-scale-scope-20261031');name,component=sys.argv[1:3]
node='/workspace/eduk12-cloud/tools/node_modules/.bin/node';cwd=root/'server-version'/component
selected='src/__tests__/scale/available-course.test.ts' if component=='backend' else 'src/training/courseAssessments.test.ts'
argv=[node,'node_modules/vitest/vitest.mjs','run',selected,'--reporter=json','--outputFile='+str(out/(name+'.json'))]
if component=='frontend':argv+=['--testNamePattern=uses enrolled course scopes']
if name=='backend-candidate':argv+=['--testNamePattern=returns identical course rows|keeps inaccessible']
inputs=['server-version/backend/src/controllers/scaleController.ts','server-version/backend/src/__tests__/scale/available-course.test.ts','server-version/frontend/src/training/courseAssessments.ts','server-version/frontend/src/training/courseAssessments.test.ts']
for c in ['backend','frontend']:inputs += ['server-version/'+c+'/'+p for p in ['package.json','package-lock.json','vitest.config.ts','tsconfig.json'] if (root/'server-version'/c/p).exists()]
def hashes():return {p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in inputs}
before=hashes();env=os.environ.copy();env['SCALE_COURSE_MEASURE_OUTPUT']=str(out/(name+'.ndjson'))
start=datetime.datetime.now(datetime.timezone.utc).isoformat();timer=time.monotonic()
with (out/(name+'.log')).open('wb') as log:r=subprocess.run(argv,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
d={'kind':'ACTUAL_UNSIGNED_LOCAL_PROCESS_RECORD','name':name,'argv':argv,'cwd':str(cwd),'startedAt':start,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsedSeconds':time.monotonic()-timer,'exitCode':r.returncode,'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=root,text=True).strip(),'sourceAssociation':'Uncommitted source bytes hashed below; HEAD identifies base only, not execution authentication.','node':subprocess.check_output([node,'--version'],text=True).strip(),'before':before,'after':hashes(),'logSHA256':hashlib.sha256((out/(name+'.log')).read_bytes()).hexdigest()}
for ext in ['json','ndjson']:
 p=out/(name+'.'+ext)
 if p.exists():d[ext+'SHA256']=hashlib.sha256(p.read_bytes()).hexdigest()
(out/(name+'-execution.json')).write_text(json.dumps(d,indent=2)+'\n')
print(json.dumps({k:d[k] for k in ['name','exitCode','elapsedSeconds']}));sys.exit(r.returncode)
