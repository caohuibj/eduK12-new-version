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
    original = json.loads(R.INPUTS.read_text())['components']
    R.require(inputs['macRuntime']['dependencySources'] == original, 'Changed official dependency producers')
    for component in R.COMPONENTS:
        pin = inputs['components'][component]
        R.require(pin['sourceTree'] == R.git('rev-parse', 'HEAD:server-version/' + component), 'Changed current component')
        R.require(R.input_inventory(component, pin['excludedNonProductionPaths']) == pin['productionInputSha256'], 'Changed current inputs')
        R.require(R.sha(ROOT / 'server-version' / component / 'package-lock.json') == pin['lockfileSha256'] == original[component]['lockfileSha256'], 'Dependency lock changed')
        # These six baseline blobs were verified equal to the original component
        # trees. The frozen main ancestor is available without off-branch commits.
        for path in ('package.json', 'package-lock.json', 'Dockerfile'):
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
        return {'officialDependenciesVerified': True, 'originalDistConsumed': False, 'dependencyInstallExecuted': False}

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

    def audit(self):
        self.ready('prepare')
        for component in R.COMPONENTS:
            R.require(self.inputs['components'][component]['lockfileSha256'] == self.dependency_pins[component]['lockfileSha256'], 'Cannot reuse changed dependency audit')
        spec = importlib.util.spec_from_file_location('original_phase_reuse', Path(__file__).with_name('exact-candidate-runtime-reuse.py'))
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        row = module.admit_reusable_phases(self)['dependency-audit']
        return {'kind': 'admitted-prior-official-success', 'ciExecuted': False, 'original': row,
                'scope': 'unchanged exact dependency locks/packages only; no old lint/type/source qualification'}

    def browser(self):
        self.ready('frontend-compile')
        pin = self.inputs['macRuntime']
        script = '.github/scripts/training-mac-browser.mjs'
        R.require(pin['browserScriptBlob'] == R.git('rev-parse', 'HEAD:' + script), 'Unreviewed browser fixture')
        # Only the failed browser environment gains CJK glyph support. Use a
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
        spec = importlib.util.spec_from_file_location('mac_prior_browser', Path(__file__).with_name('training-mac-runtime-reuse.py'))
        reuse_module = importlib.util.module_from_spec(spec); spec.loader.exec_module(reuse_module)
        prior = self.private / 'prior-browser-case.json'
        prior.write_text(json.dumps(reuse_module.admit_prior_browser_case(self), sort_keys=True) + '\n')
        self.command(['env', 'PLAYWRIGHT_BROWSERS_PATH=' + str(browsers), 'node', script,
                      '--frontend-dir', str(self.private / 'frontend/dist'), '--playwright-module', str(module), '--output', str(output),
                      '--prior-browser-result', str(prior)], timeout=180)
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
        # Only diagnostic codes and public source positions, never compiler
        # message text, command arguments, SQL or synthetic secret values.
        log = self.private / ('command-' + str(self.command_index) + '.log')
        if log.is_file():
            diagnostics = []
            for match in re.finditer(r'(?m)^(?P<file>(?:src|examples)/[A-Za-z0-9_./@+ -]+\.tsx?)\((?P<line>[0-9]+),(?P<column>[0-9]+)\): error (?P<code>TS[0-9]+):', log.read_text(errors='replace')):
                diagnostics.append(match.groupdict())
            details['typescriptDiagnostics'] = diagnostics[:100]
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
        R.require(details['sourceTree'] == self.inputs['components'][component]['sourceTree'], 'Changed compiled source')
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
            for component in R.COMPONENTS:
                self.phase(component + '-compile', lambda component=component: self.restore_compilation(component, reuse['phases'][component + '-compile'], reuse['archives'][component]))
            for name in ('frontend-app-types', 'changed-lint'):
                original = reuse['phases'][name]
                R.require(original['name'] == name and original['status'] == 'success', 'Prior check not successful')
                self.phase(name, lambda original=original: {**original['details'], 'kind': 'admitted-prior-official-success', 'ciExecuted': False, 'original': original})
            for name, action in [('dependency-audit', self.audit), ('compiled-browser', self.browser),
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
