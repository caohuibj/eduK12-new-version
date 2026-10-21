"""One fixed failed-run continuation: original frontend image bytes, not a rebuild."""
import hashlib, importlib.util, json, os, re, subprocess, sys
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
    r.RUN,r.SOURCE=RUN,SOURCE
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

ROUND3={'run': 39614240900, 'head': '1dc16b8ef542f4f68457100f652fdd34074b6311', 'checkout': 'cf6ef4ee00b774037129b671ab5ff8d8f36ef69c', 'jobs': {'backend': 119271089353, 'frontend': 119271089484, 'postgres': 119273407309, 'sast': 119271088571}, 'reports': {'backend': [12352157951, 'scale-library-governance-backend-reports-cf6ef4ee00b774037129b671ab5ff8d8f36ef69c', 593533, '72bb70a02b04435e5f77b1eb6968705888659153409453eb0115351ec8fe0f2f'], 'frontend': [12351463531, 'scale-library-governance-frontend-reports-cf6ef4ee00b774037129b671ab5ff8d8f36ef69c', 81684, '8b18972246d25406ef4ad4ff5f025d9d7927721a00e778389c55e08d99b97637'], 'postgres': [12352123235, 'scale-library-governance-connected-cf6ef4ee00b774037129b671ab5ff8d8f36ef69c', 4667, '48366c915b250225689dd181ac07645d9bcdbc2d04fa2f2adb8263cf73867761']}}
REPORT_REPAIRS=['server-version/backend/src/modules/composite/composite.service.ts','server-version/backend/src/__tests__/composite/results.service.test.ts']
SQL_REPAIRS=['server-version/backend/prisma/migrations/20261021123000_scale_library_governance/migration.sql','server-version/backend/src/modules/scale/scale-copy.service.ts']
def round3_official(component,read=r.api):
    run=read('runs/'+str(ROUND3['run']));assert run['id']==ROUND3['run'] and run['head_sha']==ROUND3['head'] and run['run_attempt']==1 and run['status']=='completed' and run['conclusion']=='failure'
    job=read('jobs/'+str(ROUND3['jobs'][component]));assert job['id']==ROUND3['jobs'][component] and job['run_id']==ROUND3['run'] and job['head_sha']==ROUND3['head'] and job['run_attempt']==1 and job['status']=='completed'
    assert job['conclusion']==('failure' if component=='postgres' else 'success')
def round3_closure():
    assert git('diff','--name-only',ROUND3['head'],'HEAD','--','server-version/frontend')==''
    assert sorted(git('diff','--name-only',ROUND3['head'],'HEAD','--','server-version/backend').splitlines())==sorted(SQL_REPAIRS+[FIXTURE_PATH]+REPORT_REPAIRS)
    fixture_diagnostics_only(ROUND3['head'])
    closure() # Original frontend compile/tool/environment closure is also retained.
    original=json.loads(git('show',ROUND3['head']+':.github/scripts/scale-library-governance-bindings.json'))
    for component in ['backend','frontend','postgres']:
        for file in original['tests'][component]+(original['priorContracts'].get(component,[])):
            path='server-version/'+('backend' if component=='postgres' else component)+'/'+file
            assert git('rev-parse',ROUND3['head']+':'+path)==git('rev-parse','HEAD:'+path)
    return original

def passed_suites(report,files,count,complete):
    suites={row['name'].removeprefix('/app/'):row for row in report['testResults']}
    assert len(suites)==len(report['testResults'])
    if complete:assert report['success'] is True and report['numFailedTests']==0 and report['numPendingTests']==0 and sorted(suites)==sorted(files)
    else:assert report['success'] is False and report['numFailedTests']==24
    accepted=[]
    for file in files:
        suite=suites[file];assert suite['status']=='passed' and suite['assertionResults'] and all(a['status']=='passed' for a in suite['assertionResults'])
        accepted.append({'file':file,'passed':len(suite['assertionResults'])})
    assert sum(s['passed'] for s in accepted)==count
    return accepted

