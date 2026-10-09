"""Import official immutable Actions package, not caller-written success JSON."""
import argparse,hashlib,json,os,time,urllib.request,zipfile
from pathlib import Path
from evidence import require,digest,inputs
REPO='caohuibj/eduK12-new-version'
def filehash(file):
    h=hashlib.sha256()
    with file.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def api(path):
    headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}
    if os.environ.get('GH_TOKEN'):headers['Authorization']='Bearer '+os.environ['GH_TOKEN']
    with urllib.request.urlopen(urllib.request.Request('https://api.github.com/repos/'+REPO+'/'+path,headers=headers),timeout=15) as r:return json.load(r)
def verify_archive(archive,artifact_id,run_id):
    run=api('actions/runs/'+str(run_id));artifact=api('actions/artifacts/'+str(artifact_id))
    require(run['status']=='completed' and run['conclusion']=='success' and run['path']=='.github/workflows/ci.yml','Unqualified CI run')
    require(run['event']=='pull_request' and run['head_repository']['full_name']==REPO,'Wrong CI origin')
    jobs=api('actions/runs/'+str(run_id)+'/jobs?per_page=100')['jobs']
    selected=[j for j in jobs if j['name'].startswith('scoped-release / ') and j['name'].endswith('/ qualified')]
    require(len(selected)==1 and selected[0]['status']=='completed' and selected[0]['conclusion']=='success','Selected route aggregate missing/non-success')
    require(artifact['workflow_run']['id']==run_id and not artifact['expired'],'Wrong/expired artifact')
    require(artifact['digest']=='sha256:'+filehash(archive),'Official artifact digest mismatch')
    with zipfile.ZipFile(archive) as z:
        require(z.namelist().count('manifest.json')==1 and len(z.namelist())==len(set(z.namelist())),'Missing/duplicate archive entries')
        m=json.loads(z.read('manifest.json'));plan=json.loads(z.read('release-plan.json'))
        require(artifact['name']=='release-components-'+m['head'] and m['run']==str(run_id),'Artifact source/run mismatch')
        require(m['candidateQualified'] is True and m['route'] in ['A','B'] and m['head']==plan['head'],'Candidate not qualified')
        # Actions PR runs report the branch head, while checkout builds its merge
        # commit. Prove exact parents instead of confusing these two SHAs.
        if m['head']!=run['head_sha']:
            commit=api('commits/'+m['head']);require({run['head_sha'],m['base']} <= {p['sha'] for p in commit['parents']},'Unrelated checkout tree')
        require(set(m['artifacts'])==set(plan['changed']),'Missing/unexpected component artifacts')
        scans=json.loads(z.read('release-scans.json'))
        require(set(scans)==set(plan['changed']),'Affected image scan absent')
        for c,a in m['artifacts'].items():
            require(scans[c]['status']=='success' and scans[c]['image']==a['image'],'Scan does not qualify actual image')
            require(a['file']==c+'.tar' and z.namelist().count(a['file'])==1,'Invalid artifact path')
            with z.open(a['file']) as f:
                h=hashlib.sha256()
                for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
            require(h.hexdigest()==a['sha256'],'Image archive changed')
        require(json.loads(z.read('browser/browser.json'))['status']=='success','Actual browser acceptance absent')
        selected=['login-browser'] if plan['route']=='B' else []
        if 'frontend' in plan['changed']:selected.append('frontend-browser')
        for check in selected:
            require(json.loads(z.read('browser/'+check+'.json'))['status']=='success','Affected browser evidence missing: '+check)
        require(json.loads(z.read('executor-rehearsal.json'))['status']=='PASS','Actual rollback rehearsal absent')
        checks=json.loads(z.read('release-checks.json'))['checks']
        for c in plan['changed']:
            require(checks.get(c+'-checks',{}).get('status')=='success' and checks[c+'-checks']['component']==plan['components'][c]['candidate'],'Changed component checks missing/non-success')
    return m,plan

def qualify(plan,config,archive,artifact_id,run_id):
    m,old=verify_archive(archive,artifact_id,run_id)
    require(plan['route'] in ['A','B'] and old['route']==plan['route'],'Route changed')
    require(str(run_id) not in {str(v) for v in config.get('revokedRuns',[])},'Explicitly revoked evidence')
    consumed={'policy','executor','build','scan','browser'}|({'frontendChecks'} if 'frontend' in plan['changed'] else set())|({'backendChecks'} if plan['route']=='B' else set())
    require(all(plan['tools'][k]==old['tools'][k] for k in consumed),'Consumed validation tools changed')
    consumed_components=set(plan['changed'])|({'frontend','backend'} if plan['route']=='B' else set())
    require(all(old['components'][c]['candidate']==plan['components'][c]['candidate'] for c in consumed_components),'Consumed component/dependency/config changed')
    for c in plan['changed']:
        require(old['components'][c]['candidate']==plan['components'][c]['candidate'],'Component/dependency/config changed')
        require(m['artifacts'][c]['component']==plan['components'][c]['candidate'],'Image source mismatch')
    require(old['surfaces']==plan['surfaces'],'Affected acceptance changed')
    images={c:a['image'] for c,a in m['artifacts'].items() if c!='ops'}
    configuration=config['configurationFingerprint']
    records=[];completed=min(v.get('at',m['at']) for v in [m])
    for check in plan['required']:
        require(check not in ['platform-gate','data-recovery-if-affected'],'Heavy route cannot import scoped evidence')
        records.append({'check':check,'status':'success','sourceHead':m['head'],'run':'https://github.com/'+REPO+'/actions/runs/'+str(run_id),'completedAt':completed,'inputs':inputs(plan,check,images,configuration)})
    with zipfile.ZipFile(archive) as z:
        ready=json.loads(z.read('candidate-ready.json')) if 'frontend' in images else config['oldReady']
    return {'head':plan['head'],'environment':'candidate','images':images,'records':records,'ready':ready,'origin':{'artifactId':artifact_id,'runId':run_id,'archiveSha256':filehash(archive)}}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--plan',required=True);p.add_argument('--config',required=True);p.add_argument('--archive',required=True);p.add_argument('--artifact-id',type=int,required=True);p.add_argument('--run-id',type=int,required=True);p.add_argument('--output',required=True);a=p.parse_args()
    receipt=qualify(json.loads(Path(a.plan).read_text()),json.loads(Path(a.config).read_text()),Path(a.archive),a.artifact_id,a.run_id)
    target=Path(a.output)
    with target.open('x') as f:os.chmod(target,0o600);json.dump(receipt,f,indent=2)
    print(json.dumps({'status':'QUALIFIED','head':receipt['head'],'images':receipt['images']}))
