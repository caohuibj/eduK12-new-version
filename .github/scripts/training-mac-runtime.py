"""Second frozen candidate only: original Linux dependencies, missing checks once."""
import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import zipfile

ROOT = Path(__file__).resolve().parents[2]
INPUTS = Path(__file__).with_name('training-mac-inputs.json')
SPEC = importlib.util.spec_from_file_location('measurement_runtime', Path(__file__).with_name('exact-candidate-runtime.py'))
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)
PHASES = ('prepare', 'backend-compile', 'frontend-compile', 'frontend-app-types', 'changed-lint', 'dependency-audit',
          'compiled-browser', 'scoped-pg-http', 'runtime-packaging', 'runtime-scans', 'schema-upgrade-restore')
INTEGRATION_FILES = ('src/__tests__/controllers/trainingCatalog.boundaries.postgres.test.ts',
                     'src/__tests__/integration/training-mac-export.postgres.integration.test.ts')
LEGACY_EXTRA = """
INSERT INTO questionnaires(id,code,name,creator_id,updated_at)
 VALUES ('exact-mac-questionnaire','exact-mac-questionnaire','Synthetic retained tags','exact-admin',now());
INSERT INTO cognitive_test_configs(id,test_type,config_version,name,engine_version,scoring_version,updated_at)
 VALUES ('exact-mac-config','SYNTHETIC_ONLY','1','Synthetic retained tags','1','1',now());
INSERT INTO cognitive_assignments(id,config_id,title,created_by,updated_at)
 VALUES ('exact-mac-cognitive','exact-mac-config','Synthetic retained tags','exact-admin',now());
"""


def validate_dependency_patch(inputs):
    patch = inputs['macRuntime']['dependencyPatch']
    R.require((patch['name'], patch['fromVersion'], patch['toVersion']) == ('follow-redirects', '1.16.0', '1.16.1'), 'Unexpected dependency repair')
    R.require(patch['tarball'] == 'https://registry.npmjs.org/follow-redirects/-/follow-redirects-1.16.1.tgz' and
              patch['integrity'] == 'sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==' and
              patch['tarSha256'] == '6e075d999dc5ff568916954508397b11a537b18bde615986d7bd8b3d3fa1799f' and patch['tarBytes'] == 10076, 'Unreviewed official package bytes')
    paths = ['server-version/' + c + '/' + p for c in R.COMPONENTS for p in ('package.json', 'package-lock.json')]
    R.require(sorted(patch['reviewedSourceFiles']) == sorted(paths), 'Unexpected dependency source boundary')
    logo = inputs['macRuntime']['logoDelta']
    logo_paths = ['src/components/app-shell/__tests__/shell.test.tsx', 'src/training/TrainingAuth.test.tsx',
        'src/training/TrainingBrand.tsx', 'src/training/TrainingScreens.test.tsx', 'src/training/training-book-mountain.svg',
        'src/training/training-brand.css', 'src/training/training-home-brand.css', 'src/training/training-logo.svg']
    R.require(len(logo) == 8 and sorted(row['path'] for row in logo) == sorted('server-version/frontend/' + p for p in logo_paths), 'Unexpected logo source boundary')
    R.require(sorted(inputs['runtime']['changedFrontendFiles']) == sorted(p for p in logo_paths if p.endswith('.tsx')), 'Wrong affected logo lint selection')
    vite_pins = inputs['macRuntime']['vitePatch']
    R.require(set(vite_pins) == set(R.COMPONENTS), 'Missing exact Vite repair')
    for component in R.COMPONENTS:
        vite = vite_pins[component]
        old_version, new_version, tar_hash, tar_bytes = (('7.3.6', '7.3.7', '61819c1c5e0b526a012b39b5d4dfb9d10875ced139554f9105a8999990ce7b08', 544713)
            if component == 'backend' else ('6.4.3', '6.4.4', '09242e9a1f45c17ef96402dc1b39cfcf93b6a65a5bc965622641be50830fa71b', 635040))
        R.require((vite['name'], vite['fromVersion'], vite['toVersion'], vite['tarSha256'], vite['tarBytes']) == ('vite', old_version, new_version, tar_hash, tar_bytes)
                  and vite['tarball'] == 'https://registry.npmjs.org/vite/-/vite-' + new_version + '.tgz', 'Unreviewed Vite repair bytes')
        previous = patch['originalComponents'][component]
        current_tree = R.git('rev-parse', 'HEAD:server-version/' + component)
        changed = R.git('diff', '--name-only', previous['sourceTree'], current_tree).splitlines()
        expected_paths = ['package-lock.json', 'package.json']
        if component == 'frontend':
            expected_paths += logo_paths
            for row in logo:
                path = row['path'].removeprefix('server-version/frontend/')
                R.require(set(row) == {'path', 'before', 'after'} and (row['before'] is None) == (path == 'src/training/training-logo.svg'), 'Unexpected logo file addition')
                for field, tree in [('before', previous['sourceTree']), ('after', current_tree)]:
                    expected = row[field]
                    actual = R.git('ls-tree', tree, '--', path)
                    if expected is None:
                        R.require(actual == '', 'Logo addition already existed')
                    else:
                        R.require(set(expected) == {'mode', 'blob'} and expected['mode'] == '100644' and bool(re.fullmatch('[0-9a-f]{40}', expected['blob'])), 'Invalid logo file identity')
                        R.require(actual == '100644 blob ' + expected['blob'] + '\t' + path, 'Changed frozen logo file')
        R.require(sorted(changed) == sorted(expected_paths), 'Changed source outside exact dependency/logo repair')
        old = {}
        current = {}
        for path in ('package.json', 'package-lock.json'):
            R.require(R.git('ls-tree', previous['sourceTree'], '--', path).startswith('100644 blob ') and
                      R.git('ls-tree', current_tree, '--', path).startswith('100644 blob '), 'Nonregular dependency source')
            raw = subprocess.check_output(['git', 'show', previous['sourceTree'] + ':' + path], cwd=ROOT)
            old[path] = json.loads(raw)
            current[path] = json.loads((ROOT / 'server-version' / component / path).read_text())
            if path == 'package-lock.json':
                R.require(R.digest(raw) == previous['lockfileSha256'] == inputs['macRuntime']['dependencySources'][component]['lockfileSha256'], 'Original lock identity changed')
        lock = copy.deepcopy(old['package-lock.json'])
        entry = lock['packages']['node_modules/follow-redirects']
        R.require(entry['version'] == '1.16.0', 'Wrong original package')
        entry.update(version='1.16.1', resolved=patch['tarball'], integrity=patch['integrity'])
        package = copy.deepcopy(old['package.json'])
        if component == 'backend':
            R.require(package['overrides']['follow-redirects'] == '1.16.0', 'Wrong original override')
            package['overrides']['follow-redirects'] = '1.16.1'
        declaration = '' if component == 'backend' else '^'
        R.require(package['devDependencies']['vite'] == declaration + old_version and
                  lock['packages']['']['devDependencies']['vite'] == declaration + old_version and
                  lock['packages']['node_modules/vite']['version'] == old_version, 'Wrong original Vite source')
        package['devDependencies']['vite'] = declaration + new_version
        lock['packages']['']['devDependencies']['vite'] = declaration + new_version
        lock['packages']['node_modules/vite'].update(version=new_version, resolved=vite['tarball'], integrity=vite['integrity'])
        R.require(current['package-lock.json'] == lock, 'Unreviewed dependency lock delta')
        R.require(current['package.json'] == package, 'Unreviewed package manifest delta')
    return patch


