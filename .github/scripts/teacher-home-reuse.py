"""Reuse only verified official CI prerequisites; never a failed browser result."""
import ast,datetime,hashlib,json,os,subprocess,sys,zipfile
from pathlib import Path
EXPECTED=['frontend-compile-once','affected-frontend-checks','frontend-runtime-from-cached-build','backend-compile-once','six-existing-auth-contracts','backend-runtime-from-cached-build']
def matching_components(plan,original):
 return [c for c in ['frontend','backend'] if original['components'][c]==plan['components'][c]]
def fingerprint(text):
 tree=ast.parse(text);items=[]
 for n in ast.walk(tree):
  if isinstance(n,ast.FunctionDef) and n.name in ['run','phase']:items.append(ast.dump(n,include_attributes=False))
  if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ['tests','changed','config','cmd'] for t in n.targets):items.append(ast.dump(n,include_attributes=False))
  if isinstance(n,ast.Call):
   if isinstance(n.func,ast.Attribute) and isinstance(n.func.value,ast.Name) and n.func.value.id=='config' and n.func.attr=='write_text':items.append(ast.dump(n,include_attributes=False))
   if isinstance(n.func,ast.Name) and n.func.id=='phase' and n.args and isinstance(n.args[0],ast.Constant) and n.args[0].value in ['affected-frontend-checks','six-existing-auth-contracts']:items.append(ast.dump(n,include_attributes=False))
 return hashlib.sha256('\n'.join(sorted(items)).encode()).hexdigest()
def prerequisites(original_plan,checks,original,current):
 if checks.get('components')!=plan['components']:return False
 phases=checks.get('phases',[])
 if any(len([p for p in phases if p.get('name')==name and p.get('status')=='success'])!=1 for name in EXPECTED):raise ValueError('missing or ambiguous prerequisite success')
 if fingerprint(original)!=fingerprint(current):raise ValueError('check commands/configuration changed')
 return True
def gh(path,output=None):
 cmd=['gh','api',path]
 if output:
  with Path(output).open('wb') as stream:subprocess.run(cmd,stdout=stream,check=True)
  return
 return json.loads(subprocess.check_output(cmd,text=True))
def git(*args):return subprocess.check_output(['git',*args],text=True).strip()
def record(value):
 Path('teacher-home-reuse.json').write_text(json.dumps(value,indent=2))
 with open(os.environ['GITHUB_OUTPUT'],'a') as stream:
  stream.write('reuse_runtime='+str(value.get('mode')=='runtime').lower()+'\n')
  for c in ['frontend','backend']:stream.write('reuse_'+c+'_runtime='+str(c in value.get('runtimeComponents',[])).lower()+'\n')
