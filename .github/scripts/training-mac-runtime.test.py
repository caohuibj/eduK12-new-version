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
        with patch.object(M, 'validate_dependency_patch', return_value=inputs['macRuntime']['dependencyPatch']), patch.object(M.R, 'git', side_effect=git), patch.object(M.R, 'input_inventory', side_effect=lambda c, _: inputs['components'][c]['productionInputSha256']), patch.object(M.R, 'sha', side_effect=lambda p: inputs['components'][p.parent.name]['lockfileSha256']), patch.object(M.R, 'migration_inputs', return_value=(['20261021000000_training_catalog_discovery'], True)), patch.object(M.subprocess, 'run'):
            M.validate_plan(plan, inputs)
            for component in M.R.COMPONENTS:
                for path in ('Dockerfile',):
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

    def test_failed_vite_output_retains_error_and_stack_but_redacts_sensitive_values(self):
        self.q.state['phases'] = [{'name': 'frontend-compile', 'status': 'failure'}]
        self.q.last_command_kind = 'vite'; self.q.command_index = 1
        raw = ('\x1b[31merror during build:\x1b[0m\nError [ERR_MODULE_NOT_FOUND]: Cannot find package synthetic-missing\n'
            + '    at ' + str(self.q.private / 'frontend/node_modules/vite/dist/node/index.js') + ':123:4\n'
            + 'token=literal-private-token password="literal-private-password"\n'
            + 'Bearer authorization-value\nhttps://user:credential@example.invalid/path?token=secret\n'
            + 'environment-private-token\n' + 'x' * 30000 + '\nFinal compiler error retained\n')
        (self.q.private / 'command-1.log').write_text(raw)
        with patch.dict('os.environ', {'GITHUB_TOKEN': 'environment-private-token'}): self.q.failure_receipt(ValueError('must-not-publish-exception-message'))
        saved = json.loads((self.q.out / 'failure-details.json').read_text())['sanitizedCommandOutput']
        output = saved['stdoutAndStderr']
        for secret in ('literal-private-token', 'literal-private-password', 'authorization-value', 'credential', 'environment-private-token', str(self.q.private), 'must-not-publish-exception-message'):
            self.assertNotIn(secret, output)
        self.assertIn('ERR_MODULE_NOT_FOUND', output); self.assertIn('synthetic-missing', output)
        self.assertIn('[isolated-workdir]/frontend/node_modules/vite/dist/node/index.js:123:4', output)
        self.assertIn('Final compiler error retained', output)
        self.assertTrue(saved['truncated']); self.assertLess(len(output), 24100)
        self.assertEqual(saved['rawOutputSha256'], M.R.digest(raw.encode()))

    def test_failed_compiler_timeout_keeps_partial_output_without_sql_output(self):
        self.q.last_command_kind = 'vite'; self.q.command_index = 1
        error = subprocess.TimeoutExpired(['private-command'], 1, output=b'Vite partial stdout', stderr=b'partial compiler stderr')
        self.q.failure_receipt(error)
        saved = json.loads((self.q.out / 'failure-details.json').read_text())
        self.assertIn('Vite partial stdout', saved['sanitizedCommandOutput']['stdoutAndStderr'])
        self.assertIn('partial compiler stderr', saved['sanitizedCommandOutput']['stdoutAndStderr'])
        self.q.last_command_kind = 'postgres-sql'
        (self.q.private / 'command-1.log').write_text('private SQL and row values')
        self.q.failure_receipt(ValueError('private'))
        saved = json.loads((self.q.out / 'failure-details.json').read_text())
        self.assertNotIn('sanitizedCommandOutput', saved); self.assertNotIn('private SQL', json.dumps(saved))

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
        details = {'sourceTree': self.q.inputs['macRuntime']['dependencyPatch']['originalComponents'][component]['sourceTree'], 'requiredFiles': required,
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

    def test_exact_security_source_transform_and_no_other_manifest_drift(self):
        self.assertEqual(M.validate_dependency_patch(INPUTS)['toVersion'], '1.16.1')
        for key, value in [('fromVersion', '0.0.0'), ('tarball', 'https://example.invalid/patch.tgz'), ('reviewedSourceFiles', [])]:
            changed = copy.deepcopy(INPUTS); changed['macRuntime']['dependencyPatch'][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError): M.validate_dependency_patch(changed)
        read = M.Path.read_text
        def drift(path, *args, **kwargs):
            raw = read(path, *args, **kwargs)
            if path == M.ROOT / 'server-version/backend/package.json':
                obj = json.loads(raw); obj['scripts']['unreviewed'] = 'not allowed'; return json.dumps(obj)
            return raw
        with patch.object(M.Path, 'read_text', drift), self.assertRaises(ValueError): M.validate_dependency_patch(INPUTS)

    def test_logo_delta_rejects_missing_extra_changed_mode_or_blob_and_old_lint_selection(self):
        changes = []
        missing = copy.deepcopy(INPUTS); missing['macRuntime']['logoDelta'].pop(); changes.append(missing)
        extra = copy.deepcopy(INPUTS); extra['macRuntime']['logoDelta'].append(copy.deepcopy(extra['macRuntime']['logoDelta'][0])); changes.append(extra)
        for field, value in [('mode', '100755'), ('blob', '0' * 40)]:
            changed = copy.deepcopy(INPUTS); changed['macRuntime']['logoDelta'][0]['after'][field] = value; changes.append(changed)
        before = copy.deepcopy(INPUTS)
        row = next(row for row in before['macRuntime']['logoDelta'] if row['before'] is not None)
        row['before']['blob'] = '0' * 40; changes.append(before)
        lint = copy.deepcopy(INPUTS); lint['runtime']['changedFrontendFiles'] = ['src/training/CourseScreens.tsx']; changes.append(lint)
        for index, changed in enumerate(changes):
            with self.subTest(index=index), self.assertRaises(ValueError): M.validate_dependency_patch(changed)

    def test_source_locked_dependency_overlay_changes_only_exact_package_and_hidden_entry(self):
        import base64
        import io
        package = {'name': 'follow-redirects', 'version': '1.16.1', 'main': 'index.js', 'scripts': {'test': 'never executed'}}
        contents = {name: b'control fixture' for name in ('LICENSE', 'README.md', 'debug.js', 'http.js', 'https.js', 'index.js')}
        contents['package.json'] = json.dumps(package).encode()
        stream = io.BytesIO()
        with M.R.tarfile.open(fileobj=stream, mode='w:gz') as tar:
            for name, content in contents.items():
                item = M.R.tarfile.TarInfo('package/' + name); item.size = len(content); item.mode = 0o644; tar.addfile(item, io.BytesIO(content))
        raw = stream.getvalue()
        p = self.q.inputs['macRuntime']['dependencyPatch']
        p.update(tarBytes=len(raw), tarSha256=M.R.digest(raw), integrity='sha512-' + base64.b64encode(M.R.hashlib.sha512(raw).digest()).decode(),
                 files=[{'path': name, 'sha256': M.R.digest(content), 'bytes': len(content)} for name, content in contents.items()])
        for component in M.R.COMPONENTS:
            context = self.q.private / component
            target = context / 'node_modules/follow-redirects'; target.mkdir(parents=True)
            (target / 'package.json').write_text(json.dumps({'name': 'follow-redirects', 'version': '1.16.0'}))
            (context / 'node_modules/untouched.txt').write_text('retain exact dependency')
            (context / 'node_modules/.package-lock.json').write_text(json.dumps({'packages': {'node_modules/follow-redirects': {'version': '1.16.0'}, 'node_modules/other': {'version': 'unchanged'}}}))
            (context / 'package-lock.json').write_text(json.dumps({'packages': {'node_modules/follow-redirects': {'version': '1.16.1', 'integrity': p['integrity'], 'resolved': p['tarball']}}}))
        response = Mock(); response.__enter__ = Mock(return_value=response); response.__exit__ = Mock(return_value=False)
        response.geturl.return_value = p['tarball']; response.read.return_value = raw
        self.q.command = Mock(side_effect=AssertionError('No install/build command allowed'))
        with patch.object(M.R.urllib.request, 'urlopen', return_value=response): result = self.q.apply_dependency_patch()
        self.assertFalse(result['installScriptsExecuted']); self.assertFalse(result['otherDependenciesChanged'])
        for component in M.R.COMPONENTS:
            context = self.q.private / component
            self.assertEqual((context / 'node_modules/untouched.txt').read_text(), 'retain exact dependency')
            self.assertEqual(json.loads((context / 'node_modules/follow-redirects/package.json').read_text())['version'], '1.16.1')
            hidden = json.loads((context / 'node_modules/.package-lock.json').read_text())
            self.assertEqual(hidden['packages']['node_modules/other'], {'version': 'unchanged'})
            self.assertEqual(hidden['packages']['node_modules/follow-redirects']['integrity'], p['integrity'])
        self.q.command.assert_not_called()
        response.read.return_value = raw + b'corrupt'
        with patch.object(M.R.urllib.request, 'urlopen', return_value=response), self.assertRaises(ValueError): self.q.apply_dependency_patch()

    def test_security_repair_runs_fresh_both_lock_audit_instead_of_old_admission(self):
        for component in M.R.COMPONENTS:
            context = self.q.private / component; context.mkdir()
            (context / 'package-lock.json').write_text(json.dumps({'packages': {}}))
        self.q.command = Mock(return_value=SimpleNamespace(returncode=0, stdout=json.dumps({'metadata': {'vulnerabilities': {'high': 0, 'critical': 0}}, 'vulnerabilities': {}})))
        result = self.q.audit()
        self.assertEqual(set(result), set(M.R.COMPONENTS))
        self.assertEqual(self.q.command.call_count, 2)
        for component, call in zip(M.R.COMPONENTS, self.q.command.call_args_list):
            self.assertEqual(call.args[0], ['npm', '--prefix', str(self.q.private / component), '--registry=https://registry.npmjs.org', '--replace-registry-host=always', 'audit', '--audit-level=high', '--json'])
            self.assertEqual(call.kwargs, {'accepted': (0, 1)})
            self.assertEqual(result[component]['blockingFindings'], [])

    def test_failed_audit_preserves_only_safe_package_advisory_and_version_details(self):
        context = self.q.private / 'backend'; context.mkdir()
        (context / 'package-lock.json').write_text(json.dumps({'packages': {'node_modules/synthetic-package': {'version': '1.2.3'}}}))
        data = {'metadata': {'vulnerabilities': {'high': 1, 'critical': 0}}, 'vulnerabilities': {
            'synthetic-package': {'severity': 'high', 'range': '<1.2.4', 'nodes': ['/private/secret'],
                'fixAvailable': {'name': 'synthetic-package', 'version': '1.2.4', 'isSemVerMajor': False, 'secret': 'private-token'},
                'via': [{'source': 123, 'range': '<1.2.4', 'url': 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
                         'title': 'CVE-2026-12345 private-token'}, {'url': 'https://private-token.example/?secret=value', 'range': 'private\nsecret'}]}}}
        self.q.command = Mock(return_value=SimpleNamespace(returncode=1, stdout=json.dumps(data)))
        with self.assertRaises(ValueError): self.q.audit()
        self.q.command.assert_called_once()
        raw = (self.q.out / 'backend-audit.json').read_text(); saved = json.loads(raw)
        finding = saved['blockingFindings'][0]
        self.assertEqual(saved['exitCode'], 1); self.assertEqual(saved['vulnerabilities']['high'], 1)
        self.assertEqual(finding['installedVersions'], ['1.2.3'])
        self.assertEqual(finding['fixAvailable']['version'], '1.2.4')
        self.assertEqual(finding['advisories'][0]['cves'], ['CVE-2026-12345'])
        self.assertEqual(finding['advisories'][0]['source'], 123)
        self.assertIsNone(finding['advisories'][1]['url']); self.assertIsNone(finding['advisories'][1]['range'])
        self.assertNotIn('private', raw); self.assertNotIn('secret', raw)
        self.assertFalse((self.q.out / 'frontend-audit.json').exists())

    def test_complete_browser_is_mandatory_original_success_without_process_replay(self):
        self.q.state['components']['frontend'] = {'compiledArchiveSha256': 'current',
            'distEquality': {'equal': True, 'currentArchiveSha256': 'current'}}
        original = {'kind': 'admitted-prior-official-success', 'ciExecuted': False, 'original': {'name': 'compiled-browser', 'status': 'success'}}
        module = SimpleNamespace(admit_prior_browser_success=Mock(return_value=original))
        spec = SimpleNamespace(loader=SimpleNamespace(exec_module=Mock()))
        self.q.command = Mock(side_effect=AssertionError('No browser/font process replay'))
        with patch.object(M.importlib.util, 'spec_from_file_location', return_value=spec), patch.object(M.importlib.util, 'module_from_spec', return_value=module):
            self.assertIs(self.q.browser(), original)
            module.admit_prior_browser_success.side_effect = ValueError('Missing official proof')
            with self.assertRaises(ValueError): self.q.browser()
        self.q.command.assert_not_called()

    def test_logo_builds_and_checks_changed_frontend_once_but_preserves_backend_compile(self):
        self.q.state['phases'] = []
        for name in ('prepare', 'compile_component', 'compile_patched_frontend', 'restore_compilation', 'app_types', 'lint', 'audit', 'browser', 'package', 'scan'):
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
        self.q.compile_component.assert_not_called(); self.q.app_types.assert_called_once_with(); self.q.lint.assert_called_once_with()
        self.assertEqual(self.q.restore_compilation.call_count, 1)
        self.assertEqual(self.q.restore_compilation.call_args.args[0], 'backend')
        self.q.compile_patched_frontend.assert_called_once()
        self.assertEqual(self.q.state['status'], 'success')
        self.assertFalse(self.q.private.exists())

    def test_vite_overlay_preserves_other_dependencies_and_rejects_corrupt_tar(self):
        import base64
        import io
        responses = {}
        for component, pin in self.q.inputs['macRuntime']['vitePatch'].items():
            old = {'name': 'vite', 'version': pin['fromVersion'], 'dependencies': {'unchanged': '1.0.0'}, 'bin': {'vite': 'bin/vite.js'}}
            new = {**old, 'version': pin['toVersion']}
            stream = io.BytesIO()
            with M.R.tarfile.open(fileobj=stream, mode='w:gz') as tar:
                for name, data in [('package.json', json.dumps(new).encode()), ('bin/vite.js', b'never executed')]:
                    row = M.R.tarfile.TarInfo('package/' + name); row.size = len(data); row.mode = 0o755 if name.startswith('bin/') else 0o644
                    tar.addfile(row, io.BytesIO(data))
            raw = stream.getvalue(); pin.update(tarBytes=len(raw), tarSha256=M.R.digest(raw), integrity='sha512-' + base64.b64encode(M.R.hashlib.sha512(raw).digest()).decode())
            context = self.q.private / component; target = context / 'node_modules/vite'; target.mkdir(parents=True)
            (target / 'package.json').write_text(json.dumps(old)); (target.parent / 'untouched').write_text('same')
            (context / 'package-lock.json').write_text(json.dumps({'packages': {'node_modules/vite': {'version': pin['toVersion'], 'resolved': pin['tarball'], 'integrity': pin['integrity']}}}))
            (context / 'node_modules/.package-lock.json').write_text(json.dumps({'packages': {'node_modules/vite': {'version': pin['fromVersion']}, 'node_modules/other': {'version': 'same'}}}))
            response = Mock(); response.__enter__ = Mock(return_value=response); response.__exit__ = Mock(return_value=False)
            response.geturl.return_value = pin['tarball']; response.read.return_value = raw; responses[pin['tarball']] = response
        self.q.command = Mock(side_effect=AssertionError('No install or app execution'))
        first = responses[self.q.inputs['macRuntime']['vitePatch']['backend']['tarball']]
        original = first.read.return_value; first.read.return_value += b'corrupt'
        with patch.object(M.R.urllib.request, 'urlopen', side_effect=lambda req, **_: responses[req.full_url]), self.assertRaises(ValueError): self.q.apply_vite_patch()
        first.read.return_value = original
        with patch.object(M.R.urllib.request, 'urlopen', side_effect=lambda req, **_: responses[req.full_url]): self.q.apply_vite_patch()
        for component, pin in self.q.inputs['macRuntime']['vitePatch'].items():
            context = self.q.private / component
            self.assertEqual(json.loads((context / 'node_modules/vite/package.json').read_text())['version'], pin['toVersion'])
            self.assertEqual((context / 'node_modules/untouched').read_text(), 'same')
            self.assertEqual(json.loads((context / 'node_modules/.package-lock.json').read_text())['packages']['node_modules/other'], {'version': 'same'})
        self.q.command.assert_not_called()

    def test_new_frontend_compilation_compares_complete_dist_bytes(self):
        original, archive = self.retained_compilation('frontend')
        old_text = 'verified public fixture dist/index.html'
        def compile(component):
            self.assertEqual(component, 'frontend')
            dist = self.q.private / 'frontend/dist'; dist.mkdir()
            (dist / 'index.html').write_text(old_text)
            return {'archiveSha256': 'new-archive'}
        self.q.compile_component = Mock(side_effect=compile)
        result = self.q.compile_patched_frontend(original, archive)
        self.q.compile_component.assert_called_once_with('frontend')
        self.assertTrue(result['distEquality']['equal'])
        self.assertEqual(result['distEquality']['originalArchiveSha256'], original['details']['archiveSha256'])
        self.assertEqual(result['distEquality']['currentArchiveSha256'], 'new-archive')
        M.shutil.rmtree(self.q.private / 'frontend-comparison'); M.shutil.rmtree(self.q.private / 'frontend/dist')
        def changed(component):
            result = compile(component); (self.q.private / 'frontend/dist/added.js').write_text('changed'); return result
        self.q.compile_component = Mock(side_effect=changed)
        result = self.q.compile_patched_frontend(original, archive)
        self.assertFalse(result['distEquality']['equal']); self.q.compile_component.assert_called_once_with('frontend')

    def test_changed_dist_executes_existing_six_browser_cases_without_prior_admission(self):
        self.q.state['components']['frontend'] = {'compiledArchiveSha256': 'new', 'distEquality': {'equal': False, 'currentArchiveSha256': 'new'}}
        font = '/usr/share/fonts/synthetic-cjk.ttc'; commands = []
        def command(args, **kwargs):
            commands.append(args)
            if args[0] == 'fc-match': return SimpleNamespace(stdout=font if 'file' in args[1] else 'Noto Sans CJK SC')
            if args[:2] == ['dpkg-query', '-S']: return SimpleNamespace(stdout='fonts-noto-cjk: ' + font)
            if args[:2] == ['dpkg-query', '-W']: return SimpleNamespace(stdout='fixture-version')
            if '.github/scripts/training-mac-browser.mjs' in args:
                folder = self.q.out / 'browser'; folder.mkdir()
                (folder / 'browser-result.json').write_text(json.dumps({'schema': 1, 'status': 'PASS', 'kind': 'compiled-ui-synthetic-api-integration', 'errors': [], 'checks': [{'name': name, 'status': 'PASS'} for name in CHECKS]}))
            return SimpleNamespace(stdout='')
        self.q.command = command
        is_file = M.Path.is_file; sha = M.R.sha
        with patch.object(M.R, 'git', return_value=self.q.inputs['macRuntime']['browserScriptBlob']), patch.object(M.Path, 'is_file', lambda path: True if str(path) == font else is_file(path)), patch.object(M.R, 'sha', side_effect=lambda path: 'font-hash' if str(path) == font else sha(path)):
            result = self.q.browser()
        invocations = [args for args in commands if '.github/scripts/training-mac-browser.mjs' in args]
        self.assertEqual(len(invocations), 1); self.assertNotIn('--prior-browser-result', invocations[0])
        self.assertEqual(len(result['checks']), 6)

    def test_reject_non_actions_execution_before_any_action(self):
        self.q.phase = Mock()
        with patch.dict('os.environ', {'CI': 'false', 'GITHUB_ACTIONS': 'false'}), self.assertRaises(ValueError): self.q.execute()
        self.q.phase.assert_not_called()


if __name__ == '__main__': unittest.main()
