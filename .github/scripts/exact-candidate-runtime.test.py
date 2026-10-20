"""Control-plane contracts only. No Docker, services, builds or application tests."""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

PATH = Path(__file__).with_name('exact-candidate-runtime.py')
SPEC = importlib.util.spec_from_file_location('exact_runtime', PATH)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)
INPUTS = json.loads(PATH.with_name('exact-candidate-runtime-inputs.json').read_text())


class ProducerContracts(unittest.TestCase):
    def setUp(self):
        self.pin = copy.deepcopy(INPUTS['components']['backend'])
        p = self.pin
        self.run = {'id': int(p['runId']), 'run_attempt': int(p['attempt']), 'head_sha': p['head'], 'head_branch': p['branch'], 'event': 'push', 'path': p['workflowPath'], 'status': 'completed', 'conclusion': 'failure'}
        self.job = {'id': p['jobId'], 'run_id': int(p['runId']), 'run_attempt': int(p['attempt']), 'head_sha': p['head'], 'name': p['jobName'], 'conclusion': 'success'}
        self.artifact = {'id': p['artifactId'], 'name': p['artifactName'], 'expired': False, 'size_in_bytes': p['zipBytes'], 'digest': 'sha256:' + p['zipSha256'], 'workflow_run': {'id': int(p['runId']), 'head_sha': p['head']}}

    def check(self):
        M.validate_producer(self.pin, self.run, self.job, self.artifact)

    def test_successful_compile_from_failed_run_is_not_whole_run_success(self):
        self.check()
        self.assertEqual(self.run['conclusion'], 'failure')

    def test_failed_skipped_or_pending_job_rejected(self):
        for status in ('failure', 'skipped', 'cancelled', None):
            with self.subTest(status=status), self.assertRaises(ValueError):
                M.validate_producer(self.pin, self.run, {**self.job, 'conclusion': status}, self.artifact)

    def test_job_identity_source_name_attempt_are_mandatory(self):
        for field in ('id', 'run_id', 'run_attempt', 'head_sha', 'name'):
            with self.subTest(field=field), self.assertRaises(ValueError):
                M.validate_producer(self.pin, self.run, {**self.job, field: 'wrong'}, self.artifact)

    def test_producer_workflow_identity_is_exact(self):
        for field in ('id', 'run_attempt', 'head_sha', 'head_branch', 'event', 'path', 'status'):
            with self.subTest(field=field), self.assertRaises(ValueError):
                M.validate_producer(self.pin, {**self.run, field: 'wrong'}, self.job, self.artifact)

    def test_artifact_identity_size_digest_expiry_required(self):
        for field, wrong in [('id', 0), ('name', 'wrong'), ('expired', True), ('size_in_bytes', 1), ('digest', 'wrong'), ('workflow_run', {'id': 0, 'head_sha': 'wrong'})]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                M.validate_producer(self.pin, self.run, self.job, {**self.artifact, field: wrong})

    def receipt(self, component='backend'):
        p = copy.deepcopy(INPUTS['components'][component])
        receipt = {k: p[k] for k in ('head', 'runId', 'attempt', 'componentTree', 'archiveSha256', 'lockfileSha256', 'buildFlags', 'requiredFiles')}
        names = ['locked official dependencies', 'Prisma generated client', 'production backend build and catalog prerequisites'] if component == 'backend' else ['locked official dependencies', 'production Vite assets']
        receipt.update(status='success', component=component, phases=[{'name': n, 'status': 'success'} for n in names])
        return p, receipt

    def test_both_original_receipt_phase_shapes_are_required(self):
        for component in M.COMPONENTS:
            p, receipt = self.receipt(component)
            raw = json.dumps(receipt).encode(); p['receiptSha256'] = M.digest(raw)
            self.assertEqual(M.validate_receipt(component, p, raw), receipt)
            for altered in ({**receipt, 'status': 'failure'}, {**receipt, 'phases': receipt['phases'][:-1]}, {**receipt, 'phases': [dict(n, status='skipped') for n in receipt['phases']]}, {**receipt, 'buildFlags': {}}):
                raw = json.dumps(altered).encode(); p['receiptSha256'] = M.digest(raw)
                with self.assertRaises(ValueError): M.validate_receipt(component, p, raw)

    def test_raw_receipt_hash_cannot_be_rewritten(self):
        p, receipt = self.receipt()
        with self.assertRaises(ValueError): M.validate_receipt('backend', p, json.dumps(receipt).encode())