def prepare():
 plan=json.loads(Path('teacher-home-plan.json').read_text())
 repo=os.environ['GITHUB_REPOSITORY'];assert repo=='caohuibj/eduK12-new-version'
 branch=os.environ['GITHUB_HEAD_REF'];current=int(os.environ['GITHUB_RUN_ID']);pr=int(os.environ['PR_NUMBER'])
 runs=gh(f'repos/{repo}/actions/workflows/ci.yml/runs?branch={branch}&event=pull_request&per_page=15')['workflow_runs']
 now=datetime.datetime.now(datetime.timezone.utc)
 for run in runs:
  if run['id']==current or run['status']!='completed' or run['conclusion'] not in ['success','failure']:continue
  if run['head_branch']!=branch or run['head_repository']['full_name']!=repo or not any(x['number']==pr for x in run['pull_requests']):continue
  stamp=datetime.datetime.fromisoformat(run['created_at'].replace('Z','+00:00'))
  if (now-stamp).total_seconds()>86400:continue
  artifacts=gh(f"repos/{repo}/actions/runs/{run['id']}/artifacts")['artifacts']
  matches=[a for a in artifacts if a['name'].startswith('teacher-home-') and not a['expired']]
  if len(matches)!=1:continue
  artifact=gh(f"repos/{repo}/actions/artifacts/{matches[0]['id']}")
  assert artifact['workflow_run']['id']==run['id']
  archive=Path('teacher-home-prerequisites.zip')
  gh(f"repos/{repo}/actions/artifacts/{artifact['id']}/zip",archive)
  assert artifact['digest']=='sha256:'+hashlib.sha256(archive.read_bytes()).hexdigest(),'official artifact digest mismatch'
  dest=Path('teacher-home-prerequisites');dest.mkdir(exist_ok=True)
  with zipfile.ZipFile(archive) as package:
   for entry in package.infolist():
    path=Path(entry.filename)
    assert not path.is_absolute() and '..' not in path.parts and (entry.external_attr>>16)&0o170000!=0o120000,'unsafe artifact entry'
   package.extractall(dest)
  original_plan=json.loads((dest/'teacher-home-plan.json').read_text())
  checks=json.loads((dest/'teacher-home-evidence/checks.json').read_text())
  matching=matching_components(plan,original_plan)
  if not matching:continue
  assert original_plan['route']=='teacher-home' and checks['head']==original_plan['head']
  subprocess.run(['git','fetch','--no-tags','origin',original_plan['head']],check=True)
  assert all(git('rev-parse',original_plan['head']+':server-version/'+c)==original_plan['components'][c] for c in plan['changed'])
  assert subprocess.run(['git','merge-base','--is-ancestor',run['head_sha'],original_plan['head']]).returncode==0,'source commit mismatch'
  assert subprocess.run(['git','merge-base','--is-ancestor',run['head_sha'],plan['head']]).returncode==0,'unrelated source commit'
  original=git('show',original_plan['head']+':.github/scripts/teacher-home-candidate.py')
  if not prerequisites(original_plan,checks,original,Path('.github/scripts/teacher-home-candidate.py').read_text()):continue
  jobs=gh(f"repos/{repo}/actions/runs/{run['id']}/jobs?per_page=100")['jobs']
  job=next(j for j in jobs if j['name']=='teacher-home / candidate')
  steps={s['name']:s['conclusion'] for s in job['steps']}
  compiled=steps.get('compile changed components once and run affected contracts')=='success'
  restored=steps.get('verify and restore qualified prerequisites')=='success'
  assert compiled or restored,'source candidate prerequisite preparation did not succeed'
  for c in matching:
   scanner=steps.get('scan the actual '+c+' runtime image at existing thresholds')
   assert steps.get('scan the two actual runtime images at existing thresholds')=='success' or scanner=='success' or (restored and scanner=='skipped'),'source image scan did not qualify'
  report=json.loads((dest/'teacher-home-evidence/auth-tests.json').read_text())
  assert report['success'] and report['numFailedTests']==0 and report['numPendingTests']==0 and report['numTotalTests']>0
  for name in ['login-admission.test.ts','authLibrary.test.ts','auth.test.ts','csrf.test.ts','loginRateLimit.test.ts','authCookies.test.ts']:
   suites=[s for s in report['testResults'] if s['name'].endswith('/'+name)]
   assert len(suites)==1 and suites[0]['assertionResults'] and all(t['status']=='passed' for t in suites[0]['assertionResults'])
  receipt={'schema':1,'mode':'checks-only','runId':run['id'],'artifactId':artifact['id'],'artifactDigest':artifact['digest'],'sourceHead':checks['head'],'head':plan['head'],'components':plan['components'],'checkComponents':matching,'runtimeComponents':[],'checks':checks}
  image=dest/'teacher-home-evidence/runtime-images.tar.zst'
  if image.exists():
   assert checks['imageArchiveSha256']==hashlib.sha256(image.read_bytes()).hexdigest()
   unzip=subprocess.Popen(['zstd','-dc',str(image)],stdout=subprocess.PIPE)
   try:subprocess.run(['docker','load'],stdin=unzip.stdout,check=True)
   finally:unzip.stdout.close()
   assert unzip.wait()==0
   for c in matching:
    source='eduk12-teacher-home-'+c+':'+checks.get('imageSourceHead',checks['head']);target='eduk12-teacher-home-'+c+':'+plan['head']
    assert subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',source],text=True).strip()==checks['images'][c]
    subprocess.run(['docker','tag',source,target],check=True)
   if 'backend' in matching:
    source='eduk12-teacher-home-backend:'+checks.get('imageSourceHead',checks['head'])+'-build';target='eduk12-teacher-home-backend:'+plan['head']+'-build'
    assert subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',source],text=True).strip()==checks['backendBuilder']
    subprocess.run(['docker','tag',source,target],check=True)
   import shutil
   out=Path('teacher-home-evidence');out.mkdir(exist_ok=True)
   for c in matching:
    scan=json.loads((dest/'teacher-home-evidence'/(c+'-scan.json')).read_text())
    assert scan['Metadata']['ImageID']==checks['images'][c],'scan/image mismatch'
    shutil.copy2(dest/'teacher-home-evidence'/(c+'-scan.json'),out/(c+'-scan.json'))
   if 'backend' in matching:shutil.copy2(dest/'teacher-home-evidence/auth-tests.json',out/'auth-tests.json')
   receipt['runtimeComponents']=matching
   receipt['mode']='runtime' if matching==plan['changed'] else 'partial'
   if receipt['mode']=='runtime':
    shutil.copy2(image,out/'runtime-images.tar.zst')
    derived={**checks,'head':plan['head'],'imageSourceHead':checks.get('imageSourceHead',checks['head']),'reusedFrom':{'runId':run['id'],'artifactId':artifact['id'],'sourceHead':checks['head']}}
    (out/'checks.json').write_text(json.dumps(derived,indent=2))
  record(receipt);print('REUSED official prerequisites:',run['id'],receipt['mode']);return
 record({'schema':1,'mode':'none','head':plan['head']});print('No matching official prerequisites')
def self_test():
 example="tests=['auth'];cmd='npx vitest';\ndef run(args,timeout=1):pass\ndef phase(name,fn):pass\nphase('six-existing-auth-contracts',lambda:run([cmd]))\n"
 checks={'components':{'frontend':'a','backend':'b'},'phases':[{'name':n,'status':'success'} for n in EXPECTED]}
 plan={'components':checks['components']}
 assert matching_components(plan,plan)==['frontend','backend']
 assert matching_components({'components':{'frontend':'x','backend':'b'}},plan)==['backend']
 assert matching_components({'components':{'frontend':'x','backend':'y'}},plan)==[]
 assert prerequisites(plan,checks,example,example+'\narchive=1')
 assert not prerequisites({'components':{'frontend':'x','backend':'b'}},checks,example,example)
 for changed in [example.replace('npx vitest','echo success'),example.replace("['auth']","['other']")]:
  try:prerequisites(plan,checks,example,changed)
  except ValueError:pass
  else:raise AssertionError('unmatched tool input admitted')
 for status in ['failure','skipped','cancelled',None]:
  bad=json.loads(json.dumps(checks));bad['phases'][0]['status']=status
  try:prerequisites(plan,bad,example,example)
  except ValueError:pass
  else:raise AssertionError('incomplete prerequisite admitted')
 print('Teacher official prerequisite refusal cases passed')
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:self_test()
 else:prepare()
