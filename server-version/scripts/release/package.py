import hashlib,json,os,shutil,subprocess,time
from pathlib import Path
from qualify import filehash
p=json.loads(Path('release-plan.json').read_text());images=json.loads(Path('release-images.json').read_text());scans=json.loads(Path('release-scans.json').read_text());out=Path('release-package');out.mkdir();manifest={}
assert set(images)==set(scans)==set(p['changed'])
assert all(v['status']=='success' and v['image']==images[c] for c,v in scans.items())
for c,i in images.items():
    file=out/(c+'.tar');subprocess.run(['docker','save','-o',str(file),i],check=True,timeout=600)
    manifest[c]={'image':i,'sha256':filehash(file),'file':file.name,'component':p['components'].get(c,{}).get('candidate'),'buildArguments':{'VITE_COGNITIVE_MODULE_ENABLED':'true'} if c=='frontend' else {'DEBIAN_MIRROR':'mirrors.tuna.tsinghua.edu.cn'}}
shutil.copytree('release-evidence',out/'browser')
for file in ['release-plan.json','release-scans.json','release-checks.json','executor-rehearsal.json',*(['candidate-ready.json'] if 'frontend' in images else []),*['release-scan-'+c+'.json' for c in images]]:shutil.copyfile(file,out/Path(file).name)
(out/'manifest.json').write_text(json.dumps({'schema':1,'head':p['head'],'base':p['base'],'route':p['route'],'run':os.environ['GITHUB_RUN_ID'],'workflow':'.github/workflows/ci.yml','artifacts':manifest,'tools':p['tools'],'at':time.time(),'candidateQualified':True},indent=2))
