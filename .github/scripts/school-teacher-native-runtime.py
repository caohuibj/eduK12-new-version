"""Consume same-run compiled contexts; retain existing runtime recipes/scans.

This bounded consumer never compiles application sources or runs application
tests. It remains unreachable while the native candidate binding is disabled.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('exact_runtime', ROOT / '.github/scripts/exact-candidate-runtime.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


def verify_context(receipt, component, plan, env, archive):
    runtime.require(receipt['schemaVersion'] == 1 and receipt['kind'] == component, 'Wrong runtime context')
    runtime.require(receipt['head'] == plan['head'] == env['GITHUB_SHA'], 'Stale compiled source')
    runtime.require(receipt['runId'] == env['GITHUB_RUN_ID'], 'Cross-run context forbidden')
    runtime.require(receipt['attempt'] == env['GITHUB_RUN_ATTEMPT'], 'Cross-attempt context needs independent review')
    runtime.require(receipt['tree'] == plan['components'][component], 'Wrong component tree')
    runtime.require(receipt['archiveSha256'] == hashlib.sha256(Path(archive).read_bytes()).hexdigest(), 'Changed compiled context')
    manifest = receipt['manifest']
    runtime.require(manifest['sha'] == plan['head'] and manifest['runId'] == env['GITHUB_RUN_ID'] and manifest['kind'] == component, 'Wrong build manifest')
    lock = ROOT / 'server-version' / component / 'package-lock.json'
    runtime.require(manifest['lockDigest'] == hashlib.sha256(lock.read_bytes()).hexdigest(), 'Wrong locked dependencies')


def main():
    runtime.require(os.environ.get('GITHUB_ACTIONS') == 'true', 'Official Actions only')
    plan = json.loads(os.environ['PLAN'])
    runtime.require(plan['candidate'] == 'native-bundle', 'Wrong scenario')
    out = ROOT / 'school-teacher-evidence'
    out.mkdir(exist_ok=True)
    commands = []
    env = dict(os.environ)
    for key in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
        env.pop(key, None)

    def run(name, argv):
        result = subprocess.run(argv, cwd=ROOT, env=env, capture_output=True, timeout=900)
        raw = result.stdout + result.stderr
        # Raw build diagnostics remain private; public receipts retain exit/hash.
        private = Path(os.environ['RUNNER_TEMP']) / ('native-' + name + '.log')
        private.write_bytes(raw)
        private.chmod(0o600)
        commands.append({'name': name, 'argv': argv, 'exitCode': result.returncode, 'logSha256': hashlib.sha256(raw).hexdigest()})
        (out / 'native-runtime-commands.json').write_text(json.dumps(commands, indent=2))
        runtime.require(result.returncode == 0, 'Native runtime command failed: ' + name)
        return result.stdout.decode()

    if plan.get('continuation') == 'package-browser-only':
        original = json.loads((out / 'original-native-runtime.json').read_text())
        runtime.require(original['head'] == '807e12c7edf061efc2ec1bd893690c7a0ca01ac3' and original['runId'] == '40977943858', 'Wrong original runtime')
        with tempfile.TemporaryDirectory(prefix='package-browser-', dir=env['RUNNER_TEMP']) as temporary:
            contexts = Path(temporary)
            for item in original['results']:
                kind = item['component']
                directory = ROOT / 'native-runtime-inputs' / kind
                archive = directory / (kind + '-runtime.tar.gz')
                runtime.require(hashlib.sha256(archive.read_bytes()).hexdigest() == item['context']['archiveSha256'], 'Changed original compiled context')
                runtime.require(item['context']['tree'] == plan['components'][kind], 'Changed current component')
                target = contexts / kind
                target.mkdir()
                allowed = {'dist', 'Dockerfile', 'nginx.conf'} if kind == 'frontend' else {'dist', 'node_modules', 'assets', 'prisma', 'scripts', 'package.json', 'package-lock.json', 'Dockerfile'}
                runtime.safe_extract(archive, target, allowed)
                run(kind + '-retained-dist-bytes', ['node', '--input-type=module', '-e',
                    "import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{treeDigest}from'./.github/scripts/ci-artifact.mjs';const[d,m]=process.argv.slice(1);const expected=JSON.parse(m);assert.deepEqual(JSON.parse(readFileSync(d+'/ci-build-manifest.json')),expected);assert.equal(treeDigest(d),expected.contentDigest)",
                    str(target / 'dist'), json.dumps(item['context']['manifest'])])
                env['P6_BROWSER_CONTEXT'] = str(contexts)
            report = {'status': 'SCANNED_BROWSER_PENDING', 'head': plan['head'], 'runId': env['GITHUB_RUN_ID'],
                      'originalRuntime': original, 'results': original['results'], 'baseImages': original['baseImages'],
                      'buildExecuted': False, 'runtimeImageRebuilt': False, 'runtimeScanRepeated': False}
            (out / 'native-runtime.json').write_text(json.dumps(report, indent=2))
            env['P6_BROWSER_HOST_CONTEXT'] = 'true'
            run('package-browser', ['node', 'server-version/e2e/school-teacher-package-browser.cjs'])
            browser = json.loads((out / 'package-browser.json').read_text())
            runtime.require(browser['status'] == 'PASSED' and browser['head'] == plan['head'] and browser['runId'] == env['GITHUB_RUN_ID'], 'Current missing browser failed')
            report['status'] = 'PASSED'
            report['browserSha256'] = hashlib.sha256((out / 'package-browser.json').read_bytes()).hexdigest()
            (out / 'native-runtime.json').write_text(json.dumps(report, indent=2))
        return

    version = run('trivy-version', ['trivy', '--version'])
    runtime.require(re.search(r'^Version:\s*0\.70\.0$', version, re.M), 'Pinned Trivy required')
    bases = {}
    for component, tag in [('node', 'node:24.21.0-bookworm-slim'), ('nginx', 'nginx:1.31.6-alpine3.24-slim')]:
        run(component + '-pull', ['docker', 'pull', tag])
        digests = json.loads(run(component + '-digest', ['docker', 'image', 'inspect', '--format', '{{json .RepoDigests}}', tag]))
        bases[component] = next(d for d in digests if re.fullmatch(component + r'@sha256:[a-f0-9]{64}', d))
    results = []
    browser_context = Path(os.environ['RUNNER_TEMP']) / 'p6-browser-context'
    for component in ('frontend', 'backend'):
        directory = ROOT / 'native-runtime-inputs' / component
        archive = directory / (component + '-runtime.tar.gz')
        receipt = json.loads((directory / (component + '-runtime-context.json')).read_text())
        verify_context(receipt, component, plan, os.environ, archive)
        with tempfile.TemporaryDirectory(prefix='native-runtime-', dir=os.environ['RUNNER_TEMP']) as temporary:
            context = Path(temporary)
            allowed = {'dist', 'Dockerfile', 'nginx.conf'} if component == 'frontend' else {'dist', 'node_modules', 'assets', 'prisma', 'scripts', 'package.json', 'package-lock.json', 'Dockerfile'}
            runtime.safe_extract(archive, context, allowed)
            # The producer's complete dist bytes are verified again after extraction.
            run(component + '-manifest', ['node', '.github/scripts/ci-artifact.mjs', 'verify', component, str(context / 'dist')])
            original = (context / 'Dockerfile').read_text()
            runtime.require(original == (ROOT / 'server-version' / component / 'Dockerfile').read_text(), 'Changed runtime recipe')
            recipe = runtime.runtime_recipe(component, original, bases['node'], bases['nginx'])
            (context / 'Dockerfile.runtime-only').write_text(recipe)
            tag = 'native-bundle-' + component + ':' + plan['head']
            run(component + '-image', ['docker', 'build', '--file', str(context / 'Dockerfile.runtime-only'), '--label', 'org.opencontainers.image.revision=' + plan['sourceHead'], '--tag', tag, str(context)])
            image = json.loads(run(component + '-image-id', ['docker', 'image', 'inspect', '--format', '{{json .Id}}', tag]))
            if component == 'backend':
                run('backend-native', ['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'node', image, '-e', "require('canvas');require('sharp');if(!require('fs').existsSync('/app/dist/workers/main.js'))throw Error('Missing worker runtime')"])
            report_path = out / ('native-' + component + '-trivy.json')
            run(component + '-scan', ['trivy', 'image', '--cache-dir', os.environ['TRIVY_CACHE_DIR'], '--format', 'json', '--output', str(report_path), '--exit-code', '1', '--ignore-unfixed', '--vuln-type', 'os,library', '--severity', 'CRITICAL,HIGH', image])
            report = json.loads(report_path.read_text())
            runtime.require(report['SchemaVersion'] >= 2 and report['Metadata']['ImageID'] == image, 'Wrong scan identity')
            runtime.require(isinstance(report.get('Results'), list) and report['Results'], 'Missing scan results')
            findings = [v for r in report['Results'] for v in r.get('Vulnerabilities', [])]
            runtime.require(not any(v['Severity'] in ('HIGH', 'CRITICAL') and v.get('FixedVersion') for v in findings), 'Fixable HIGH/CRITICAL runtime findings')
            if plan.get('publicPackage'):
                browser_context.mkdir(exist_ok=True)
                shutil.copytree(context, browser_context / component)
                (browser_context / component).chmod(0o755)
            results.append({'component': component, 'imageId': image, 'context': receipt, 'reportSha256': hashlib.sha256(report_path.read_bytes()).hexdigest()})
    metadata = Path(os.environ['TRIVY_CACHE_DIR']) / 'db/metadata.json'
    runtime.require(metadata.is_file(), 'Actual scanner database metadata required')
    (out / 'native-trivy-database.json').write_bytes(metadata.read_bytes())
    report = {'status': 'SCANNED_BROWSER_PENDING' if plan.get('publicPackage') else 'PASSED', 'head': plan['head'], 'runId': os.environ['GITHUB_RUN_ID'], 'baseImages': bases, 'results': results}
    (out / 'native-runtime.json').write_text(json.dumps(report, indent=2))
    if plan.get('publicPackage'):
        env['P6_BROWSER_CONTEXT'] = str(browser_context)
        try:
            run('package-browser', ['node', 'server-version/e2e/school-teacher-package-browser.cjs'])
            browser = json.loads((out / 'package-browser.json').read_text())
            runtime.require(browser['status'] == 'PASSED' and browser['head'] == plan['head'] and browser['runId'] == env['GITHUB_RUN_ID'], 'Missing current browser connection')
            report['status'] = 'PASSED'
            report['browserSha256'] = hashlib.sha256((out / 'package-browser.json').read_bytes()).hexdigest()
            (out / 'native-runtime.json').write_text(json.dumps(report, indent=2))
        finally:
            shutil.rmtree(browser_context)



if __name__ == '__main__':
    main()
