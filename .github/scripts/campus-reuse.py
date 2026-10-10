"""Only same-input successful phases from a checksum-verified official PR artifact.
A failed browser phase is never reused. Evidence mismatch fails, never silently
falls back to rerunning a completed check. No local or user-written success flags.
"""
import hashlib,json,os,re,shutil,subprocess,tempfile,zipfile
from datetime import datetime,timezone,timedelta
from pathlib import Path

def verify_receipt(current,previous,receipt,reports,scans):
 assert previous['schema']==current['schema']==1 and previous['route']==current['route']=='campus'
 assert previous['base']==current['base'] and previous['changed']==current['changed']
 assert previous['components']==current['components']==receipt['components']
 assert previous['head']==receipt['head']
 phases={x['name']:x['status'] for x in receipt['phases']}
 for c in current['changed']:
  for stage in [c+'-compile',c+'-runtime', 'frontend-contracts' if c=='frontend' else 'backend-registration-realm-mfa']:
   assert phases.get(stage)=='success',stage
  if c=='backend':assert phases.get('isolated-schema-fixture')=='success'
  report=reports[c];assert report['success'] and report['numFailedTests']==report['numPendingTests']==0 and report['numPassedTests']==report['numTotalTests']>0
  assert report['testResults'] and all(x['assertionResults'] and all(t['status']=='passed' for t in x['assertionResults']) for x in report['testResults'])
  scan=scans[c];assert scan['Trivy']['Version']=='0.70.0' and scan['Metadata']['ImageID']==receipt['images'][c]
  assert not any(v.get('Severity') in ['HIGH','CRITICAL'] and v.get('FixedVersion') for result in scan.get('Results',[]) for v in result.get('Vulnerabilities',[]))
 assert all('@sha256:' in digest for digest in receipt['bases'].values()) and receipt['bases']

def command(*args):return subprocess.check_output(args,text=True).strip()
def api(path):return json.loads(command('gh','api',path))
def run():
 request=json.loads(Path('.github/scripts/campus-reuse-request.json').read_text())
 if not request or str(request['pr'])!=os.environ['CI_PR_NUMBER']:return
 repo=os.environ['GITHUB_REPOSITORY'];assert repo=='caohuibj/eduK12-new-version'
 current=json.loads(Path('campus-plan.json').read_text())
 previous_run=api(f"repos/{repo}/actions/runs/{request['run']}")
 assert any(x['number']==request['pr'] for x in previous_run['pull_requests'])
 assert previous_run['event']=='pull_request' and previous_run['path']=='.github/workflows/ci.yml'
 assert previous_run['head_repository']['full_name']==previous_run['repository']['full_name']==repo
 artifact=api(f"repos/{repo}/actions/artifacts/{request['artifact']}")
 assert not artifact['expired'] and artifact['workflow_run']['id']==request['run']
 assert artifact['name']=='campus-candidate-'+request['head']
 assert re.fullmatch(r'sha256:[a-f0-9]{64}',artifact['digest'])
 assert datetime.now(timezone.utc)-datetime.fromisoformat(artifact['created_at'].replace('Z','+00:00'))<timedelta(hours=3)
 jobs=api(f"repos/{repo}/actions/runs/{request['run']}/jobs?per_page=100")['jobs']
 candidate=next(x for x in jobs if x['name']=='campus / candidate')
 steps={x['name']:x['conclusion'] for x in candidate['steps']}
 for stage in ['freeze and recheck the exact campus plan','compile each changed component once; scoped contracts on isolated PostgreSQL','scan actual runtime images with existing thresholds']:
  assert steps.get(stage)=='success',stage
 subprocess.run(['git','fetch','--no-tags','origin',request['head']],check=True)
 assert command('git','rev-parse',request['head']+'^2')==previous_run['head_sha']
 # All compilation, testing, dependency/config inputs and test commands must match.
 assert subprocess.check_output(['git','show',request['head']+':.github/scripts/campus-candidate.py'])==Path('.github/scripts/campus-candidate.py').read_bytes()
 prior_workflow=command('git','show',request['head']+':.github/workflows/ci-campus.yml')
 now_workflow=Path('.github/workflows/ci-campus.yml').read_text()
 for stage in ['compile each changed component once; scoped contracts on isolated PostgreSQL','scan actual runtime images with existing thresholds']:
  def selected(text):
   block=text.split('      - name: '+stage+'\n')[1].split('\n      - ')[0]
   return block[block.index('        run:'):]
  assert selected(prior_workflow)==selected(now_workflow),stage
 with tempfile.TemporaryDirectory(prefix='campus-official-reuse-') as temp:
  archive=Path(temp)/'artifact.zip'
  with archive.open('wb') as out:subprocess.run(['gh','api','--allow-escape-sequences',f"repos/{repo}/actions/artifacts/{request['artifact']}/zip"],stdout=out,check=True)
  assert hashlib.sha256(archive.read_bytes()).hexdigest()==artifact['digest'].split(':')[1]
  extract=Path(temp)/'extracted';extract.mkdir()
  with zipfile.ZipFile(archive) as bundle:
   for item in bundle.infolist():
    dest=(extract/item.filename).resolve();assert dest.is_relative_to(extract.resolve())
    assert item.external_attr>>16&0o170000!=0o120000
   bundle.extractall(extract)
  previous=json.loads((extract/'campus-plan.json').read_text());assert previous['head']==request['head']
  folder=extract/'campus-evidence';receipt=json.loads((folder/'checks.json').read_text())
  for c,tree in current['components'].items():assert command('git','rev-parse',request['head']+':server-version/'+c)==tree
  reports={c:json.loads((folder/(c+'-tests.json')).read_text()) for c in current['changed']}
  scans={c:json.loads((folder/('scan-'+c+'.json')).read_text()) for c in current['changed']}
  verify_receipt(current,previous,receipt,reports,scans)
  shutil.copytree(folder,'campus-evidence',dirs_exist_ok=True)
  # The browser must create new current-head evidence; never inherit a screenshot success.
  Path('campus-evidence/browser.json').unlink(missing_ok=True)
  reused={'sourceRun':request['run'],'sourceArtifact':request['artifact'],'artifactDigest':artifact['digest'],'sourceHead':previous['head'],'currentHead':current['head'],'components':current['components'],'reused':['compile','campus-contracts','runtime-scans'],'browser':'must execute'}
  Path('campus-evidence/reused-official.json').write_text(json.dumps(reused,indent=2))
 with open(os.environ['GITHUB_OUTPUT'],'a') as out:out.write('reused=true\n')
 print('REUSED verified official campus compile/contracts/runtime scans; browser must execute')
if __name__=='__main__':run()
