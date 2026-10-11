"""Build only the frontend once; checks and runtime reuse its frozen stages."""
import hashlib, json, subprocess, tempfile, time
from pathlib import Path
p = json.loads(Path('homepage-copy-plan.json').read_text())
assert p['route'] == 'homepage-copy' and p['changed'] == ['frontend']
evidence = Path('homepage-copy-evidence'); evidence.mkdir(exist_ok=True)
results = {'head': p['head'], 'frontendTree': p['frontendTree'], 'bases': {}, 'phases': []}
def run(args, timeout=900): subprocess.run(args, check=True, timeout=timeout)
def output(args): return subprocess.check_output(args, text=True).strip()
def phase(name, fn):
    start = time.monotonic(); status = 'failure'
    try: fn(); status = 'success'
    finally:
        results['phases'].append({'name': name, 'status': status, 'seconds': round(time.monotonic()-start, 2)})
        (evidence/'checks.json').write_text(json.dumps(results, indent=2))
tag = 'eduk12-homepage-copy:' + p['head']; builder = tag + '-build'
with tempfile.TemporaryDirectory(prefix='homepage-copy-') as temp:
    frozen = []
    for line in Path('server-version/frontend/Dockerfile').read_text().splitlines():
        fields = line.split()
        if len(fields)>1 and fields[0].upper()=='FROM' and ':' in fields[1]:
            image = fields[1]
            run(['docker','pull',image], 300)
            digest = json.loads(output(['docker','image','inspect',image]))[0]['RepoDigests'][0]
            results['bases'][image] = digest; line = line.replace(image,digest,1)
        frozen.append(line)
    dockerfile = Path(temp)/'Dockerfile'; dockerfile.write_text('\n'.join(frozen)+'\n')
    args = ['docker','buildx','build','--load','-f',str(dockerfile),'--label','org.opencontainers.image.revision='+p['head'],'--build-arg','VITE_COGNITIVE_MODULE_ENABLED=true']
    phase('frontend-compile-once', lambda: run(args+['--target','build','-t',builder,'server-version/frontend']))
    changed = [e['file'].removeprefix('server-version/frontend/') for e in p['changes'] if e['file'].startswith('server-version/frontend/')]
    config = Path(temp)/'tsconfig.homepage-copy.json'
    config.write_text(json.dumps({'extends':'./tsconfig.app.json','include':changed+['src/vite-env.d.ts','src/test/setup.ts'],'references':[]}))
    cmd = 'npx eslint ' + ' '.join(changed) + ' && npx tsc -p tsconfig.homepage-copy.json --noEmit && npm audit --audit-level=high'
    phase('changed-source-lint-types-and-frontend-audit', lambda: run(['docker','run','--rm','-v',str(config)+':/app/tsconfig.homepage-copy.json:ro',builder,'sh','-ec',cmd]))
    phase('runtime-from-same-cached-build', lambda: run(args+['--target','runtime','-t',tag,'server-version/frontend']))
results['image'] = output(['docker','image','inspect','--format','{{.Id}}',tag])
# Preserve the exact runtime even when a subsequent scan/browser fails.
image_tar = evidence/'frontend-image.tar'
run(['docker','save','-o',str(image_tar),tag],300)
results['imageTarSha256'] = hashlib.sha256(image_tar.read_bytes()).hexdigest()
(evidence/'checks.json').write_text(json.dumps(results,indent=2))
