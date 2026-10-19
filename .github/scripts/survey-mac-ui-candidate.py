"""Frontend-only producer/consumers. No local log admission or backend execution."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import time

ROOT = Path.cwd()
E = ROOT / 'survey-mac-ui-evidence'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def output(args):
    return subprocess.check_output(args, text=True).strip()


def run(args, **kwargs):
    subprocess.run(args, check=True, timeout=900, **kwargs)


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def validate_report(report, selection):
    require(report.get('success') is True, 'unsuccessful test report')
    require(report.get('numTotalTests', 0) > 0 and report.get('numFailedTests') == 0
            and report.get('numPendingTests') == 0 and report.get('numTodoTests', 0) == 0, 'empty/failed/skipped test report')
    suites = report.get('testResults', [])
    require(len(suites) == len(selection['frontendTests']), 'unexpected test module count')
    for file in selection['frontendTests']:
        found = [s for s in suites if s.get('name', '').endswith('/' + file)]
        require(len(found) == 1 and found[0].get('status') == 'passed'
                and found[0].get('assertionResults') and all(a.get('status') == 'passed' for a in found[0]['assertionResults']), 'missing/failed/skipped module: ' + file)
    recovery = next(s for s in suites if s['name'].endswith('/SurveyAnalyticsWorkspace.recovery.test.tsx'))
    titles = [a.get('title') for a in recovery['assertionResults']]
    require(all(title in titles for title in selection['requiredRecoveryCases']), 'required P2 case missing')


def validate_build(build, plan):
    require(all(build.get(k) == plan.get(k) for k in ('head', 'sourceHead', 'tree', 'frontendTree', 'inputs')), 'build provenance mismatch')
    require(build.get('status') == 'success' and set(build.get('images', {})) == {'builder', 'runtime'}, 'missing successful producer')
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        require(build.get('runId') == os.environ.get('GITHUB_RUN_ID') and 0 < build.get('attempt', 0) <= int(os.environ['GITHUB_RUN_ATTEMPT']), 'wrong official producer run/attempt')
    for image in build['images'].values():
        require(image.get('id', '').startswith('sha256:') and len(image.get('sha256', '')) == 64, 'invalid image receipt')


def build_candidate(p):
    tag = 'eduk12-survey-mac:' + p['head']
    with tempfile.TemporaryDirectory(prefix='survey-mac-build-') as temp:
        frozen, bases = [], {}
        for line in (ROOT / 'server-version/frontend/Dockerfile').read_text().splitlines():
            fields = line.split()
            if fields and fields[0].upper() == 'FROM':
                image = fields[1]
                run(['docker', 'pull', image])
                pinned = json.loads(output(['docker', 'image', 'inspect', image]))[0]['RepoDigests'][0]
                bases[image] = pinned
                line = line.replace(image, pinned, 1)
            frozen.append(line)
        dockerfile = Path(temp) / 'Dockerfile'
        dockerfile.write_text('\n'.join(frozen) + '\n')
        args = ['docker', 'buildx', 'build', '--load', '-f', str(dockerfile), '--label', 'org.opencontainers.image.revision=' + p['head'],
                '--label', 'org.eduk12.frontend.tree=' + p['frontendTree'], '--build-arg', 'NPM_REGISTRY=https://registry.npmjs.org',
                '--build-arg', 'VITE_COGNITIVE_MODULE_ENABLED=true']
        # The runtime invocation reuses the successful build stage in the same
        # BuildKit cache. There is one production Vite compile, no consumer builds.
        images = {}
        for kind, target, image_tag in [('builder', 'build', tag + '-build'), ('runtime', 'runtime', tag)]:
            run(args + ['--target', target, '-t', image_tag, 'server-version/frontend'])
            archive = E / (kind + '.tar')
            run(['docker', 'save', '-o', str(archive), image_tag])
            images[kind] = {'tag': image_tag, 'id': output(['docker', 'image', 'inspect', '--format', '{{.Id}}', image_tag]), 'sha256': digest(archive)}
        receipt = {k: p[k] for k in ('head', 'sourceHead', 'tree', 'frontendTree', 'inputs')}
        receipt.update(status='success', images=images, bases=bases, runId=os.environ['GITHUB_RUN_ID'], attempt=int(os.environ['GITHUB_RUN_ATTEMPT']), authority='official current-run producer; local logs are review only')
        (E / 'build.json').write_text(json.dumps(receipt, indent=2))


def load_image(build, kind):
    image = build['images'][kind]
    archive = E / (kind + '.tar')
    require(digest(archive) == image['sha256'], 'image archive digest mismatch')
    run(['docker', 'load', '-i', str(archive)])
    require(output(['docker', 'image', 'inspect', '--format', '{{.Id}}', image['tag']]) == image['id'], 'image ID mismatch')
    return image['tag']


def check_candidate(p, phase):
    b = json.loads((E / 'build.json').read_text())
    validate_build(b, p)
    if phase == 'runtime-load':
        load_image(b, 'runtime')
        return
    tag = load_image(b, 'builder')
    args = ['docker', 'run', '--rm', '-e', 'CI=true', '-e', 'NPM_CONFIG_REGISTRY=https://registry.npmjs.org',
            '-e', 'NPM_CONFIG_REPLACE_REGISTRY_HOST=always', '-v', str(E) + ':/evidence']
    bindings = json.loads((ROOT / '.github/scripts/survey-mac-ui-bindings.json').read_text())
    for file, blob in bindings['externalFixtures'].items():
        require(output(['git', 'hash-object', file]) == blob, 'changed external JSON fixture')
        target = '/' + file.removeprefix('server-version/')
        args += ['-v', str(ROOT / file) + ':' + target + ':ro']
    selected = json.loads((ROOT / '.github/scripts/survey-mac-ui-test-selection.json').read_text())
    changed = [f['path'].removeprefix('server-version/frontend/') for f in bindings['files']
               if f['path'].startswith('server-version/frontend/src/') and f['path'].endswith(('.ts', '.tsx'))]
    commands = {
        'lint': 'npx --no-install eslint ' + shlex.join(changed),
        'types': 'npx --no-install tsc -p tsconfig.app.json --noEmit && npx --no-install tsc -p tsconfig.cognitive.json --noEmit',
        'tests': 'npx --no-install vitest run ' + shlex.join(selected['frontendTests']) + ' --maxWorkers=2 --reporter=json --outputFile=/evidence/tests.json',
        'audit': 'npm audit --audit-level=high --json > /evidence/audit.json',
    }
    require(phase in commands, 'unknown phase')
    run(args + [tag, 'sh', '-ec', commands[phase]])
    if phase == 'tests':
        validate_report(json.loads((E / 'tests.json').read_text()), selected)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['build', 'lint', 'types', 'tests', 'audit', 'runtime-load'])
    phase = parser.parse_args().phase
    require(os.environ.get('GITHUB_ACTIONS') == 'true', 'Application qualification runs in Actions after independent review')
    run(['node', '.github/scripts/survey-mac-ui-scope.mjs'])
    p = json.loads((ROOT / 'survey-mac-ui-plan.json').read_text())
    E.mkdir(exist_ok=True)
    receipt = {'head': p['head'], 'sourceHead': p['sourceHead'], 'tree': p['tree'], 'frontendTree': p['frontendTree'], 'phase': phase, 'status': 'failure'}
    start = time.monotonic()
    try:
        build_candidate(p) if phase == 'build' else check_candidate(p, phase)
        receipt['status'] = 'success'
    finally:
        receipt['seconds'] = round(time.monotonic() - start, 3)
        (E / (phase + '-receipt.json')).write_text(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    main()