class ArchiveContracts(unittest.TestCase):
    def extract(self, entries):
        with tempfile.TemporaryDirectory() as folder:
            archive = Path(folder) / 'input.tar'
            with tarfile.open(archive, 'w') as tar:
                for name, kind, target in entries:
                    member = tarfile.TarInfo(name)
                    if kind == 'file':
                        member.size = 1; tar.addfile(member, io.BytesIO(b'x'))
                    else:
                        member.type = {'link': tarfile.SYMTYPE, 'hard': tarfile.LNKTYPE, 'device': tarfile.CHRTYPE}[kind]
                        member.linkname = target; tar.addfile(member)
            M.safe_extract(archive, Path(folder) / 'out', {'dist', 'node_modules'})
            return sorted(str(p.relative_to(Path(folder) / 'out')) for p in (Path(folder) / 'out').rglob('*'))

    def test_dist_dependencies_and_internal_npm_bin_links_supported(self):
        result = self.extract([('dist/index.js', 'file', ''), ('node_modules/pkg/bin.js', 'file', ''), ('node_modules/.bin/pkg', 'link', '../pkg/bin.js')])
        self.assertIn('node_modules/.bin/pkg', result)

    def test_path_escape_unknown_root_duplicate_hardlink_device_rejected(self):
        bad = [[('../outside', 'file', '')], [('/tmp/escape', 'file', '')], [('assets/file', 'file', '')], [('dist/index.js', 'file', ''), ('dist/index.js', 'file', '')], [('dist/hard', 'hard', 'dist/index.js')], [('dist/device', 'device', '')]]
        for entries in bad:
            with self.subTest(entries=entries), self.assertRaises(ValueError): self.extract(entries)

    def test_official_esbuild_internal_hardlink_to_prior_regular_file_is_supported(self):
        target = 'node_modules/@esbuild/linux-x64/bin/esbuild'
        link = 'node_modules/esbuild/bin/esbuild'
        result = self.extract([(target, 'file', ''), (link, 'hard', target)])
        self.assertIn(link, result)

    def test_hardlink_escape_chain_forward_missing_and_cross_root_targets_rejected(self):
        target = 'node_modules/pkg/bin'
        link = 'node_modules/.bin/pkg'
        cases = [
            [(target, 'file', ''), (link, 'hard', '/etc/passwd')],
            [(target, 'file', ''), (link, 'hard', '../../etc/passwd')],
            [(target, 'file', ''), (link, 'hard', 'node_modules/missing')],
            [(link, 'hard', target), (target, 'file', '')],
            [(target, 'file', ''), (link, 'hard', target), ('node_modules/chain', 'hard', link)],
            [('node_modules/sym', 'link', 'pkg/bin'), (link, 'hard', 'node_modules/sym')],
            [('dist/index.js', 'file', ''), (link, 'hard', 'dist/index.js')],
            [(target, 'file', ''), (link, 'hard', target), (link + '/child', 'file', '')],
        ]
        for entries in cases:
            with self.subTest(entries=entries), self.assertRaises(ValueError): self.extract(entries)

    def test_external_and_write_through_symlinks_rejected(self):
        for entries in [[('node_modules/out', 'link', '/etc')], [('node_modules/out', 'link', '../../etc')], [('node_modules/out', 'link', 'pkg'), ('node_modules/out/file', 'file', '')]]:
            with self.subTest(entries=entries), self.assertRaises(ValueError): self.extract(entries)


