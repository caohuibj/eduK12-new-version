"""One compilation and dependency installation per changed component.
Checks consume its build-stage image; final images reuse the frozen BuildKit
stages. No change to application Dockerfiles or application dependencies.
"""
import json, subprocess, tempfile, time
from pathlib import Path
p=json.loads(Path('release-plan.json').read_text());assert p['route'] in ['A','B'];built={};checks={};phases=[];bases={}
def run(args,timeout=1800):return subprocess.run(args,check=True,timeout=timeout)
def inspect(tag):return subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',tag],text=True).strip()
def phase(name,fn):
    start=time.monotonic()
    try:fn();phases.append({'stage':name,'status':'success','seconds':round(time.monotonic()-start,3)})
    except Exception:
        phases.append({'stage':name,'status':'failure','seconds':round(time.monotonic()-start,3)});raise
    finally:Path('release-checks.json').write_text(json.dumps({'checks':checks,'phases':phases},indent=2))
with tempfile.TemporaryDirectory(prefix='eduk12-release-build-') as temp:
 for component in p['changed']:
    context='server-version/'+component;tag='eduk12-release-'+component+':'+p['head'];builder=tag+'-build'
    # Freeze external bases before exporting build/runtime targets, so a tag
    # rotation cannot cause a second, different dependency install/compilation.
    frozen=[]
    for line in Path(context+'/Dockerfile').read_text().splitlines():
        fields=line.split()
        if len(fields)>1 and fields[0].upper()=='FROM' and (':' in fields[1] or '/' in fields[1]):
            image=fields[1]
            if image not in bases:
                run(['docker','pull',image],600)
                bases[image]=json.loads(subprocess.check_output(['docker','image','inspect',image],text=True))[0]['RepoDigests'][0]
            pinned=bases[image]
            line=line.replace(image,pinned,1)
        frozen.append(line)
    dockerfile=Path(temp)/(component+'.Dockerfile');dockerfile.write_text('\n'.join(frozen)+'\n')
    args=['docker','buildx','build','--load','-f',str(dockerfile),'--label','org.opencontainers.image.revision='+p['head'],'--label','eduk12.component='+p['components'][component]['candidate']]
    args+=['--build-arg','VITE_COGNITIVE_MODULE_ENABLED=true'] if component=='frontend' else ['--build-arg','DEBIAN_MIRROR=mirrors.tuna.tsinghua.edu.cn']
    phase(component+'-compile',lambda:run(args+['--target','build','-t',builder,context]))
    if component=='frontend':
        commands='npm run lint && npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.cognitive.json --noEmit && npm audit --audit-level=high'
        if any(e['file'].endswith('TrainingPortal.tsx') for e in p['changes']):commands+=' && npx vitest run src/training/TrainingScreens.test.tsx --maxWorkers=2'
        if any(e['file'].endswith('StudentLogin.roles.test.tsx') for e in p['changes']):commands+=' && npx vitest run src/pages/StudentLogin.roles.test.tsx --maxWorkers=2'
    else:
        tests=['src/__tests__/controllers/login-admission.test.ts','src/__tests__/controllers/authLibrary.test.ts','src/__tests__/middleware/auth.test.ts','src/__tests__/middleware/csrf.test.ts','src/__tests__/middleware/loginRateLimit.test.ts','src/__tests__/utils/authCookies.test.ts']
        commands='npm audit --audit-level=high && npx vitest run '+' '.join(tests)+' --reporter=json --outputFile=/tmp/login-tests.json && node scripts/assert-release-test-report.mjs /tmp/login-tests.json '+' '.join(tests)
    phase(component+'-checks',lambda:run(['docker','run','--rm',builder,'sh','-ec',commands],900))
    checks[component+'-checks']={'status':'success','component':p['components'][component]['candidate'],'buildImage':inspect(builder)}
    phase(component+'-runtime',lambda:run(args+['--target','runtime','--no-cache-filter','runtime','-t',tag,context]))
    built[component]=inspect(tag)
    if component=='backend':
        # Same cached compilation, used only for synthetic database fixtures.
        phase('fixture-ops',lambda:run(args+['--target','ops','-t','eduk12-release-ops:'+p['head'],context]))
Path('release-images.json').write_text(json.dumps(built,indent=2))
Path('release-checks.json').write_text(json.dumps({'checks':checks,'phases':phases},indent=2))
