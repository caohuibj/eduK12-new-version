"""Control-plane only: never executes Node, Docker, databases or application tests."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

PATH = Path(__file__).with_name('training-mac-runtime.py')
SPEC = importlib.util.spec_from_file_location('mac_runtime', PATH)
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)
INPUTS = json.loads(PATH.with_name('training-mac-inputs.json').read_text())
CHECKS = ['course-shell-1440', 'analysis-reference-1440', 'pending-publication-1440',
          'course-shell-390', 'analysis-reference-390', 'pending-publication-390']


def report():
    return {'success': True, 'numTotalTests': 4, 'numPassedTests': 4, 'numFailedTests': 0,
            'numPendingTests': 0, 'numTodoTests': 0, 'testResults': [
                {'name': '/app/' + file, 'status': 'passed', 'assertionResults': [
                    {'fullName': 'public fixture ' + str(n), 'status': 'passed'} for n in range(count)]}
                for file, count in zip(M.INTEGRATION_FILES, (1, 3))]}


class MacContracts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.q = object.__new__(M.MacQualification)
        self.q.private = self.root / 'private'; self.q.private.mkdir()
        self.q.out = self.root / 'public'; self.q.out.mkdir()
        self.q.inputs = copy.deepcopy(INPUTS)
        self.q.dependency_pins = copy.deepcopy(INPUTS['macRuntime']['dependencySources'])
        self.q.identity = {'schema': 1, 'head': 'a' * 40}
        self.q.plan = {'sourceHead': 'a' * 40, 'head': 'b' * 40}
        self.q.state = {'phases': [], 'components': {'backend': {}, 'frontend': {}}}
        self.q.ready = Mock(); self.q.save = Mock(); self.q.prefix = 'mac-control-only'
        self.q.schema_active = False; self.q.fixture_counts = {'legacy': 0, 'candidate': 0}
        self.q.command_index = 0

    def test_plan_rejects_input_dependency_or_phase_drift(self):
        inputs = copy.deepcopy(INPUTS)
        plan = {'schema': 1, 'route': 'exact-candidate', 'candidate': 'training-mac',
                'head': 'a' * 40, 'sourceHead': 'b' * 40, 'tree': 'c' * 40,
                'base': inputs['runtime']['base'], 'required': list(M.PHASES),
                **{k: copy.deepcopy(inputs[k]) for k in ('components', 'runtime', 'macRuntime')}}
        seen_refs = []
        def git(*args):
            target = args[-1]
            seen_refs.append(target)
            if target == 'HEAD': return 'a' * 40
            if target == 'HEAD^{tree}': return 'c' * 40
            for c in M.R.COMPONENTS:
                if target == 'HEAD:server-version/' + c: return inputs['components'][c]['sourceTree']
            return 'd' * 40
        with patch.object(M.R, 'git', side_effect=git), patch.object(M.R, 'input_inventory', side_effect=lambda c, _: inputs['components'][c]['productionInputSha256']), patch.object(M.R, 'sha', side_effect=lambda p: inputs['components'][p.parent.name]['lockfileSha256']), patch.object(M.R, 'migration_inputs', return_value=(['20261021000000_training_catalog_discovery'], True)), patch.object(M.subprocess, 'run'):
            M.validate_plan(plan, inputs)
            for component in M.R.COMPONENTS:
                for path in ('package.json', 'package-lock.json', 'Dockerfile'):
                    self.assertIn(plan['base'] + ':server-version/' + component + '/' + path, seen_refs)
                self.assertFalse(any(ref.startswith(inputs['macRuntime']['dependencySources'][component]['head'] + ':') for ref in seen_refs))
            changes = [dict(plan, candidate='measurement'), dict(plan, head='f' * 40), dict(plan, required=[]),
                       dict(plan, components={}), dict(plan, runtime={})]
            for changed in changes:
                with self.subTest(changed=changed), self.assertRaises(ValueError): M.validate_plan(changed, inputs)
            bad = copy.deepcopy(inputs); bad['macRuntime']['dependencySources']['backend']['artifactId'] = 1
            altered = {**plan, 'macRuntime': bad['macRuntime']}
            with self.assertRaises(ValueError): M.validate_plan(altered, bad)

    def test_catalog_index_definitions_are_exact_postgresql_form_not_lossy_normalized(self):
        folder = self.q.private / 'backend/prisma/migrations/20261021000000_training_catalog_discovery'
        folder.mkdir(parents=True)
        original = M.ROOT / 'server-version/backend/prisma/migrations/20261021000000_training_catalog_discovery/migration.sql'
        (folder / 'migration.sql').write_bytes(original.read_bytes())
        indexes = {}
        for table, column in [('assignments', 'course_id'), ('checkins', 'course_id'), ('questionnaires', 'creator_id'),
                              ('composite_assessments', 'created_by'), ('cognitive_assignments', 'course_id'), ('scales', 'creator_id')]:
            name = table + '_' + column + '_created_at_id_idx'
            indexes[name] = f'CREATE INDEX {name} ON public.{table} USING btree ({column}, created_at DESC, id DESC)'
            name = table + '_tags_idx'
            indexes[name] = f'CREATE INDEX {name} ON public.{table} USING gin (tags)'
        def answer(args, **kwargs):
            return SimpleNamespace(stdout=json.dumps(indexes) if 'pg_indexes' in kwargs['input'] else 't')
        with patch.object(M.R.Qualification, 'command', side_effect=answer):
            self.q.verify_catalog_schema('synthetic-pg')
            self.assertEqual(len(self.q.catalog_schema['newIndexes']), 12)
            indexes['assignments_tags_idx'] += ' WHERE tags IS NOT NULL'
            with self.assertRaises(ValueError): self.q.verify_catalog_schema('synthetic-pg')

    def test_actual_browser_pass_contract_and_exact_six_cases(self):
        r = {'schema': 1, 'status': 'PASS', 'kind': 'compiled-ui-synthetic-api-integration',
             'checks': [{'name': n, 'status': 'PASS'} for n in CHECKS], 'errors': []}
        self.assertEqual(M.require_browser_report(r, CHECKS), r['checks'])
        for change in ({'checks': []}, {'status': 'success'}, {'errors': [{'code': 'ERROR'}]},
                       {'checks': r['checks'][:-1]}, {'checks': r['checks'] + r['checks'][:1]},
                       {'checks': [dict(r['checks'][0], status='SKIP'), *r['checks'][1:]]}):
            with self.subTest(change=change), self.assertRaises(ValueError): M.require_browser_report({**r, **change}, CHECKS)
        with self.assertRaises(ValueError): M.require_browser_report(r, CHECKS[:-1])

    def test_integration_requires_four_positive_cases_both_files_no_skips(self):
        self.assertEqual(M.require_test_report(report())['passed'], 4)
        for key, value in [('success', False), ('numPassedTests', 0), ('numTotalTests', 0), ('numFailedTests', 1), ('numPendingTests', 1), ('numTodoTests', 1), ('testResults', [])]:
            altered = report(); altered[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError): M.require_test_report(altered)
        for change in ('skip', 'wrong-file', 'duplicate-file'):
            altered = report()
            if change == 'skip': altered['testResults'][0]['assertionResults'][0]['status'] = 'pending'
            elif change == 'wrong-file': altered['testResults'][0]['name'] = 'unrelated.test.ts'
            else: altered['testResults'][1]['name'] = altered['testResults'][0]['name']
            with self.subTest(change=change), self.assertRaises(ValueError): M.require_test_report(altered)

    def test_cognitive_type_subsumption_requires_identical_semantic_options(self):
        context = self.root / 'frontend'; context.mkdir()
        for name in ('tsconfig.app.json', 'tsconfig.cognitive.json'):
            (context / name).write_bytes((M.ROOT / 'server-version/frontend' / name).read_bytes())
        self.assertFalse(M.cognitive_subsumption(context)['cognitiveCommandExecuted'])
        cognitive = json.loads((context / 'tsconfig.cognitive.json').read_text())
        for altered in ({**cognitive, 'compilerOptions': {'strict': False}}, {**cognitive, 'include': ['../outside']}, {**cognitive, 'exclude': ['src']}):
            (context / 'tsconfig.cognitive.json').write_text(json.dumps(altered))
            with self.assertRaises(ValueError): M.cognitive_subsumption(context)

    def test_backend_compile_direct_tsc_generate_once_and_retains_current_client(self):
        self.compile_contract('backend')

    def test_frontend_compile_direct_vite_no_suites_or_prerequisites(self):
        self.compile_contract('frontend')

    def compile_contract(self, component):
        context = self.q.private / component; context.mkdir()
        files = list(self.q.dependency_pins[component]['requiredFiles'])
        if component == 'backend': files += ['node_modules/.prisma/client/schema.prisma']
        for name in files:
            p = context / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text('current source or compilation fixture')
        calls = []
        def command(args, **kwargs):
            calls.append(args)
            if args[0] == 'tar': Path(args[2]).write_bytes(b'control-only fake archive')
            return SimpleNamespace(stdout='', returncode=0)
        self.q.command = command
        result = self.q.compile_component(component)
        self.assertEqual(result['archivePath'], component + '-compiled.tar.gz')
        self.assertEqual(result['archiveSha256'], M.R.sha(self.q.out / result['archivePath']))
        self.assertEqual(result['archiveSha256'], self.q.state['components'][component]['compiledArchiveSha256'])
        self.assertFalse(result['buildPrerequisitesReplayed'])
        joined = '\n'.join(' '.join(x) for x in calls)
        self.assertNotIn('npm ', joined); self.assertNotIn('vitest', joined); self.assertNotIn('typecheck', joined)
        if component == 'backend':
            self.assertEqual(len(calls), 3); self.assertIn('prisma/build/index.js generate --schema prisma/schema.prisma', joined)
            self.assertIn('typescript/bin/tsc -p tsconfig.json', joined)
            self.assertEqual(result['archiveMembers'], ['dist', 'node_modules/.prisma/client'])
        else:
            self.assertEqual(len(calls), 2); self.assertIn('vite/bin/vite.js build', joined)
            self.assertEqual(result['archiveMembers'], ['dist'])

    def test_dependency_producer_never_admits_old_dist_as_mac_compilation(self):
        for component in M.R.COMPONENTS:
            actual = self.q.producer(component)
            self.assertFalse(actual['originalDistAdmitted'])
            self.assertEqual(actual['dependencySource']['artifactId'], self.q.dependency_pins[component]['artifactId'])
            self.assertEqual(actual['currentSourceTree'], self.q.inputs['components'][component]['sourceTree'])

    def test_schema_adapter_only_hooks_exact_legacy_and_candidate_inputs(self):
        self.q.schema_active = True
        self.q.verify_catalog_schema = Mock(); self.q.phase = Mock()
        prefix = "SET statement_timeout='20s'; SET lock_timeout='5s';\n"
        with patch.object(M.R.Qualification, 'command', return_value=SimpleNamespace(stdout='')) as base:
            args = ['docker', 'exec', '-i', 'synthetic-pg', 'psql']
            self.q.command(args, input=prefix + M.R.LEGACY_SQL)
            self.assertEqual(base.call_args.kwargs['input'], prefix + M.R.LEGACY_SQL + M.LEGACY_EXTRA)
            self.q.command(args, input=prefix + M.R.NEW_SQL)
            self.q.command(args, input='unrelated synthetic SQL')
        self.assertEqual(self.q.fixture_counts, {'legacy': 1, 'candidate': 1})
        self.q.verify_catalog_schema.assert_called_once_with('synthetic-pg')
        self.assertEqual(self.q.phase.call_args.args[0], 'scoped-pg-http')

    def test_failure_receipt_excludes_messages_commands_and_values(self):
        self.q.state['phases'] = [{'name': 'backend-compile', 'status': 'failure'}]
        self.q.command_index = 1
        (self.q.private / 'command-1.log').write_text("DATABASE_URL=postgresql://SECRET\nsrc/public.ts(12,3): error TS2322: SECRET value\n")
        self.q.failure_receipt(ValueError('token=SECRET'))
        result = json.loads((self.q.out / 'failure-details.json').read_text())
        self.assertNotIn('SECRET', json.dumps(result)); self.assertNotIn('DATABASE_URL', json.dumps(result))
        self.assertEqual(result['typescriptDiagnostics'], [{'file': 'src/public.ts', 'line': '12', 'column': '3', 'code': 'TS2322'}])
        self.assertEqual(result['phase'], 'backend-compile')

    def test_redis_isolation_marker_actual_identity_and_cleanup_on_test_failure(self):
        self.q.state['components']['backend']['runtimeImageId'] = 'sha256:' + 'b' * 64
        self.q.base_image = Mock(return_value='redis@sha256:' + 'c' * 64)
        (self.q.private / 'backend').mkdir()
        calls = []
        def command(args, **kwargs):
            calls.append(args)
            if args[:2] == ['docker', 'inspect']:
                return SimpleNamespace(stdout=json.dumps([{'Id': 'd' * 64, 'Image': 'sha256:' + 'e' * 64}]))
            if 'ping' in args: return SimpleNamespace(stdout='PONG', returncode=0)
            if 'SET' in args: return SimpleNamespace(stdout='OK')
            if 'node_modules/vitest/vitest.mjs' in args: raise ValueError('synthetic failure')
            return SimpleNamespace(stdout='', returncode=0)
        self.q.command = command
        with patch.dict('os.environ', {'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1'}), patch.object(M.R, 'remove_isolated_resources') as cleanup:
            with self.assertRaises(ValueError): self.q.integration('synthetic-pg')
        self.assertEqual(cleanup.call_count, 2)
        marker = next(c for c in calls if 'SET' in c)
        self.assertIn('15', marker); self.assertIn('training-mac:qualification:123:1', marker)
        tests = next(c for c in calls if 'node_modules/vitest/vitest.mjs' in c)
        for env in ('REDIS_URL=redis://127.0.0.1:6379/15', 'CI=true', 'GITHUB_ACTIONS=true',
                    'TRAINING_MAC_FIXTURE_CONTRACT=actions-isolated-v1', 'TRAINING_MAC_FIXTURE_REDIS_NAME=training-mac-redis-123-1'):
            self.assertIn(env, tests)
        self.assertIn('TRAINING_MAC_FIXTURE_REDIS_ID=' + 'd' * 64, tests)
        self.assertIn('TRAINING_MAC_FIXTURE_REDIS_IMAGE_DIGEST=sha256:' + 'e' * 64, tests)
        self.assertNotIn('--publish', tests)

    def retained_compilation(self, component, unsafe=False):
        context = self.q.private / component; context.mkdir()
        source = self.root / ('retained-' + component); source.mkdir()
        members = ['dist', 'node_modules/.prisma/client'] if component == 'backend' else ['dist']
        required = {}
        for path in self.q.dependency_pins[component]['requiredFiles']:
            target = (source if path.startswith('dist/') else context) / path
            target.parent.mkdir(parents=True, exist_ok=True); target.write_text('verified public fixture ' + path)
            required[path] = M.R.sha(target)
        if component == 'backend':
            (context / 'node_modules/.prisma/client').mkdir(parents=True)
            client = source / 'node_modules/.prisma/client'; client.mkdir(parents=True)
            (client / 'schema.prisma').write_text('current generated schema fixture')
        archive = self.q.private / (component + '-retained.tar.gz')
        with M.R.tarfile.open(archive, 'w:gz') as tar:
            for member in members: tar.add(source / member, arcname=member)
            if unsafe:
                bad = source / 'unexpected.txt'; bad.write_text('reject'); tar.add(bad, arcname='node_modules/unapproved.txt')
        details = {'sourceTree': self.q.inputs['components'][component]['sourceTree'], 'requiredFiles': required,
                   'archiveSha256': M.R.sha(archive), 'archivePath': component + '-compiled.tar.gz', 'archiveMembers': members}
        if component == 'backend': details['generatedSchemaSha256'] = M.R.sha(source / 'node_modules/.prisma/client/schema.prisma')
        return {'name': component + '-compile', 'status': 'success', 'head': 'original-head', 'details': details}, archive

    def test_restores_only_bound_bytes_without_commands_or_relabeling_original(self):
        self.q.command = Mock(side_effect=AssertionError('must never execute compile'))
        for component in M.R.COMPONENTS:
            original, archive = self.retained_compilation(component)
            result = self.q.restore_compilation(component, original, archive)
            self.assertEqual(result['original']['head'], 'original-head')
            self.assertFalse(result['ciExecuted']); self.assertEqual(result['kind'], 'admitted-prior-official-success')
            self.assertEqual(M.R.sha(self.q.out / result['archivePath']), result['archiveSha256'])
        self.q.command.assert_not_called()

    def test_restore_rejects_unexpected_members_before_extraction(self):
        original, archive = self.retained_compilation('backend', unsafe=True)
        with self.assertRaises(ValueError): self.q.restore_compilation('backend', original, archive)
        self.assertFalse((self.q.private / 'backend/dist').exists())

    def test_restore_rejects_digest_changed_source_and_generated_client_mismatch(self):
        original, archive = self.retained_compilation('backend')
        for field, value in [('archiveSha256', '0' * 64), ('sourceTree', '0' * 40), ('archiveMembers', ['dist'])]:
            bad = copy.deepcopy(original); bad['details'][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): self.q.restore_compilation('backend', bad, archive)
        original['details']['generatedSchemaSha256'] = '0' * 64
        with self.assertRaises(ValueError): self.q.restore_compilation('backend', original, archive)

    def test_browser_installs_signed_official_cjk_font_and_records_identity(self):
        self.q.state['components']['frontend']['compiledArchiveSha256'] = 'archive'
        output = self.q.out / 'browser'; output.mkdir()
        (output / 'browser-result.json').write_text(json.dumps({'schema': 1, 'status': 'PASS',
            'kind': 'compiled-ui-synthetic-api-integration', 'errors': [], 'checks': [{'name': n, 'status': 'PASS'} for n in CHECKS]}))
        self.q.inputs['macRuntime']['browserExpectedAssertions'] = CHECKS
        calls = []
        def command(args, **kwargs):
            calls.append(args)
            if args[:2] == ['fc-match', '--format=%{file}']: return SimpleNamespace(stdout='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
            if args[:2] == ['fc-match', '--format=%{family}']: return SimpleNamespace(stdout='Noto Sans CJK SC')
            if args[:2] == ['dpkg-query', '-S']: return SimpleNamespace(stdout='fonts-noto-cjk: font')
            if args[:2] == ['dpkg-query', '-W']: return SimpleNamespace(stdout='1:official-test-version')
            return SimpleNamespace(stdout='')
        self.q.command = command
        with patch.object(M.R, 'git', return_value=self.q.inputs['macRuntime']['browserScriptBlob']), patch.object(M.Path, 'is_file', return_value=True), patch.object(M.R, 'sha', return_value='verified-font-hash'):
            result = self.q.browser()
        self.assertEqual(result['cjkFont']['family'], 'Noto Sans CJK SC')
        self.assertEqual(result['cjkFont']['fileSha256'], 'verified-font-hash')
        source = (self.q.private / 'font-official-sources.list').read_text()
        self.assertIn('signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg', source)
        self.assertIn('https://archive.ubuntu.com/ubuntu noble ', source)
        self.assertIn('https://security.ubuntu.com/ubuntu noble-security ', source)
        self.assertFalse(any('trusted=yes' in arg or 'allow-unauthenticated' in arg for call in calls for arg in call))
        self.assertEqual(sum('fonts-noto-cjk' in call and 'install' in call for call in calls), 1)

    def test_repair_executes_missing_phases_but_never_successful_compiles_types_lint(self):
        self.q.state['phases'] = []
        for name in ('prepare', 'compile_component', 'restore_compilation', 'app_types', 'lint', 'audit', 'browser', 'package', 'scan'):
            setattr(self.q, name, Mock())
        def schema(): self.q.phase('scoped-pg-http', Mock())
        self.q.schema = schema
        def phase(name, action):
            action(); self.q.state['phases'].append({'name': name, 'status': 'success'})
        self.q.phase = phase
        rows = {name: {'name': name, 'status': 'success', 'details': {}} for name in ('backend-compile', 'frontend-compile', 'frontend-app-types', 'changed-lint')}
        module = SimpleNamespace(admit_reusable_phases=Mock(return_value={'phases': rows, 'archives': {'backend': self.root / 'backend.tar.gz', 'frontend': self.root / 'frontend.tar.gz'}}))
        spec = SimpleNamespace(loader=SimpleNamespace(exec_module=Mock()))
        with patch.dict('os.environ', {'CI': 'true', 'GITHUB_ACTIONS': 'true', 'GITHUB_SHA': 'b' * 40, 'GITHUB_REPOSITORY': 'caohuibj/eduK12-new-version'}), patch.object(M.importlib.util, 'spec_from_file_location', return_value=spec), patch.object(M.importlib.util, 'module_from_spec', return_value=module):
            self.q.execute()
        self.assertEqual({p['name'] for p in self.q.state['phases']}, set(M.PHASES))
        self.q.compile_component.assert_not_called(); self.q.app_types.assert_not_called(); self.q.lint.assert_not_called()
        self.assertEqual(self.q.restore_compilation.call_count, 2)
        self.assertEqual(self.q.state['status'], 'success')
        self.assertFalse(self.q.private.exists())

    def test_reject_non_actions_execution_before_any_action(self):
        self.q.phase = Mock()
        with patch.dict('os.environ', {'CI': 'false', 'GITHUB_ACTIONS': 'false'}), self.assertRaises(ValueError): self.q.execute()
        self.q.phase.assert_not_called()


if __name__ == '__main__': unittest.main()
