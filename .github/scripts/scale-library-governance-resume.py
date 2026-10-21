"""One fixed failed-run continuation: original frontend image bytes, not a rebuild."""
import hashlib, importlib.util, json, os, subprocess, sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('original',Path(__file__).with_name('scale-authoring-reuse.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
SOURCE='88bf456d09bab16f2823fe7cb4229176784bc559'
CHECKOUT='f41811053761c25709f98d74f0abed7eb1c61711'
RUN=39605768918
FIXES=['server-version/frontend/src/components/scale-governance/TrainingScaleLibrarySubmission.test.tsx','server-version/frontend/src/survey/SurveyPublicApp.final.test.tsx']
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
if __name__=='__main__':
    if sys.argv[1:] == ['frontend']:restore()
    elif sys.argv[1:]==['sast']:
        official('sast');out=Path('scale-library-governance-prior-sast.json');out.write_text(json.dumps({'sourceRun':RUN,'sourceHead':SOURCE,'sourceJob':119241597740,'status':'ANALYSIS_COMPLETED_PRIOR','zeroFindingsClaim':False}));print(out.read_text())
    else:raise ValueError('Only this fixed frontend continuation or original SAST completion is supported')
