# Exact same-PR official reuse for the reviewed SAST-only transition.
import datetime,hashlib,json,os,shutil,subprocess,tempfile,urllib.request,urllib.parse,zipfile
from pathlib import Path
RUN=39020370378
BEFORE='f4af583738c65fad0bfcc8917c94cb99d0065791'
AFTER='cffee27bac76e954a8ad97d6c07cec485db804cb'
CONSUMERS=['server-version/backend','server-version/scripts/asset-upload-cleanup','.github/scripts/shared-asset-storage-candidate.py','.github/scripts/shared-asset-storage-bindings.json','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs']
def blob(ref,path):return subprocess.check_output(['git','rev-parse',ref+':'+path],text=True).strip()
def recent(value):
 try:age=datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(value.replace('Z','+00:00'));return datetime.timedelta(0)<=age<datetime.timedelta(hours=24)
 except (ValueError,AttributeError,TypeError):return False
def eligible(run,a,jobs,pr):return run.get('id')==RUN and run.get('event')=='pull_request' and run.get('path')=='.github/workflows/ci.yml' and any(p.get('number')==pr for p in run.get('pull_requests',[])) and a.get('workflow_run',{}).get('id')==RUN and not a.get('expired') and recent(a.get('created_at')) and a.get('name','').startswith('shared-asset-storage-') and any(j.get('name')=='shared-asset-storage / candidate' and j.get('conclusion')=='success' for j in jobs)
def plans_match(a,b):return all(a.get(k)==b.get(k)for k in ['schema','route','base','components','tests','focusedTests','changed','required'])
def safe_entries(infos):return all(not Path(i.filename).is_absolute() and '..'not in Path(i.filename).parts and Path(i.filename).parts and Path(i.filename).parts[0]in ['shared-asset-storage-plan.json','shared-asset-storage-evidence'] and (i.external_attr>>16)&0o170000!=0o120000 for i in infos)
class SafeRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,url):
  p=urllib.parse.urlsplit(url)
  if p.scheme!='https':raise ValueError('NON_TLS_REDIRECT')
  r=super().redirect_request(req,fp,code,msg,headers,url)
  if p.hostname!='api.github.com':r.remove_header('Authorization')
  return r
opener=urllib.request.build_opener(SafeRedirect())
def request(path):return opener.open(urllib.request.Request('https://api.github.com/repos/'+os.environ['GITHUB_REPOSITORY']+path,headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json'}),timeout=60)
def api(path):
 with request(path)as r:return json.load(r)
def main():
 current=json.loads(Path('shared-asset-storage-plan.json').read_text());head=current['head'];workflow='.github/workflows/ci-shared-asset-storage.yml'
 if blob(head,workflow)!=AFTER:raise ValueError('UNREVIEWED_REUSE_WORKFLOW')
 run=api('/actions/runs/'+str(RUN));jobs=api('/actions/runs/'+str(RUN)+'/jobs?per_page=100')['jobs'];artifacts=api('/actions/runs/'+str(RUN)+'/artifacts')['artifacts'];pr=int(os.environ['PR_NUMBER'])
 sources=sorted([a for a in artifacts if eligible(run,a,jobs,pr)],key=lambda a:a['created_at'],reverse=True)
 if not sources:raise ValueError('QUALIFIED_PREREQUISITE_MISSING')
 a=sources[0]
 with tempfile.TemporaryDirectory(prefix='shared-official-reuse-')as tmp:
  tmp=Path(tmp);archive=tmp/'official.zip';h=hashlib.sha256()
  with request('/actions/artifacts/'+str(a['id'])+'/zip')as r,archive.open('wb')as f:
   while chunk:=r.read(1024**2):f.write(chunk);h.update(chunk)
  if a.get('digest')!='sha256:'+h.hexdigest():raise ValueError('OFFICIAL_DIGEST_MISMATCH')
  with zipfile.ZipFile(archive)as z:
   if not safe_entries(z.infolist()):raise ValueError('UNSAFE_OFFICIAL_ENTRY')
   z.extractall(tmp/'original')
  root=tmp/'original';old=json.loads((root/'shared-asset-storage-plan.json').read_text());source=root/'shared-asset-storage-evidence';proof=json.loads((source/'checks.json').read_text())
  if a['name']!='shared-asset-storage-'+old['head'] or proof['head']!=old['head'] or proof['components']!=old['components'] or not plans_match(old,current):raise ValueError('SOURCE_PLAN_MISMATCH')
  subprocess.run(['git','fetch','--no-tags','origin',old['head']],check=True,timeout=60)
  if blob(old['head'],workflow)!=BEFORE or any(blob(old['head'],p)!=blob(head,p)for p in CONSUMERS):raise ValueError('CONSUMING_INPUT_CHANGED')
  expected={'bounded-upload-cleanup-host-contracts','backend-compile','isolated-schema-fixture','backend-security-efficiency-contracts','new-schema-restore','backend-runtime'}
  if {p['name']for p in proof['phases']}!=expected or any(p['status']!='success'for p in proof['phases']):raise ValueError('INCOMPLETE_PHASE_PROOF')
  tests=json.loads((source/'backend-tests.json').read_text())
  if not tests['success'] or tests['numPendingTests'] or not tests['numTotalTests']:raise ValueError('UNQUALIFIED_TEST_REPORT')
  for file in current['tests']:
   suites=[s for s in tests['testResults']if s['name'].endswith(file)]
   if len(suites)!=1 or not suites[0]['assertionResults'] or any(a['status']!='passed'for a in suites[0]['assertionResults']):raise ValueError('FAILED_OR_SKIPPED_SELECTED_TEST')
  scan=json.loads((source/'scan.json').read_text())
  if any(v['Severity']in ['HIGH','CRITICAL']for r in scan.get('Results',[])for v in r.get('Vulnerabilities',[])):raise ValueError('UNQUALIFIED_RUNTIME_SCAN')
  h=hashlib.sha256()
  with (source/'backend-image.tar.zst').open('rb')as f:
   while chunk:=f.read(1024**2):h.update(chunk)
  if h.hexdigest()!=(source/'backend-image.tar.zst.sha256').read_text().split()[0]:raise ValueError('IMAGE_ARCHIVE_CHANGED')
  restore=json.loads((source/'new-schema-restore.json').read_text())
  if restore.get('status')!='PASS' or not restore.get('pendingCleanupRestored') or restore.get('lookupAndPendingIndexes')!=2:raise ValueError('RESTORE_PROOF_MISSING')
  dest=Path('shared-asset-storage-evidence');shutil.copytree(source,dest);(dest/'qualified-original-plan.json').write_text(json.dumps(old,indent=2))
  receipt={'status':'REUSED_QUALIFIED_SAME_INPUT','originalRunId':RUN,'originalArtifactId':a['id'],'originalArtifactDigest':a['digest'],'originalHead':old['head'],'currentHead':head,'allConsumerObjectsEqual':True,'workflowTransition':{'before':BEFORE,'after':AFTER},'rebuilt':False,'retested':False,'rescanned':False}
  (dest/'reuse.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt))
  with open(os.environ['GITHUB_OUTPUT'],'a')as f:f.write('reused=true\n')
if __name__=='__main__':main()