def validate_plan(plan, inputs):
    R.require(plan.get('schema') == 1 and plan.get('route') == 'exact-candidate' and plan.get('candidate') == 'training-mac', 'Wrong Mac plan')
    for key in ('head', 'sourceHead', 'tree', 'base'):
        R.require(bool(re.fullmatch('[0-9a-f]{40}', plan.get(key, ''))), 'Missing frozen identity')
    R.require(plan['head'] == R.git('rev-parse', 'HEAD') and plan['tree'] == R.git('rev-parse', 'HEAD^{tree}'), 'Wrong checkout')
    for key in ('components', 'runtime', 'macRuntime'):
        R.require(plan[key] == inputs[key], 'Unreviewed Mac runtime input')
    R.require(plan['base'] == inputs['runtime']['base'] == '9e1b302e1e255050b15ab150905bc69cee1b3c1b', 'Wrong main baseline')
    R.require(inputs['macRuntime']['requiredRuntimePhases'] == list(PHASES), 'Missing mandatory phase')
    R.require(set(PHASES) - {'prepare'} <= set(plan['required']), 'Incomplete required plan')
    validate_dependency_patch(inputs)
    original = json.loads(R.INPUTS.read_text())['components']
    R.require(inputs['macRuntime']['dependencySources'] == original, 'Changed official dependency producers')
    for component in R.COMPONENTS:
        pin = inputs['components'][component]
        R.require(pin['sourceTree'] == R.git('rev-parse', 'HEAD:server-version/' + component), 'Changed current component')
        R.require(R.input_inventory(component, pin['excludedNonProductionPaths']) == pin['productionInputSha256'], 'Changed current inputs')
        R.require(R.sha(ROOT / 'server-version' / component / 'package-lock.json') == pin['lockfileSha256'], 'Dependency lock changed')
        # Package/lock delta is checked structurally above; runtime recipe stays exact.
        for path in ('Dockerfile',):
            R.require(R.git('rev-parse', 'HEAD:server-version/' + component + '/' + path) == R.git('rev-parse', plan['base'] + ':server-version/' + component + '/' + path), 'Dependency/runtime recipe changed')
    added, old = R.migration_inputs(plan['base'])
    R.require(old and added == inputs['runtime']['newMigrations'] == ['20261021000000_training_catalog_discovery'], 'Unexpected migration delta')
    subprocess.run(['git', 'diff', '--exit-code', 'HEAD', '--'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)


def cognitive_subsumption(context):
    app = json.loads((context / 'tsconfig.app.json').read_text())
    cognitive = json.loads((context / 'tsconfig.cognitive.json').read_text())
    R.require(app['include'] == ['src', 'examples'] and not app.get('exclude'), 'Changed app type roots')
    R.require(cognitive['extends'] == './tsconfig.app.json' and set(cognitive['compilerOptions']) == {'tsBuildInfoFile'}, 'Changed cognitive compiler semantics')
    R.require(not cognitive.get('exclude') and cognitive.get('references') == [], 'Changed cognitive references')
    R.require(cognitive['include'] and all(p == 'src' or p.startswith('src/') for p in cognitive['include']), 'Cognitive roots not covered')
    return {'commandExecuted': 'tsc -p tsconfig.app.json --noEmit', 'cognitiveCommandExecuted': False,
            'reason': 'Cognitive inherits identical semantic options and only narrows app src roots; build-info output differs only.',
            'appConfigSha256': R.sha(context / 'tsconfig.app.json'), 'cognitiveConfigSha256': R.sha(context / 'tsconfig.cognitive.json')}


def require_test_report(report):
    R.require(report.get('success') is True and report.get('numTotalTests') == report.get('numPassedTests') == 4, 'Missing exact four integration assertions')
    R.require(all(report.get(k) == 0 for k in ('numFailedTests', 'numPendingTests', 'numTodoTests')), 'Skipped/failed integration assertions')
    rows = report.get('testResults', [])
    R.require(len(rows) == 2 and {next((f for f in INTEGRATION_FILES if row['name'].endswith(f)), None) for row in rows} == set(INTEGRATION_FILES), 'Unexpected integration files')
    cases = [case for row in rows for case in row.get('assertionResults', [])]
    R.require(len(cases) == 4 and all(c['status'] == 'passed' for c in cases), 'Unrun integration case')
    return {'passed': 4, 'failed': 0, 'skipped': 0, 'files': list(INTEGRATION_FILES), 'caseNames': [c['fullName'] for c in cases]}


def require_browser_report(report, expected):
    fixed = ['course-shell-1440', 'analysis-reference-1440', 'pending-publication-1440',
             'course-shell-390', 'analysis-reference-390', 'pending-publication-390']
    R.require(expected == fixed, 'Changed selected browser assertions')
    R.require(report.get('schema') == 1 and report.get('status') == 'PASS' and
              report.get('kind') == 'compiled-ui-synthetic-api-integration' and report.get('errors') == [], 'Invalid browser result')
    checks = report.get('checks', [])
    R.require([a['name'] for a in checks] == fixed and all(a['status'] == 'PASS' for a in checks), 'Failed/missing browser assertion')
    return checks


class MacQualification(R.Qualification):
    def __init__(self, plan, output):
        self.plan_path = Path(plan)
        self.plan = json.loads(self.plan_path.read_text())
        self.inputs = json.loads(INPUTS.read_text())
        self.dependency_pins = copy.deepcopy(self.inputs['macRuntime']['dependencySources'])
        self.out = Path(output).resolve(); self.out.mkdir(parents=True, exist_ok=True)
        self.identity = {'schema': 1, 'candidate': 'training-mac', **{k: self.plan[k] for k in ('head', 'sourceHead', 'tree')},
                         'planSha256': R.sha(self.plan_path), 'inputsSha256': R.sha(INPUTS),
                         'consumerRunId': os.environ.get('GITHUB_RUN_ID'), 'consumerAttempt': os.environ.get('GITHUB_RUN_ATTEMPT')}
        suffix = R.digest(R.canonical(self.identity))[:16]
        self.private = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / ('mac-runtime-' + suffix)
        R.require(not self.private.exists() and not self.out.is_relative_to(self.private) and not self.private.is_relative_to(self.out), 'Existing or overlapping private context')
        self.private.mkdir(mode=0o700)
        self.prefix = 'mac-' + suffix
        self.state_path = self.private / 'state.json'
        self.state = {**self.identity, 'status': 'running', 'phases': [], 'components': {}}
        self.command_index = 0
        self.schema_active = False
        self.fixture_counts = {'legacy': 0, 'candidate': 0}

    def producer(self, component):
        p = self.dependency_pins[component]
        return {'dependencySource': {k: p[k] for k in ('repository', 'runId', 'attempt', 'head', 'jobId', 'artifactId', 'zipSha256', 'archiveSha256', 'receiptSha256', 'lockfileSha256')},
                'currentSourceTree': self.inputs['components'][component]['sourceTree'],
                'currentSourceHead': self.plan['sourceHead'], 'originalDistAdmitted': False}

    def prepare(self):
        validate_plan(self.plan, self.inputs)
        R.require(self.command(['node', '--version']).stdout.strip() == 'v24.21.0', 'Wrong Node runtime')
        for component in R.COMPONENTS:
            pin = self.dependency_pins[component]
            R.validate_producer(pin, self.api('/actions/runs/' + pin['runId']), self.api('/actions/jobs/' + str(pin['jobId'])), self.api('/actions/artifacts/' + str(pin['artifactId'])))
            archive = self.private / (component + '-original.zip'); self.download(pin, archive)
            compiled = self.private / (component + '-original.tar.gz')
            with zipfile.ZipFile(archive) as zipped:
                R.require(set(zipped.namelist()) == {component + '-build.json', component + '-build.tar.gz'} and len(zipped.namelist()) == 2, 'Unexpected dependency ZIP')
                receipt = R.validate_receipt(component, pin, zipped.read(component + '-build.json'))
                with zipped.open(component + '-build.tar.gz') as src, compiled.open('wb') as dst: shutil.copyfileobj(src, dst)
            R.require(R.sha(compiled) == pin['archiveSha256'], 'Changed dependency archive')
            original = self.private / (component + '-original'); R.safe_extract(compiled, original, {'dist', 'node_modules'})
            context = self.private / component
            source = self.private / (component + '-source.tar')
            self.command(['git', 'archive', '--format=tar', '--output=' + str(source), 'HEAD:server-version/' + component])
            R.safe_extract(source, context)
            for path, expected in receipt['requiredFiles'].items():
                R.require(R.sha((original if path.startswith('dist/') else context) / path) == expected, 'Original dependency/source asset mismatch')
            R.require(not (context / 'dist').exists() and not (context / 'node_modules').exists(), 'Unexpected tracked generated output')
            shutil.move(original / 'node_modules', context / 'node_modules')
            shutil.rmtree(original)
            self.state['components'][component] = {'producer': self.producer(component), 'dependencyArchiveSha256': pin['archiveSha256']}
            self.save()
        for path, expected in self.inputs['runtime']['frontendExternalInputs'].items():
            R.require(path == 'server-version/cognitive-randomization-golden-v1.json' and R.git('rev-parse', 'HEAD:' + path) == expected['gitBlob'], 'Changed external type fixture')
            raw = subprocess.check_output(['git', 'show', 'HEAD:' + path], cwd=ROOT)
            R.require(R.digest(raw) == expected['sha256'], 'Changed external fixture bytes')
            (self.private / Path(path).name).write_bytes(raw)
        patched = self.apply_dependency_patch()
        vite = self.apply_vite_patch()
        return {'officialDependenciesVerified': True, 'originalDistConsumed': False, 'dependencyInstallCommandExecuted': False, 'sourceLockedPackageOverlayApplied': True, 'dependencyPatch': patched, 'vitePatch': vite}

    def compile_component(self, component):
        self.ready('prepare')
        context = self.private / component
        if component == 'backend':
            self.command(['env', 'PRISMA_GENERATE_SKIP_AUTOINSTALL=1', 'node', 'node_modules/prisma/build/index.js', 'generate', '--schema', 'prisma/schema.prisma'], cwd=context, timeout=180)
            self.command(['node', 'node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], cwd=context, timeout=600)
        else:
            self.command(['env', 'VITE_COGNITIVE_MODULE_ENABLED=true', 'TZ=UTC', 'node', 'node_modules/vite/bin/vite.js', 'build'], cwd=context, timeout=600)
        required = list(self.dependency_pins[component]['requiredFiles'])
        hashes = {path: R.sha(context / path) for path in required}
        self.inputs['components'][component]['requiredFiles'] = hashes
        archive = self.out / (component + '-compiled.tar.gz')
        members = ['dist', 'node_modules/.prisma/client'] if component == 'backend' else ['dist']
        self.command(['tar', '-czf', str(archive), *members], cwd=context, timeout=180)
        result = {'sourceTree': self.inputs['components'][component]['sourceTree'], 'requiredFiles': hashes,
                  'archivePath': archive.name, 'archiveSha256': R.sha(archive), 'archiveMembers': members, 'dependencySource': self.producer(component)['dependencySource'],
                  'command': 'prisma generate + tsc -p tsconfig.json' if component == 'backend' else 'vite build',
                  'buildPrerequisitesReplayed': False, 'nodeVersion': 'v24.21.0',
                  'buildFlags': {'VITE_COGNITIVE_MODULE_ENABLED': 'true', 'TZ': 'UTC'} if component == 'frontend' else {}, 'reason': self.inputs['macRuntime']['compileReasons'][component]}
        if component == 'backend': result['generatedSchemaSha256'] = R.sha(context / 'node_modules/.prisma/client/schema.prisma')
        self.state['components'][component].update(requiredFiles=hashes, compiledArchiveSha256=result['archiveSha256'])
        return result

    def app_types(self):
        proof = cognitive_subsumption(self.private / 'frontend')
        super().app_types()
        return proof

    def apply_vite_patch(self):
        import base64
        result = {}
        for component, pin in self.inputs['macRuntime']['vitePatch'].items():
            with R.urllib.request.urlopen(R.urllib.request.Request(pin['tarball']), timeout=60) as response:
                R.require(response.geturl() == pin['tarball'], 'Unexpected Vite archive redirect')
                raw = response.read(pin['tarBytes'] + 1)
            R.require(len(raw) == pin['tarBytes'] and R.digest(raw) == pin['tarSha256'] and
                'sha512-' + base64.b64encode(R.hashlib.sha512(raw).digest()).decode() == pin['integrity'], 'Official Vite archive mismatch')
            archive = self.private / (component + '-vite.tgz'); archive.write_bytes(raw)
            unpacked = self.private / (component + '-vite'); R.safe_extract(archive, unpacked, {'package'})
            context = self.private / component; target = context / 'node_modules/vite'
            R.require(target.is_dir() and not target.is_symlink(), 'Wrong installed Vite path')
            old = json.loads((target / 'package.json').read_text()); new = json.loads((unpacked / 'package/package.json').read_text())
            R.require(old['name'] == new['name'] == 'vite' and old['version'] == pin['fromVersion'] and new['version'] == pin['toVersion'], 'Wrong Vite package version')
            R.require(all(old.get(k) == new.get(k) for k in ('dependencies', 'peerDependencies', 'optionalDependencies', 'types', 'exports', 'bin', 'engines', 'type', 'scripts')), 'Unexpected Vite dependency/API delta')
            lock = json.loads((context / 'package-lock.json').read_text())['packages']['node_modules/vite']
            R.require(all(lock[k] == pin[v] for k, v in [('version', 'toVersion'), ('resolved', 'tarball'), ('integrity', 'integrity')]), 'Vite patch differs from source lock')
            shutil.rmtree(target); shutil.move(unpacked / 'package', target)
            hidden = context / 'node_modules/.package-lock.json'
            if hidden.exists():
                data = json.loads(hidden.read_text()); entry = data['packages']['node_modules/vite']
                R.require(entry['version'] == pin['fromVersion'], 'Wrong hidden Vite lock')
                entry.update(version=pin['toVersion'], resolved=pin['tarball'], integrity=pin['integrity'])
                hidden.write_text(json.dumps(data, indent=2) + '\n')
            result[component] = {k: pin[k] for k in ('fromVersion', 'toVersion', 'tarSha256', 'integrity')}
        self.state['vitePatch'] = result
        return result

    def compile_patched_frontend(self, original, archive):
        R.require(original['name'] == 'frontend-compile' and original['status'] == 'success', 'Wrong original frontend reference')
        archive = Path(archive).resolve(); details = original['details']
        R.require(archive.is_relative_to(self.private) and R.sha(archive) == details['archiveSha256'], 'Changed original frontend archive')
        reference = self.private / 'frontend-comparison'
        R.safe_extract(archive, reference, {'dist'})
        result = self.compile_component('frontend')
        def inventory(root):
            rows = {}
            for path in sorted(root.rglob('*')):
                R.require(not path.is_symlink() and (path.is_dir() or path.is_file()), 'Nonregular compiled frontend member')
                if path.is_file(): rows[path.relative_to(root).as_posix()] = R.sha(path)
            R.require(rows and 'index.html' in rows, 'Missing compiled frontend comparison')
            return rows
        before = inventory(reference / 'dist'); after = inventory(self.private / 'frontend/dist')
        comparison = {'equal': before == after, 'originalArchiveSha256': details['archiveSha256'], 'currentArchiveSha256': result['archiveSha256'],
            'filesCompared': len(set(before) | set(after)), 'originalInventorySha256': R.digest(R.canonical(before)), 'currentInventorySha256': R.digest(R.canonical(after)),
            'originalFileCount': len(before), 'currentFileCount': len(after)}
        result['distEquality'] = comparison
        self.state['components']['frontend']['distEquality'] = comparison
        return result

    def apply_dependency_patch(self):
        import base64
        import io
        patch = self.inputs['macRuntime']['dependencyPatch']
        request = R.urllib.request.Request(patch['tarball'])
        with R.urllib.request.urlopen(request, timeout=60) as response:
            R.require(response.geturl() == patch['tarball'], 'Unexpected npm tarball redirect')
            raw = response.read(patch['tarBytes'] + 1)
        R.require(len(raw) == patch['tarBytes'] and R.digest(raw) == patch['tarSha256'] and
                  'sha512-' + base64.b64encode(R.hashlib.sha512(raw).digest()).decode() == patch['integrity'], 'Official dependency archive mismatch')
        files = {row['path']: row for row in patch['files']}
        R.require(len(files) == len(patch['files']) == 7 and set(files) == {'LICENSE', 'README.md', 'debug.js', 'http.js', 'https.js', 'index.js', 'package.json'}, 'Unexpected package inventory')
        contents = {}
        with R.tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as tar:
            members = tar.getmembers()
            R.require(len(members) == 7 and {m.name for m in members} == {'package/' + p for p in files}, 'Unexpected npm archive paths')
            for member in members:
                name = member.name.removeprefix('package/')
                R.require(member.isfile() and member.size == files[name]['bytes'] and not member.mode & 0o6000, 'Unsafe npm archive member')
                data = tar.extractfile(member).read()
                R.require(R.digest(data) == files[name]['sha256'], 'Changed package file')
                contents[name] = data
        package = json.loads(contents['package.json'])
        R.require(package['name'] == patch['name'] and package['version'] == patch['toVersion'] and not package.get('dependencies') and not package.get('types') and
                  not set(package.get('scripts', {})).intersection({'preinstall', 'install', 'postinstall', 'prepare'}), 'Unexpected executable package install contract')
        for component in R.COMPONENTS:
            context = self.private / component
            target = context / 'node_modules/follow-redirects'
            R.require(target.is_dir() and not target.is_symlink() and json.loads((target / 'package.json').read_text())['version'] == patch['fromVersion'], 'Wrong base installed dependency')
            lock = json.loads((context / 'package-lock.json').read_text())['packages']['node_modules/follow-redirects']
            R.require(lock['version'] == patch['toVersion'] and lock['integrity'] == patch['integrity'] and lock['resolved'] == patch['tarball'], 'Patch differs from source lock')
            shutil.rmtree(target); target.mkdir()
            for name, data in contents.items(): (target / name).write_bytes(data)
            hidden = context / 'node_modules/.package-lock.json'
            if hidden.exists():
                metadata = json.loads(hidden.read_text())
                entry = metadata['packages']['node_modules/follow-redirects']
                R.require(entry['version'] == patch['fromVersion'], 'Unexpected hidden lock dependency')
                entry.update(version=patch['toVersion'], resolved=patch['tarball'], integrity=patch['integrity'])
                hidden.write_text(json.dumps(metadata, indent=2) + '\n')
        result = {'name': patch['name'], 'fromVersion': patch['fromVersion'], 'toVersion': patch['toVersion'],
                  'tarSha256': patch['tarSha256'], 'integrity': patch['integrity'], 'files': patch['files'],
                  'components': list(R.COMPONENTS), 'installScriptsExecuted': False, 'otherDependenciesChanged': False}
        self.state['dependencyPatch'] = result
        return result

    def audit(self):
        # Both source locks contain the changed package. Old audit is not inherited.
        self.ready('prepare')
        result = {}
        for component in R.COMPONENTS:
            context = self.private / component
            command = ['npm', '--prefix', str(context), '--registry=https://registry.npmjs.org', '--replace-registry-host=always', 'audit', '--audit-level=high', '--json']
            audit = self.command(command, accepted=(0, 1))
            data = json.loads(audit.stdout)
            R.require('error' not in data and isinstance(data.get('metadata', {}).get('vulnerabilities'), dict), 'No valid dependency audit')
            counts = data['metadata']['vulnerabilities']
            R.require(all(type(counts.get(k)) is int for k in ('high', 'critical')), 'Incomplete dependency audit')
            lock = json.loads((context / 'package-lock.json').read_text())['packages']
            # Publish only bounded package/advisory identities, never raw npm
            # output, paths, environment, registry credentials or message text.
            def safe(value, pattern, limit=200):
                return value if isinstance(value, str) and len(value) <= limit and re.fullmatch(pattern, value) else None
            package_pattern = r'(?:@[a-z0-9._-]+/)?[a-z0-9._-]+'
            version_pattern = r'[0-9A-Za-z.*+<>=~^| -]+'
            findings = []
            for name, row in sorted(data.get('vulnerabilities', {}).items()):
                if row.get('severity') not in ('high', 'critical'): continue
                name = safe(name, package_pattern)
                if name is None: continue
                versions = sorted({p['version'] for path, p in lock.items() if path and
                    (p.get('name') or path.rsplit('node_modules/', 1)[-1]) == name and safe(p.get('version'), version_pattern)})
                advisories = []
                for via in row.get('via', []):
                    if not isinstance(via, dict): continue
                    source = via.get('source')
                    url = safe(via.get('url'), r'https://(?:github\.com/(?:advisories|[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/security/advisories)/GHSA-[a-z0-9-]+|www\.npmjs\.com/advisories/[0-9]+)')
                    cves = sorted(set(re.findall(r'CVE-[0-9]{4}-[0-9]{4,}', json.dumps({k: via.get(k) for k in ('cve', 'cves', 'title')}))))
                    advisories.append({'source': source if type(source) is int else None, 'url': url,
                        'range': safe(via.get('range'), version_pattern), 'cves': cves})
                fix = row.get('fixAvailable')
                if isinstance(fix, dict):
                    fix = {'name': safe(fix.get('name'), package_pattern), 'version': safe(fix.get('version'), version_pattern),
                           'isSemVerMajor': fix.get('isSemVerMajor') if type(fix.get('isSemVerMajor')) is bool else None}
                elif type(fix) is not bool: fix = None
                findings.append({'name': name, 'severity': row['severity'], 'installedVersions': versions,
                    'range': safe(row.get('range'), version_pattern), 'fixAvailable': fix, 'advisories': advisories})
            result[component] = {'vulnerabilities': counts, 'auditLevel': 'high', 'exitCode': audit.returncode,
                'lockfileSha256': self.inputs['components'][component]['lockfileSha256'], 'blockingFindings': findings}
            (self.out / (component + '-audit.json')).write_text(json.dumps(result[component], indent=2) + '\n')
            R.require(audit.returncode == 0 and counts['high'] == counts['critical'] == 0, 'High/critical dependency vulnerabilities')
        return result

    def browser(self):
        self.ready('frontend-compile')
        equality = self.state['components']['frontend']['distEquality']
        R.require(type(equality.get('equal')) is bool and equality['currentArchiveSha256'] == self.state['components']['frontend']['compiledArchiveSha256'], 'Missing exact compiled-byte comparison')
        if equality['equal']:
            spec = importlib.util.spec_from_file_location('mac_completed_browser', Path(__file__).with_name('training-mac-runtime-reuse.py'))
            module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
            return module.admit_prior_browser_success(self)
        pin = self.inputs['macRuntime']
        script = '.github/scripts/training-mac-browser.mjs'
        R.require(pin['browserScriptBlob'] == R.git('rev-parse', 'HEAD:' + script), 'Unreviewed browser fixture')
        # Only changed compiled bytes need a new browser execution. Use a
        # per-command signed official Ubuntu source list, not runner mirrors.
        sources = self.private / 'font-official-sources.list'
        sources.write_text('deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] https://archive.ubuntu.com/ubuntu noble main universe\n'
                           'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] https://archive.ubuntu.com/ubuntu noble-updates main universe\n'
                           'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] https://security.ubuntu.com/ubuntu noble-security main universe\n')
        apt = ['sudo', 'apt-get', '-o', 'Dir::Etc::sourcelist=' + str(sources), '-o', 'Dir::Etc::sourceparts=-', '-o', 'APT::Update::Error-Mode=any']
        self.command([*apt, 'update'], timeout=180)
        self.command([*apt, 'install', '-y', '--no-install-recommends', 'fonts-noto-cjk'], timeout=180)
        font = Path(self.command(['fc-match', '--format=%{file}', 'Noto Sans CJK SC']).stdout.strip()).resolve()
        family = self.command(['fc-match', '--format=%{family}', 'Noto Sans CJK SC']).stdout.strip()
        R.require(font.is_file() and font.is_relative_to('/usr/share/fonts') and 'Noto Sans CJK SC' in family, 'CJK font unavailable')
        owner = self.command(['dpkg-query', '-S', str(font)]).stdout.strip()
        R.require(owner.startswith('fonts-noto-cjk:'), 'Unexpected CJK font package')
        font_receipt = {'package': 'fonts-noto-cjk', 'version': self.command(['dpkg-query', '-W', '-f=${Version}', 'fonts-noto-cjk']).stdout.strip(),
                        'family': family, 'fileSha256': R.sha(font), 'source': 'signed official Ubuntu noble archives'}
        browsers = self.private / 'browsers'
        module = self.private / 'backend/node_modules/playwright-core'
        self.command(['env', 'PLAYWRIGHT_BROWSERS_PATH=' + str(browsers), 'node', str(module / 'cli.js'), 'install', 'chromium'], timeout=600)
        output = self.out / 'browser'
        self.command(['env', 'PLAYWRIGHT_BROWSERS_PATH=' + str(browsers), 'node', script,
                      '--frontend-dir', str(self.private / 'frontend/dist'), '--playwright-module', str(module), '--output', str(output)], timeout=180)
        report = json.loads((output / 'browser-result.json').read_text())
        checks = require_browser_report(report, pin['browserExpectedAssertions'])
        return {'resultSha256': R.sha(output / 'browser-result.json'), 'checks': checks, 'cjkFont': font_receipt, 'frontendCompiledArchiveSha256': self.state['components']['frontend']['compiledArchiveSha256']}

    def failure_receipt(self, error):
        details = {'errorType': type(error).__name__, 'phase': next((p['name'] for p in reversed(self.state['phases']) if p['status'] in ('running', 'failure')), 'initialization')}
        locations = []
        frame = error.__traceback__
        while frame:
            code = frame.tb_frame.f_code
            if code.co_filename in (__file__, R.__file__):
                locations.append({'helper': code.co_name, 'line': frame.tb_lineno, 'module': Path(code.co_filename).name})
            frame = frame.tb_next
        details['locations'] = locations
        details['commandKind'] = getattr(self, 'last_command_kind', 'none')
        # Compiler diagnostics need their actual error text. Other commands may
        # contain SQL/row data and retain only the structured summaries below.
        log = self.private / ('command-' + str(self.command_index) + '.log')
        compiler_output = None
        if log.is_file():
            compiler_output = log.read_text(errors='replace')
            diagnostics = []
            for match in re.finditer(r'(?m)^(?P<file>(?:src|examples)/[A-Za-z0-9_./@+ -]+\.tsx?)\((?P<line>[0-9]+),(?P<column>[0-9]+)\): error (?P<code>TS[0-9]+):', compiler_output):
                diagnostics.append(match.groupdict())
            details['typescriptDiagnostics'] = diagnostics[:100]
        elif isinstance(error, subprocess.TimeoutExpired):
            parts = [getattr(error, key, None) for key in ('stdout', 'stderr')]
            compiler_output = '\n'.join(p.decode(errors='replace') if isinstance(p, bytes) else p for p in parts if p)
        if compiler_output is not None and details['commandKind'] in ('vite', 'typescript', 'eslint'):
            sanitized = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', compiler_output)
            sanitized = re.sub(r'[\x00-\x08\x0b-\x1f\x7f]', '', sanitized)
            for key, value in os.environ.items():
                if value and re.search(r'(?i)(token|secret|password|passwd|credential|cookie|authorization|private.?key|api.?key)', key):
                    sanitized = sanitized.replace(value, '[redacted-secret]')
            sanitized = re.sub(r'-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----', '[redacted-private-key]', sanitized, flags=re.S)
            sanitized = re.sub(r'(?i)\b(?:https?|postgres(?:ql)?|redis)://[^\s\x22\x27<>]+', '[redacted-url]', sanitized)
            sanitized = re.sub(r'(?i)\b(?:bearer|basic)\s+[A-Za-z0-9+/=_\-.]+', '[redacted-authorization]', sanitized)
            sanitized = re.sub(r'(?i)((?:token|secret|password|passwd|api[_-]?key|authorization|cookie)[\x22\x27]?\s*[:=]\s*)(?:\x22[^\x22]*\x22|\x27[^\x27]*\x27|[^\s,;}]+)', r'\1[redacted-secret]', sanitized)
            sanitized = re.sub(r'\b(?:gh[pousr]_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b', '[redacted-token]', sanitized)
            for path, label in ((str(self.private), '[isolated-workdir]'), (str(ROOT), '[checkout]'), (str(Path.home()), '[runner-home]')):
                if path != '/': sanitized = sanitized.replace(path, label)
            limit = 24000
            truncated = len(sanitized) > limit
            if truncated: sanitized = sanitized[:limit // 2] + '\n[output truncated]\n' + sanitized[-limit // 2:]
            details['sanitizedCommandOutput'] = {'stdoutAndStderr': sanitized, 'truncated': truncated,
                'rawOutputSha256': R.digest(compiler_output.encode()), 'scope': 'failed compiler output only; credentials and private path prefixes redacted'}
        reporter = self.private / 'integration-result.json'
        if reporter.is_file():
            try:
                report = json.loads(reporter.read_text())
                details['integrationCounts'] = {k: report.get(k) for k in ('numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests')}
                # Names are compiled from the exact public fixture, not user data.
                details['failedCases'] = [c.get('fullName', '')[:240] for row in report.get('testResults', [])
                                          for c in row.get('assertionResults', []) if c.get('status') != 'passed']
            except (ValueError, TypeError):
                details['integrationReporterInvalid'] = True
        (self.out / 'failure-details.json').write_text(json.dumps({**self.identity, **details}, indent=2) + '\n')

    def command(self, args, **kwargs):
        prefix = "SET statement_timeout='20s'; SET lock_timeout='5s';\n"
        original_input = kwargs.get('input')
        if self.schema_active and original_input == prefix + R.LEGACY_SQL:
            kwargs['input'] += LEGACY_EXTRA
            self.fixture_counts['legacy'] += 1
        kind = next((name for token, name in (('typescript/bin/tsc', 'typescript'), ('vite/bin/vite.js', 'vite'),
                    ('vitest/vitest.mjs', 'vitest'), ('prisma/build/index.js', 'prisma'), ('eslint/bin/eslint.js', 'eslint'),
                    ('pg_dump', 'pg-dump'), ('pg_restore', 'pg-restore'), ('psql', 'postgres-sql'), ('trivy', 'image-scan'))
                    if any(str(arg).endswith(token) for arg in args)), Path(args[0]).name)
        self.last_command_kind = kind
        try:
            completed = super().command(args, **kwargs)
        except Exception as error:
            if not (self.out / 'failure-details.json').exists(): self.failure_receipt(error)
            raise
        if self.schema_active and original_input == prefix + R.NEW_SQL:
            self.fixture_counts['candidate'] += 1
            self.verify_catalog_schema(args[3])
            self.phase('scoped-pg-http', lambda: self.integration(args[3]))
        return completed

    def verify_catalog_schema(self, postgres):
        context = self.private / 'backend'
        migration = context / 'prisma/migrations/20261021000000_training_catalog_discovery/migration.sql'
        lines = re.findall(r'CREATE INDEX "([a-z_]+)" ON "([a-z_]+)" (.+);', migration.read_text())
        R.require(len(lines) == 12, 'Unexpected index selection')
        expected = {name: 'CREATE INDEX ' + name + ' ON public.' + table + (' USING ' if not tail.startswith('USING ') else ' ') + (tail if tail.startswith('USING ') else 'btree ' + tail) for name, table, tail in lines}
        query = "SELECT json_object_agg(indexname,indexdef) FROM pg_indexes WHERE schemaname='public' AND indexname IN (" + ','.join("'" + name + "'" for name in expected) + ")"
        def sql(query):
            return super(MacQualification, self).command(['docker', 'exec', '-i', postgres, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'exact_owner', '-d', 'exact_upgrade_test'], input=query).stdout.strip()
        actual = json.loads(sql(query))
        expected = {name: value.replace('"', '').replace('USING GIN', 'USING gin') for name, value in expected.items()}
        R.require(actual == expected, 'Missing/changed catalog indexes')
        for table, row in (('questionnaires', 'exact-mac-questionnaire'), ('composite_assessments', 'exact-training'), ('cognitive_assignments', 'exact-mac-cognitive')):
            R.require(sql("SELECT tags = ARRAY[]::text[] FROM " + table + " WHERE id='" + row + "'") == 't', 'Additive tags did not preserve historical defaults')
        self.catalog_schema = {'newTagColumns': 3, 'historicalEmptyTagsVerified': True, 'newIndexes': actual}

    def integration(self, postgres):
        context = self.private / 'backend'
        run, attempt = os.environ['GITHUB_RUN_ID'], os.environ['GITHUB_RUN_ATTEMPT']
        R.require(re.fullmatch('[0-9]+', run) and re.fullmatch('[0-9]+', attempt), 'Missing official run identity')
        redis_name, test_name = 'training-mac-redis-' + run + '-' + attempt, self.prefix + '-tests'
        redis = self.base_image('redis:7.4.11-bookworm')
        attempted_redis = attempted_test = False
        raw = self.private / 'integration-result.json'
        try:
            names = self.command(['docker', 'container', 'ls', '--all', '--format', '{{.Names}}']).stdout.splitlines()
            R.require(redis_name not in names and test_name not in names, 'Existing integration resource')
            attempted_redis = True
            self.command(['docker', 'run', '-d', '--name', redis_name, '--network', 'container:' + postgres, redis, 'redis-server', '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no'])
            for _ in range(30):
                ready = self.command(['docker', 'exec', redis_name, 'redis-cli', 'ping'], accepted=(0, 1))
                if ready.returncode == 0 and ready.stdout.strip() == 'PONG': break
                time.sleep(1)
            else: raise ValueError('Disposable Redis not ready')
            metadata = json.loads(self.command(['docker', 'inspect', redis_name]).stdout)[0]
            redis_id, redis_image = metadata['Id'], metadata['Image']
            R.require(re.fullmatch('[0-9a-f]{64}', redis_id) and re.fullmatch('sha256:[0-9a-f]{64}', redis_image), 'Invalid disposable Redis identity')
            marker = 'training-mac:qualification:' + run + ':' + attempt
            value = ':'.join((redis_name, redis_id, redis_image))
            R.require(self.command(['docker', 'exec', redis_name, 'redis-cli', '-n', '15', 'SET', marker, value, 'EX', '900']).stdout.strip() == 'OK', 'Redis isolation marker missing')
            database = 'postgresql://exact_owner:synthetic-only@127.0.0.1:5432/exact_upgrade_test?schema=public'
            env = {'NODE_ENV': 'test', 'DATABASE_URL': database, 'RELEASE_INTEGRATION_DATABASE_URL': database,
                   'CATALOG_BOUNDARY_ISOLATED_TEST': '1', 'CATALOG_BOUNDARY_DATABASE_URL': database,
                   'REDIS_URL': 'redis://127.0.0.1:6379/15', 'DATA_ENCRYPTION_KEY': '31' * 32,
                   'CI': 'true', 'GITHUB_ACTIONS': 'true', 'GITHUB_RUN_ID': run, 'GITHUB_RUN_ATTEMPT': attempt,
                   'TRAINING_MAC_FIXTURE_CONTRACT': 'actions-isolated-v1', 'TRAINING_MAC_FIXTURE_REDIS_NAME': redis_name,
                   'TRAINING_MAC_FIXTURE_REDIS_ID': redis_id, 'TRAINING_MAC_FIXTURE_REDIS_IMAGE_DIGEST': redis_image,
                   'JWT_SECRET': 'synthetic-mac-integration-only-' + 'a' * 40}
            args = ['docker', 'run', '--rm', '--name', test_name, '--network', 'container:' + postgres,
                    '--user', str(os.getuid()) + ':' + str(os.getgid()), '--mount', f'type=bind,src={context},dst=/app',
                    '--mount', f'type=bind,src={self.private},dst=/evidence', '-w', '/app']
            for key, value in env.items(): args += ['-e', key + '=' + value]
            args += [self.state['components']['backend']['runtimeImageId'], 'node', 'node_modules/vitest/vitest.mjs', 'run', *INTEGRATION_FILES,
                     '--maxWorkers=1', '--reporter=json', '--outputFile=/evidence/integration-result.json']
            attempted_test = True
            self.command(args, timeout=300)
            report = require_test_report(json.loads(raw.read_text()))
            return {**report, 'rawReportSha256': R.sha(raw), 'transport': 'actual authentication middleware and handlers with captured Express transport; real export worker; no HTTP socket', 'redisImage': redis, 'redisContainerId': redis_id, 'redisImageId': redis_image, 'redisName': redis_name, 'isolationMarkerVerified': True, 'syntheticOnly': True, 'network': 'shared disposable PostgreSQL namespace; no host ports'}
        finally:
            errors = []
            for name, attempted in ((test_name, attempted_test), (redis_name, attempted_redis)):
                try: R.remove_isolated_resources(self.command, name, '', attempted, False)
                except Exception as error: errors.append(type(error).__name__)
            R.require(not errors, 'Integration resource cleanup failed')

    def schema(self):
        self.schema_active = True
        try:
            result = super().schema()
            R.require(self.fixture_counts == {'legacy': 1, 'candidate': 1}, 'Schema adapter did not execute exactly once')
            return {**result, 'catalogSchema': self.catalog_schema}
        finally:
            self.schema_active = False

    def restore_compilation(self, component, original, archive):
        self.ready('prepare')
        R.require(component in R.COMPONENTS and original['name'] == component + '-compile' and original['status'] == 'success', 'Wrong prior compilation')
        details = original['details']
        archive = Path(archive).resolve()
        R.require(archive.is_relative_to(self.private) and archive.is_file() and R.sha(archive) == details['archiveSha256'], 'Changed retained compilation bytes')
        members = ['dist', 'node_modules/.prisma/client'] if component == 'backend' else ['dist']
        R.require(details['archiveMembers'] == members and details['archivePath'] == component + '-compiled.tar.gz', 'Changed compiler archive contract')
        R.require(details['sourceTree'] == self.inputs['macRuntime']['dependencyPatch']['originalComponents'][component]['sourceTree'], 'Changed compiled source')
        with R.tarfile.open(archive) as tar:
            names = [str(R.PurePosixPath(m.name)) for m in tar.getmembers()]
            R.require(all(any(name == root or name.startswith(root + '/') for root in members) for name in names), 'Unexpected compiler archive member')
            R.require(all(names.count(root) == 1 for root in members), 'Missing or duplicate compilation root')
        context = self.private / component
        R.require(not (context / 'dist').exists(), 'Existing compilation cannot be overwritten')
        if component == 'backend':
            client = context / 'node_modules/.prisma/client'
            R.require(client.is_dir() and not client.is_symlink(), 'Unexpected original generated-client path')
            shutil.rmtree(client)
        R.safe_extract(archive, context, {'dist', 'node_modules'} if component == 'backend' else {'dist'})
        R.require(set(details['requiredFiles']) == set(self.dependency_pins[component]['requiredFiles']), 'Changed selected required files')
        for path, expected in details['requiredFiles'].items():
            R.require(R.sha(context / path) == expected, 'Restored compiled/source hash differs')
        if component == 'backend':
            R.require(R.sha(context / 'node_modules/.prisma/client/schema.prisma') == details['generatedSchemaSha256'], 'Restored Prisma client differs')
        self.inputs['components'][component]['requiredFiles'] = details['requiredFiles']
        self.state['components'][component].update(requiredFiles=details['requiredFiles'], compiledArchiveSha256=details['archiveSha256'])
        shutil.copyfile(archive, self.out / details['archivePath'])
        return {**details, 'kind': 'admitted-prior-official-success', 'ciExecuted': False, 'original': original}

    def execute(self):
        R.require(os.environ.get('CI') == os.environ.get('GITHUB_ACTIONS') == 'true', 'Official isolated Actions only')
        R.require(os.environ.get('GITHUB_SHA') == self.plan['head'] and os.environ.get('GITHUB_REPOSITORY') == 'caohuibj/eduK12-new-version', 'Wrong official consumer')
        try:
            self.phase('prepare', self.prepare)
            spec = importlib.util.spec_from_file_location('mac_prior_success', Path(__file__).with_name('training-mac-runtime-reuse.py'))
            module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
            reuse = module.admit_reusable_phases(self)
            names = {'backend-compile', 'frontend-compile', 'frontend-app-types', 'changed-lint'}
            R.require(set(reuse) == {'phases', 'archives'} and set(reuse['phases']) == names and set(reuse['archives']) == set(R.COMPONENTS), 'Incomplete exact prior success admission')
            self.phase('backend-compile', lambda: self.restore_compilation('backend', reuse['phases']['backend-compile'], reuse['archives']['backend']))
            self.phase('frontend-compile', lambda: self.compile_patched_frontend(reuse['phases']['frontend-compile'], reuse['archives']['frontend']))
            for name, action in [('frontend-app-types', self.app_types), ('changed-lint', self.lint),
                                 ('dependency-audit', self.audit), ('compiled-browser', self.browser),
                                 ('runtime-packaging', self.package), ('runtime-scans', self.scan), ('schema-upgrade-restore', self.schema)]:
                self.phase(name, action)
            R.require({p['name'] for p in self.state['phases'] if p['status'] == 'success'} == set(PHASES), 'Missing actual Mac gate')
            self.state['status'] = 'success'; self.save()
        except Exception as error:
            if not (self.out / 'failure-details.json').exists(): self.failure_receipt(error)
            raise
        finally:
            shutil.rmtree(self.private)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True); parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try: MacQualification(args.plan, args.output).execute()
    except Exception as error:
        print('Mac runtime qualification failed: ' + json.dumps(R.safe_error_details(error), sort_keys=True), file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == '__main__': main()
