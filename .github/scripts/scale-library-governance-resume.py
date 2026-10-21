"""One fixed failed-run continuation: original frontend image bytes, not a rebuild."""
import hashlib, importlib.util, json, os, subprocess, sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('original',Path(__file__).with_name('scale-authoring-reuse.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
SOURCE='88bf456d09bab16f2823fe7cb4229176784bc559'
CHECKOUT='f41811053761c25709f98d74f0abed7eb1c61711'
RUN=39605768918
FIXES=['server-version/frontend/src/pages/__tests__/ScaleEdit.readonly.test.tsx','server-version/frontend/src/components/scale-governance/TrainingScaleLibrarySubmission.test.tsx','server-version/frontend/src/survey/SurveyPublicApp.final.test.tsx']
IMAGES={'builder':'sha256:c51dfefdafa3f3d4cd7a174cba9fb89c89002cd66ebac483852785e98c51393e','runtime':'sha256:79b7d91cc9ca1cc3e61f878dafed83855209593a37a12bcb39ce9e7972b6ac7c'}
ARCHIVE='576d5e2d7d606ef4a0c8802bb70de5cc1ff6d9266a7bf6ea98ce34aeb82df2a5'
r.RUN,r.SOURCE=RUN,SOURCE
r.ARTIFACTS.update({'governanceImages':(12348043942,'scale-library-governance-frontend-images-'+CHECKOUT,395539423,'0c95d1333162e027de1bcf55a7322d0be4ec16b410c49cdd1deaa132deea3ba4'),'governanceReports':(12348317798,'scale-library-governance-frontend-reports-'+CHECKOUT,28259,'3673802251a1975c399dd0d632ba4867a07f0b2066cb772f5fc4731010e03dfb')})
def git(*args):return subprocess.check_output(['git',*args],text=True).strip()
def closure():
    assert sorted(git('diff','--name-only',SOURCE,'HEAD','--','server-version/frontend').splitlines())==sorted(FIXES),'Frontend production/config/lock drift: stop, do not rebuild silently'
    for path in ['.github/scripts/scale-library-governance-build.sh','.github/scripts/scale-authoring-reuse.py','server-version/cognitive-randomization-golden-v1.json','server-version/backend/src/modules/cognitive/generated/identities.json']:
        assert subprocess.check_output(['git','show',SOURCE+':'+path])==Path(path).read_bytes(),'Original build/download executor drift'
    old=git('show',SOURCE+':.github/workflows/ci-scale-library-governance.yml');current=Path('.github/workflows/ci-scale-library-governance.yml').read_text()
    env=lambda text:text.split('\nenv:\n',1)[1].split('\njobs:\n',1)[0]
    assert env(old)==env(current),'Registry/timezone environment drift'
    assert "node-version: '24.21.0'" in current and 'runs-on: ubuntu-24.04' in current
    assert os.environ['NPM_CONFIG_REGISTRY']=='https://registry.npmjs.org' and os.environ['NPM_CONFIG_REPLACE_REGISTRY_HOST']=='always'
def official(kind,read=r.api):
    run=read('runs/'+str(RUN));assert run['id']==RUN and run['head_sha']==SOURCE and run['run_attempt']==1 and run['status']=='completed' and run['conclusion']=='failure'
    job=read('jobs/'+str(119241598178 if kind=='frontend' else 119241597740))
    assert job['id']==(119241598178 if kind=='frontend' else 119241597740) and job['run_id']==RUN and job['head_sha']==SOURCE and job['run_attempt']==1 and job['status']=='completed'
    if kind=='frontend':
        assert job['conclusion']=='failure'
        for name in ['compile once and preserve exact builder and runtime bytes','verify prior official audit on the identical locked dependency inputs']:
            steps=[s for s in job['steps'] if s['name']==name];assert len(steps)==1 and steps[0]['conclusion']=='success'
    else:assert job['conclusion']=='success'
def restore():
    closure();official('frontend')
    evidence=Path('scale-library-governance-evidence/frontend');archive=Path('scale-library-governance-images/frontend')
    r.download('governanceReports',evidence);r.download('governanceImages',archive)
    assert (evidence/'source-head.txt').read_text().strip()==CHECKOUT and (evidence/'source-run.txt').read_text().strip()==str(RUN)
    imagefile=archive/'images.tar.gz';digest=hashlib.file_digest(imagefile.open('rb'),'sha256').hexdigest();assert digest==ARCHIVE
    assert (evidence/'images.sha256').read_text().split()[0]==ARCHIVE
    subprocess.run(['docker','load','-i',str(imagefile)],check=True)
    originals=json.loads((evidence/'images.json').read_text())
    for target,imageid in IMAGES.items():
        tag='scale-library-governance-frontend-'+target+':'+CHECKOUT
        actual=json.loads(subprocess.check_output(['docker','image','inspect',tag],text=True))[0]
        assert actual['Id']==imageid and tag in actual['RepoTags']
        assert actual['Config']['Labels']['org.opencontainers.image.revision']==CHECKOUT
        assert any(row['Id']==imageid and tag in row['RepoTags'] for row in originals)
    receipt={'status':'ACCEPTED_BUILD_ONLY','sourceRun':RUN,'sourceHead':SOURCE,'sourceCheckout':CHECKOUT,'sourceJob':119241598178,'originalJobConclusion':'failure','originalRunConclusion':'failure','newCompilePerformed':False,'newChecksRequired':['types','lint','selected contracts','runtime scan'],'mountedTestRepairs':FIXES,'imageIds':IMAGES,'archiveSha256':ARCHIVE}
    (evidence/'frontend-resume.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
ROUND2=39610102026
ROUND2_SOURCE='0152447ae08beefc04ffffa9601dd33295d3c33e'
ROUND2_CHECKOUT='5efd35f29e2cebcf75369415d34cb353ce75187f'
ROUND2_JOBS={'backend':119256557866,'frontend':119256557985,'sast':119256557242}
ROUND2_REPORTS={'backend':(12350018495,'scale-library-governance-backend-reports-'+ROUND2_CHECKOUT,254058,'999ab8b930a161548b84ce4f9e4b4f20021a061c0d2222cd16736b5ba3d86ce3'),'frontend':(12349748546,'scale-library-governance-frontend-reports-'+ROUND2_CHECKOUT,38987,'5c586a66c302e73f99df2e7605538aeae310d0c1f5e0f7d6370934df69649f23')}
def prior_official(component,read=r.api):
    run=read('runs/'+str(ROUND2));assert run['id']==ROUND2 and run['head_sha']==ROUND2_SOURCE and run['run_attempt']==1 and run['status']=='completed' and run['conclusion']=='failure'
    job=read('jobs/'+str(ROUND2_JOBS[component]));assert job['id']==ROUND2_JOBS[component] and job['run_id']==ROUND2 and job['head_sha']==ROUND2_SOURCE and job['run_attempt']==1 and job['status']=='completed'
    assert job['conclusion']==('success' if component=='sast' else 'failure')
def validate_prior_report(component,report,prior):
    assert report['success'] is False and report['numFailedTests']==(42 if component=='backend' else 4)
    suites={row['name'].removeprefix('/app/'):row for row in report['testResults']}
    assert len(suites)==len(report['testResults']) and sorted(suites)==sorted(prior['originalInventory'][component])
    accepted=[]
    for file in prior[component]:
        assert suites[file]['status']=='passed','Suite-level failure cannot be reused'
        assertions=suites[file]['assertionResults'];assert assertions and all(a['status']=='passed' for a in assertions)
        accepted.append({'file':file,'passed':len(assertions)})
    count=sum(s['passed'] for s in accepted);assert count==(161 if component=='backend' else 159)
    return accepted,count
def prior_contracts(component):
    prior_official(component)
    plan=json.loads(Path('.github/scripts/scale-library-governance-bindings.json').read_text());prior=plan['priorContracts']
    assert prior['run']==ROUND2 and prior['head']==ROUND2_SOURCE and prior['checkout']==ROUND2_CHECKOUT
    original=json.loads(git('show',ROUND2_SOURCE+':.github/scripts/scale-library-governance-bindings.json'))
    assert prior['originalInventory']==original['tests'],'Original inventory drift'
    assert prior[component] and not set(prior[component])&set(plan['tests'][component])
    changed=git('diff','--name-only',ROUND2_SOURCE,'HEAD','--','server-version/'+component).splitlines()
    allowed=prior['allowedBackendChanges'] if component=='backend' else ['server-version/frontend/src/pages/__tests__/ScaleEdit.readonly.test.tsx']
    assert sorted(changed)==sorted(allowed),'Unreviewed component input drift'
    for file in prior[component]:
        path='server-version/'+component+'/'+file
        assert git('rev-parse',ROUND2_SOURCE+':'+path)==git('rev-parse','HEAD:'+path),'Reused suite changed'
    # Entire component tree is compared above, including lock, setup, configuration and transitive source inputs.
    evidence=Path('scale-library-governance-evidence')/component;evidence.mkdir(parents=True,exist_ok=True)
    r.RUN,r.SOURCE=ROUND2,ROUND2_SOURCE;r.ARTIFACTS['governancePriorContracts']=ROUND2_REPORTS[component]
    directory=evidence/'prior-round2';r.download('governancePriorContracts',directory)
    report=json.loads((directory/(component+'-tests.json')).read_text())
    accepted,count=validate_prior_report(component,report,prior)
    receipt={'status':'ACCEPTED_PRIOR_CONTRACTS_ONLY','sourceRun':ROUND2,'sourceHead':ROUND2_SOURCE,'sourceCheckout':ROUND2_CHECKOUT,'sourceJob':ROUND2_JOBS[component],'originalJobConclusion':'failure','originalRunConclusion':'failure','suites':accepted,'passed':count,'newExecution':False,'reviewedBoundary':prior['reviewedBoundary']}
    (evidence/'prior-contracts.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))

if __name__=='__main__':
    if sys.argv[1:] == ['frontend']:restore()
    elif len(sys.argv)==3 and sys.argv[1]=='contracts' and sys.argv[2] in ['backend','frontend']:prior_contracts(sys.argv[2])
    elif sys.argv[1:]==['sast']:
        prior_official('sast');out=Path('scale-library-governance-prior-sast.json');out.write_text(json.dumps({'sourceRun':ROUND2,'sourceHead':ROUND2_SOURCE,'sourceJob':ROUND2_JOBS['sast'],'status':'ANALYSIS_COMPLETED_PRIOR','zeroFindingsClaim':False}));print(out.read_text())
    else:raise ValueError('Only this fixed frontend continuation or original SAST completion is supported')