def round3_accept(component):
    original=round3_closure();round3_official(component)
    evidence=Path('scale-library-governance-evidence')/component;evidence.mkdir(parents=True,exist_ok=True)
    directory=evidence/'prior-round3';r.RUN,r.SOURCE=ROUND3['run'],ROUND3['head'];r.ARTIFACTS['governanceRound3']=tuple(ROUND3['reports'][component]);r.download('governanceRound3',directory)
    if component=='postgres':
        file='src/__tests__/integration/instrument-final-submit.postgres.integration.test.ts'
        report=json.loads((directory/'postgres/postgres-tests.json').read_text());assert sorted(s['name'].removeprefix('/app/') for s in report['testResults'])==sorted(original['tests']['postgres'])
        accepted=passed_suites(report,[file],13,False)
        cleanup=json.loads((directory/'cleanup.json').read_text());assert cleanup['exitStatus']==0 and cleanup['privateMaterialRemoved'] is True
    else:
        report=json.loads((directory/(component+'-tests.json')).read_text());accepted=passed_suites(report,original['tests'][component],162 if component=='backend' else 21,True)
        old=json.loads((directory/'prior-round2'/(component+'-tests.json')).read_text());validate_prior_report(component,old,original['priorContracts'])
        if component=='frontend':
            scan=json.loads((directory/'runtime-scan.json').read_text())
            assert scan['ArtifactName']=='scale-library-governance-frontend-runtime:'+CHECKOUT and scan['Metadata']['ImageID']==IMAGES['runtime']
            assert not [v for result in scan.get('Results',[]) for v in result.get('Vulnerabilities',[]) if v.get('Severity') in ['HIGH','CRITICAL']]
    out={'status':'ACCEPTED_PRIOR_SUCCESS','sourceRun':ROUND3['run'],'sourceHead':ROUND3['head'],'sourceJob':ROUND3['jobs'][component],'originalRunConclusion':'failure','originalJobConclusion':'failure' if component=='postgres' else 'success','suites':accepted,'newExecution':False,'scope':'ordinary instrument FINAL only' if component=='postgres' else ('full frontend qualification including prior 159, types/lint and runtime scan' if component=='frontend' else 'unit contracts including prior 161 only; backend build/scan invalidated by SQL repairs')}
    (evidence/'round3-accepted.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
    return directory

def qualified_frontend():
    directory=round3_accept('frontend');restore()
    receipt=Path('scale-library-governance-evidence/frontend/frontend-resume.json');data=json.loads(receipt.read_text());data['newChecksRequired']=[];data['qualificationRun']=ROUND3['run'];data['qualificationJob']=ROUND3['jobs']['frontend'];receipt.write_text(json.dumps(data,indent=2)+'\n')

ROUND4={'run': 39616852296, 'head': 'e74783c4a8baffa7b999b49182bd697018825bc7', 'checkout': 'c2c383fd4f61d09b91d61ae16eaec9f5c7c0db22', 'jobs': {'backend': 119280244137, 'connected': 119282119128, 'sast': 119280242999}, 'artifacts': {'backend': [12353556421, 'scale-library-governance-backend-reports-c2c383fd4f61d09b91d61ae16eaec9f5c7c0db22', 923893, 'a91e142c5ed9ea30d0a39710f2ddc9fdc78864d17df3d1ed467ee3e5f37033ca'], 'connected': [12353556809, 'scale-library-governance-connected-c2c383fd4f61d09b91d61ae16eaec9f5c7c0db22', 121472, '06636b47c081383981acda374e15ba05e997080e7061ecb749c8585fff0b0662'], 'images': [12352902574, 'scale-library-governance-backend-images-c2c383fd4f61d09b91d61ae16eaec9f5c7c0db22', 811175079, '7a3a87f4a0e128290d5546885bfb7a0ee682e8b77d27b25ec3b6f12a33bcb165']}, 'archive': '5dd226d615c9caf52a3c3b849d28a8cf9ab6c18ececde76167dec04906282c29', 'images': [{'id': 'sha256:ee6b31bf7cbf0258f62f6f59e89e5a80be5cbd72550baebef55f5cff8129badf', 'tags': ['scale-library-governance-backend-builder:c2c383fd4f61d09b91d61ae16eaec9f5c7c0db22'], 'revision': 'c2c383fd4f61d09b91d61ae16eaec9f5c7c0db22'}, {'id': 'sha256:95e989c026a2405dffc56f47c2ee78c2b648f67a447e179051faed60be161a0d', 'tags': ['scale-library-governance-backend-runtime:c2c383fd4f61d09b91d61ae16eaec9f5c7c0db22'], 'revision': 'c2c383fd4f61d09b91d61ae16eaec9f5c7c0db22'}]}
FIXTURE_PATH='server-version/backend/scripts/scale-library-governance-browser-fixture.ts'
def fixture_diagnostics_only(original):
    old=git('show',original+':'+FIXTURE_PATH);current=Path(FIXTURE_PATH).read_text()
    def business(text):
        text=text.split('// Do not serialize Error.message',1)[0].split('main().catch(',1)[0]
        return '\n'.join(line for line in text.splitlines() if not re.match(r"\s*phase = '[a-z-]+'",line)).strip()
    # One reviewed synthetic-login correction; never ignore arbitrary fixture input changes.
    if business(old)!=business(current):
        assert hashlib.sha256(current.encode()).hexdigest()=='133d25ee569ef46514dbe3735628f95afa533c83506427a6f3bd10fd0ee8608a'
        current=current.replace("username: 'gov_ci_' + key", "username: 'governance_ci_' + key").replace("  // Match survey_login_shape_check before any write; this subset also satisfies admin bootstrap (4..64).\n  for (const account of [teacher, student, researcher, administrator]) {\n    assert.match(account.username, /^[a-z0-9_.-]{4,32}$/, 'Synthetic account must satisfy database login constraints')\n    assert.equal(account.username, account.username.trim().toLowerCase())\n  }\n", '')
        assert hashlib.sha256(current.encode()).hexdigest()=='509d71f0726950d64eda2aa969740a50a9f50f328cec35933a6037127b45a0a4'
    assert business(old)==business(current),'Fixture input differs beyond reviewed diagnostics and synthetic-login correction'
def round4_closure():
    assert git('diff','--name-only',ROUND4['head'],'HEAD','--','server-version/frontend')==''
    assert sorted(git('diff','--name-only',ROUND4['head'],'HEAD','--','server-version/backend').splitlines())==sorted([FIXTURE_PATH]+REPORT_REPAIRS)
    fixture_diagnostics_only(ROUND4['head'])
    for path in ['.github/scripts/scale-library-governance-recovery.py','.github/scripts/scale-library-governance-build.sh','server-version/backend/scripts/scale-library-governance-legacy-fixture.sql']:
        assert git('show',ROUND4['head']+':'+path)==Path(path).read_text().strip()
    closure()
def round4_official(kind,read=r.api):
    run=read('runs/'+str(ROUND4['run']));assert run['id']==ROUND4['run'] and run['head_sha']==ROUND4['head'] and run['run_attempt']==1 and run['status']=='completed' and run['conclusion']=='failure'
    job=read('jobs/'+str(ROUND4['jobs'][kind]));assert job['id']==ROUND4['jobs'][kind] and job['run_id']==ROUND4['run'] and job['head_sha']==ROUND4['head'] and job['run_attempt']==1 and job['status']=='completed'
    assert job['conclusion']==('failure' if kind=='connected' else 'success')
    if kind=='connected':
        for name in ['upgrade only the synthetic old schema and preserve legacy bytes','real governance PostgreSQL contracts and concurrency','limited synthetic new-schema dump and restore']:
            steps=[s for s in job['steps'] if s['name']==name];assert len(steps)==1 and steps[0]['conclusion']=='success'
        steps=[s for s in job['steps'] if s['name']=='synthetic accounts and real administrator enrollment ticket, never sessions'];assert len(steps)==1 and steps[0]['conclusion']=='failure'
def round4_evidence():
    round4_closure();round4_official('backend');round4_official('connected')
    root=Path('scale-library-governance-evidence/prior-round4');root.mkdir(parents=True,exist_ok=True)
    r.RUN,r.SOURCE=ROUND4['run'],ROUND4['head']
    for kind in ['backend','connected']:
        r.ARTIFACTS['governanceRound4']=tuple(ROUND4['artifacts'][kind]);r.download('governanceRound4',root/kind)
    original=json.loads(git('show',ROUND4['head']+':.github/scripts/scale-library-governance-bindings.json'))
    connected=root/'connected';report=json.loads((connected/'postgres/postgres-tests.json').read_text());passed_suites(report,original['tests']['postgres'],29,True)
    inherited=json.loads((connected/'postgres/round3-accepted.json').read_text());assert inherited['sourceRun']==ROUND3['run'] and inherited['status']=='ACCEPTED_PRIOR_SUCCESS' and inherited['suites']==[{'file':'src/__tests__/integration/instrument-final-submit.postgres.integration.test.ts','passed':13}]
    migration=json.loads((connected/'postgres/migration.json').read_text());assert migration['status']=='PASS' and migration['legacyPublishedPublicPreserved'] is True and migration['lineageNotInvented'] is True
    restored=json.loads((connected/'postgres/restore.json').read_text());assert restored['status']=='PASS' and restored['productionRecoveryClaim'] is False and len(restored['tables'])==16 and all(t['count']>0 and re.fullmatch('[a-f0-9]{32}',t['digest']) for t in restored['tables'].values())
    cleanup=json.loads((connected/'cleanup.json').read_text());assert cleanup['exitStatus']==0 and cleanup['privateMaterialRemoved'] is True
    scan=json.loads((root/'backend/runtime-scan.json').read_text());runtime=next(i for i in ROUND4['images'] if any('-runtime:' in t for t in i['tags']))
    assert scan['Metadata']['ImageID']==runtime['id'] and scan['ArtifactName'] in runtime['tags']
    assert not [v for result in scan.get('Results',[]) for v in result.get('Vulnerabilities',[]) if v.get('Severity') in ['HIGH','CRITICAL']]
    prior=json.loads((root/'backend/round3-accepted.json').read_text());assert prior['sourceRun']==ROUND3['run'] and prior['status']=='ACCEPTED_PRIOR_SUCCESS' and sum(s['passed'] for s in prior['suites'])==162
    out={'status':'ACCEPTED_PRIOR_QUALIFICATION','sourceRun':ROUND4['run'],'sourceHead':ROUND4['head'],'sourceJobs':ROUND4['jobs'],'originalRunConclusion':'failure','originalConnectedConclusion':'failure','postgresPassed':29,'instrumentFinalInherited':13,'migration':'PASS','syntheticRestore':'PASS','productionRecoveryClaim':False,'backendScan':'PASS_PRIOR_IMAGE_ONLY','currentFixtureSha256':hashlib.sha256(Path(FIXTURE_PATH).read_bytes()).hexdigest(),'backendOriginalRevision':ROUND4['checkout'],'newBuildOrQualificationPerformed':False}
    (Path('scale-library-governance-evidence')/'round4-accepted.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out));return root

def round4_backend_restore():
    root=round4_evidence();r.RUN,r.SOURCE=ROUND4['run'],ROUND4['head'];r.ARTIFACTS['governanceRound4Images']=tuple(ROUND4['artifacts']['images'])
    archive=Path('scale-library-governance-images/backend');r.download('governanceRound4Images',archive)
    image=archive/'images.tar.gz';assert hashlib.file_digest(image.open('rb'),'sha256').hexdigest()==ROUND4['archive']
    assert (root/'backend/images.sha256').read_text().split()[0]==ROUND4['archive']
    subprocess.run(['docker','load','-i',str(image)],check=True)
    for expected in ROUND4['images']:
        tag=expected['tags'][0];actual=json.loads(subprocess.check_output(['docker','image','inspect',tag],text=True))[0]
        assert actual['Id']==expected['id'] and tag in actual['RepoTags'] and actual['Config']['Labels']['org.opencontainers.image.revision']==expected['revision']==ROUND4['checkout']
    with open(os.environ['GITHUB_ENV'],'a') as out:out.write('SCALE_GOVERNANCE_BACKEND_IMAGE_HEAD='+ROUND4['checkout']+'\n')

if __name__=='__main__':
    if sys.argv[1:] == ['frontend']:restore()
    elif len(sys.argv)==3 and sys.argv[1]=='contracts' and sys.argv[2] in ['backend','frontend']:prior_contracts(sys.argv[2])
    elif sys.argv[1:]==['qualified-frontend']:qualified_frontend()
    elif len(sys.argv)==3 and sys.argv[1]=='round3' and sys.argv[2] in ['backend','postgres']:round3_accept(sys.argv[2])
    elif sys.argv[1:]==['round4-evidence']:round4_evidence()
    elif sys.argv[1:]==['round4-backend']:round4_backend_restore()
    elif sys.argv[1:]==['sast']:
        round4_official('sast');out=Path('scale-library-governance-prior-sast.json');out.write_text(json.dumps({'sourceRun':ROUND4['run'],'sourceHead':ROUND4['head'],'sourceJob':ROUND4['jobs']['sast'],'status':'ANALYSIS_COMPLETED_PRIOR','zeroFindingsClaim':False}));print(out.read_text())
    else:raise ValueError('Only this fixed frontend continuation or original SAST completion is supported')