class RecipeContracts(unittest.TestCase):
    def recipe(self, component):
        original = (M.ROOT / 'server-version' / component / 'Dockerfile').read_text()
        return M.runtime_recipe(component, original, 'node@sha256:' + 'a' * 64, 'nginx@sha256:' + 'b' * 64)

    def test_never_compile_install_generate_or_replay(self):
        for component in M.COMPONENTS:
            recipe = self.recipe(component)
            for forbidden in ('npm run build', 'npm ci', 'prisma generate', 'tsc', 'vitest', 'npm test', 'npx'):
                # Runtime removes the npx binary, but must never execute it.
                self.assertNotIn(forbidden if forbidden != 'npx' else 'RUN npx', recipe)
            self.assertIn('@sha256:', recipe)

    def test_backend_retains_prod_prune_npm_removal_libraries_nonroot(self):
        recipe = self.recipe('backend')
        self.assertIn('npm prune --omit=dev --ignore-scripts --offline', recipe)
        self.assertIn('ffmpeg', recipe)
        self.assertIn('rm -rf /usr/local/lib/node_modules/npm', recipe)
        self.assertIn('USER node', recipe)
        self.assertIn('COPY --from=build --chown=node:node /app/assets', recipe)

    def test_frontend_retains_security_updates_and_exact_nginx_config(self):
        recipe = self.recipe('frontend')
        self.assertIn('apk upgrade --no-cache', recipe)
        self.assertIn("'libexpat>=2.8.5-r0'", recipe)
        self.assertIn('COPY nginx.conf /etc/nginx/conf.d/default.conf', recipe)

    def test_changed_recipe_or_nonofficial_unpinned_base_rejected(self):
        original = (M.ROOT / 'server-version/backend/Dockerfile').read_text()
        for node in ('node:latest', 'evil@sha256:' + 'a' * 64):
            with self.assertRaises(ValueError): M.runtime_recipe('backend', original, node, '')
        with self.assertRaises(ValueError): M.runtime_recipe('backend', original.replace('AS runtime', 'AS other'), 'node@sha256:' + 'a' * 64, '')


class FrozenInputsContracts(unittest.TestCase):
    def test_fixed_source_pins_and_20_additive_migrations(self):
        self.assertEqual(INPUTS['components']['backend']['runId'], '39399331312')
        self.assertEqual(INPUTS['runtime']['base'], 'e8c74d852f38a0c76d40e80d8e72834b9cc6a078')
        added, old = M.migration_inputs(INPUTS['runtime']['base'])
        self.assertTrue(old)
        self.assertEqual(added, INPUTS['runtime']['newMigrations'])
        self.assertEqual(len(added), 20)

    def test_frozen_component_inputs_match_current_tree(self):
        for component, pin in INPUTS['components'].items():
            self.assertEqual(M.git('rev-parse', 'HEAD:server-version/' + component), pin['sourceTree'])
            self.assertEqual(M.input_inventory(component, pin['excludedNonProductionPaths']), pin['productionInputSha256'])
            self.assertEqual(M.sha(M.ROOT / 'server-version' / component / 'package-lock.json'), pin['lockfileSha256'])

    def test_original_migration_change_or_delete_rejected(self):
        old = b'100644 blob a\tserver-version/backend/prisma/migrations/20260101000000_a/migration.sql\n'
        current = b'100644 blob b\tserver-version/backend/prisma/migrations/20260101000000_a/migration.sql\n'
        with patch.object(subprocess, 'check_output', side_effect=[old.decode(), current.decode()]), self.assertRaises(ValueError): M.migration_inputs('a' * 40)

    def test_no_live_ports_host_network_external_database_or_blanket_prune(self):
        source = PATH.read_text()
        for forbidden in ("'--network', 'host'", "'--publish'", "'system', 'prune'", 'DATABASE_URL_ADMIN'):
            self.assertNotIn(forbidden, source)
        self.assertIn("'--internal', network", source)
        self.assertIn("'--tmpfs', '/var/lib/postgresql/data:rw'", source)
        self.assertIn("'rm', '-f', '-v', container", source)

    def test_sanitized_public_receipts_and_original_ids(self):
        source = PATH.read_text()
        self.assertIn("'receiptSha256', 'archiveSha256'", source)
        self.assertIn("'runtimeImages'", source)
        self.assertIn("'errorType'", source.replace('errorType=', "'errorType'"))
        self.assertNotIn("row['stderr']", source)
        self.assertIn("'HIGH,CRITICAL'", source)
        self.assertIn("'--ignore-unfixed'", source)
        self.assertIn("'--exit-code', '1'", source)
        self.assertIn("'--exit-on-error'", source)


class FailureReceiptContracts(unittest.TestCase):
    def instance(self, folder):
        q = M.Qualification.__new__(M.Qualification)
        q.out = Path(folder) / 'public'; q.out.mkdir()
        q.private = Path(folder) / 'private'; q.private.mkdir()
        q.state_path = q.private / 'state.json'
        q.identity = {'schema': 1, 'head': 'a' * 40, 'sourceHead': 'b' * 40, 'tree': 'c' * 40, 'planSha256': 'd' * 64, 'inputsSha256': 'e' * 64}
        q.inputs = INPUTS
        q.state = {**q.identity, 'status': 'running', 'phases': [], 'components': {}}
        return q

    def test_error_never_turns_into_pass_or_leaks_exception_content(self):
        with tempfile.TemporaryDirectory() as folder:
            q = self.instance(folder)
            def fail(): raise ValueError('private connection credential must not be public')
            with self.assertRaises(ValueError): q.phase('dependency-audit', fail)
            report = json.loads((q.out / 'runtime-result.json').read_text())
            self.assertEqual(report['status'], 'failure')
            self.assertEqual(report['phases'][0]['status'], 'failure')
            self.assertEqual(report['phases'][0]['errorType'], 'ValueError')
            self.assertNotIn('credential', (q.out / 'runtime-result.json').read_text())
            self.assertEqual(report['phases'][0]['producers']['backend']['runId'], '39399331312')
            self.assertEqual(report['phases'][0]['planSha256'], 'd' * 64)

    def test_missing_prerequisite_and_silent_retry_fail_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            q = self.instance(folder)
            with self.assertRaises(ValueError): q.ready('prepare')
            q.phase('prepare', lambda: {'compiled': False})
            q.ready('prepare')
            with self.assertRaises(ValueError): q.phase('prepare', lambda: {})
            with self.assertRaises(ValueError): q.ready('runtime-packaging')

    def test_later_runtime_identity_binds_earlier_phase_receipt_without_rerun(self):
        with tempfile.TemporaryDirectory() as folder:
            q = self.instance(folder)
            q.phase('prepare', lambda: {})
            q.state['components']['backend'] = {'runtimeImageId': 'sha256:' + 'f' * 64}
            q.save()
            report = json.loads((q.out / 'prepare.json').read_text())
            self.assertEqual(report['runtimeImages']['backend'], 'sha256:' + 'f' * 64)
            self.assertEqual(len(q.state['phases']), 1)

    def test_consumer_cannot_run_from_unofficial_environment(self):
        with tempfile.TemporaryDirectory() as folder:
            q = self.instance(folder)
            with patch.dict(M.os.environ, {'CI': 'true', 'GITHUB_ACTIONS': 'false'}), self.assertRaises(ValueError):
                q.execute('runtime-packaging')


class FrozenPlanContracts(unittest.TestCase):
    def plan(self):
        return {'schema': 1, 'route': 'exact-candidate', 'candidate': 'measurement', 'head': 'a' * 40, 'sourceHead': 'b' * 40, 'tree': 'c' * 40, 'base': INPUTS['runtime']['base'], 'components': copy.deepcopy(INPUTS['components']), 'runtime': copy.deepcopy(INPUTS['runtime']), 'required': list(M.PHASES)}

    def test_wrong_scope_or_incomplete_identity_rejected_before_execution(self):
        for key, value in [('schema', 2), ('route', 'legacy'), ('candidate', 'arbitrary'), ('head', ''), ('tree', 'not-a-hash'), ('sourceHead', None)]:
            plan = self.plan(); plan[key] = value
            with self.subTest(key=key), self.assertRaises((ValueError, TypeError)): M.validate_plan(plan, INPUTS)

    def test_checkout_tree_and_runtime_input_mutations_are_rejected(self):
        plan = self.plan()
        with patch.object(M, 'git', return_value='wrong'), self.assertRaises(ValueError): M.validate_plan(plan, INPUTS)
        for mutation in ('producer', 'recipe', 'base', 'missing-gate'):
            plan = self.plan()
            if mutation == 'producer': plan['components']['frontend']['artifactId'] = 1
            if mutation == 'recipe': plan['runtime']['nodeImage'] = 'node:latest'
            if mutation == 'base': plan['base'] = '0' * 40
            if mutation == 'missing-gate': plan['required'].remove('runtime-scans')
            with self.subTest(mutation=mutation), patch.object(M, 'git', side_effect=['a' * 40, 'c' * 40]), self.assertRaises(ValueError): M.validate_plan(plan, INPUTS)


class CleanupAndLoggingContracts(unittest.TestCase):
    def cleanup(self, failed_remove=False, timeout_remove=False, exists=True):
        calls = []; remaining = {'owned-db', 'owned-network'} if exists else set()
        def command(args, **kwargs):
            calls.append(args)
            if args[1:3] == ['container', 'ls']:
                out = 'owned-db' if 'owned-db' in remaining else ''
            elif args[1:3] == ['network', 'ls']:
                out = 'owned-network' if 'owned-network' in remaining else ''
            else:
                name = args[-1]
                if failed_remove and name == 'owned-db': raise RuntimeError('failed')
                remaining.discard(name)
                if timeout_remove: raise subprocess.TimeoutExpired(args, 1)
                out = name
            return subprocess.CompletedProcess(args, 0, out, '')
        return calls, remaining, command

    def test_network_cleanup_still_attempted_if_container_cleanup_fails(self):
        calls, remaining, command = self.cleanup(failed_remove=True)
        with self.assertRaises(ValueError): M.remove_isolated_resources(command, 'owned-db', 'owned-network', True, True)
        self.assertIn(['docker', 'network', 'rm', 'owned-network'], calls)
        self.assertEqual(remaining, {'owned-db'})

    def test_only_attempted_resources_are_removed(self):
        calls, remaining, command = self.cleanup()
        M.remove_isolated_resources(command, 'owned-db', 'owned-network', False, True)
        self.assertEqual(remaining, {'owned-db'})
        self.assertNotIn(['docker', 'rm', '-f', '-v', 'owned-db'], calls)

    def test_uncertain_create_is_reconciled_and_absence_is_not_a_failure(self):
        for exists in (True, False):
            calls, remaining, command = self.cleanup(exists=exists)
            # These flags represent attempts, not successful create responses.
            M.remove_isolated_resources(command, 'owned-db', 'owned-network', True, True)
            self.assertFalse(remaining)
        source = PATH.read_text()
        self.assertLess(source.index('attempted_container = True'), source.index("self.command(['docker', 'run', '-d', '--name', name"))
        self.assertLess(source.index('attempted_network = True'), source.index("self.command(['docker', 'network', 'create', '--internal', network])"))

    def test_uncertain_successful_remove_is_verified_without_retry(self):
        calls, remaining, command = self.cleanup(timeout_remove=True)
        M.remove_isolated_resources(command, 'owned-db', 'owned-network', True, True)
        self.assertFalse(remaining)
        self.assertEqual(calls.count(['docker', 'rm', '-f', '-v', 'owned-db']), 1)

    def test_top_level_timeout_redacts_command_and_connection_string(self):
        args = ['runtime.py', '--plan', 'plan.json', '--phase', 'all', '--output', 'public']
        stderr = io.StringIO()
        with patch.object(M.sys, 'argv', args), patch.object(M.sys, 'stderr', stderr), patch.object(M, 'Qualification', side_effect=subprocess.TimeoutExpired(['docker', 'run', 'DATABASE_URL=private'], 1)), self.assertRaises(SystemExit) as error:
            M.main()
        self.assertEqual(error.exception.code, 1)
        self.assertIn('TimeoutExpired', stderr.getvalue())
        self.assertNotIn('DATABASE_URL', stderr.getvalue())
        self.assertNotIn('private', stderr.getvalue())

    def test_safe_error_location_identifies_guard_without_exception_text(self):
        try:
            M.validate_receipt('private-user-value', {}, b'secret connection text')
        except KeyError as error:
            result = M.safe_error_details(error)
        self.assertEqual(result['errorType'], 'KeyError')
        self.assertEqual(result['errorLocation']['helper'], 'validate_receipt')
        self.assertIsInstance(result['errorLocation']['line'], int)
        self.assertNotIn('private-user-value', json.dumps(result))
        self.assertNotIn('secret connection', json.dumps(result))
        self.assertNotIn('receiptSha256', json.dumps(result))

    def test_dump_preserves_acl_and_verifies_ownership_privileges(self):
        source = PATH.read_text()
        self.assertNotIn('--no-acl', source)
        self.assertIn('ownershipAndAclPreserved=True', source)
        self.assertIn('Restored ownership or ACLs differ', source)
        self.assertIn('Restored role privileges widened', source)


class TypecheckContracts(unittest.TestCase):
    def test_only_explicit_affected_app_types_are_selected(self):
        self.assertIn('frontend-app-types', M.PHASES)
        source = PATH.read_text()
        self.assertIn("'node_modules/typescript/bin/tsc', '-p', 'tsconfig.app.json', '--noEmit'", source)
        self.assertNotIn('tsconfig.cognitive.json', source)
        self.assertNotIn('pretypecheck', source)
        self.assertIn('frontendExternalInputs', source)

    def test_external_fixture_hash_is_explicit_and_matches_frozen_source(self):
        for path, expected in INPUTS['runtime']['frontendExternalInputs'].items():
            self.assertEqual(M.git('rev-parse', 'HEAD:' + path), expected['gitBlob'])
            self.assertEqual(M.sha(M.ROOT / path), expected['sha256'])


if __name__ == '__main__':
    unittest.main()
