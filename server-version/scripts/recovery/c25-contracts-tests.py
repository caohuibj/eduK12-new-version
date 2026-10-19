#!/usr/bin/env python3
"""New C25 dual-artifact acceptance tests, synthetic files and mocked processes.

Only the owner runs these under the measurement lock. No compiler, client
producer, Git process, service, database, browser, or clone is invoked. These
tests exercise the new C25 receipt/launcher wiring, not the old C23 test suite.
"""
import ast
from contextlib import ExitStack
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('c25_contracts_tested', BASE / 'c25-contracts.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class SyntheticArtifacts:
    """Tiny source, compiler-byte, client and independent dual-receipt fixture."""
    def __enter__(self):
        self.stack = ExitStack()
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.repo = self.root / 'repo'
        self.backend = self.repo / 'server-version/backend'
        self.frontend = self.repo / 'server-version/frontend'
        self.harness = self.repo / 'server-version/scripts/recovery'
        self.evidence = self.root / 'evidence'
        self.evidence.mkdir()
        self.tools = self.root / 'tools'
        self.node = self.tools / 'node_modules/node/bin/node'
        self.pg = self.tools / 'postgresql/bin'
        self.redis = self.tools / 'redis/bin/redis-server'
        self.head, self.changed, self.dirty, self.untracked, self.ancestor = 'a' * 40, [], False, b'', True
        self.fingerprint = {'syntheticRuntimeFingerprint': 'accepted'}
        self.tracked = []
        self.receipts, self.receipt_paths, self.receipt_sha = {}, {}, {}
        for component in [self.backend, self.frontend]:
            for name, content in {
                'package.json': '{}', 'package-lock.json': '{}', 'src/index.ts': 'synthetic source',
                'tsconfig.json': json.dumps({'compilerOptions': {'outDir': './dist'}}),
                'scripts/verify.cjs': 'synthetic helper', 'public/asset.txt': 'synthetic asset',
            }.items():
                self.write(component / name, content)
                self.tracked.append(str((component / name).relative_to(self.repo)))
        self.write(self.backend / 'prisma/schema.prisma', 'model Synthetic { id String @id }')
        self.tracked.append(str((self.backend / 'prisma/schema.prisma').relative_to(self.repo)))
        for name in ['c25-produce.py', 'c25-contracts.py', 'c25-verify-client.py', 'c25-fixture.mjs', 'runtime-fingerprint.cjs']:
            self.write(self.harness / name, 'synthetic helper bytes: ' + name)
            self.tracked.append(str((self.harness / name).relative_to(self.repo)))
        for component, names in [(self.backend, ['typescript/bin/tsc', 'typescript/lib/_tsc.js', 'typescript/package.json',
                                                '.prisma/client/index.js', '.prisma/client/schema.prisma']),
                                 (self.frontend, ['vite/bin/vite.js', 'vite/package.json'])]:
            for name in names:
                self.write(component / 'node_modules' / name, 'synthetic installed bytes: ' + name)
        self.write(self.backend / 'dist/index.js', 'synthetic emitted backend bytes, not executable')
        self.write(self.frontend / 'dist/index.html', 'synthetic emitted frontend bytes')
        self.write(self.node, 'synthetic node bytes, never executed')
        self.write(self.tools / 'python', 'synthetic Python identity bytes')
        for name in ['postgres', 'psql', 'pg_dump', 'pg_restore', 'pg_controldata']:
            self.write(self.pg / name, 'synthetic tool bytes, never executed: ' + name)
        self.write(self.tools / 'postgresql/lib/synthetic.so', 'synthetic library bytes')
        self.write(self.redis, 'synthetic redis bytes, never executed')
        self.stack.enter_context(mock.patch.object(c, 'BASE', self.harness))
        self.stack.enter_context(mock.patch.object(c, 'git', side_effect=self.git))
        self.stack.enter_context(mock.patch.object(c.subprocess, 'run', side_effect=self.run))
        self.stack.enter_context(mock.patch.object(c.subprocess, 'check_output', side_effect=self.check_output))
        self.stack.enter_context(mock.patch.object(c.subprocess, 'Popen', side_effect=AssertionError('no process creation in pure tests')))
        self.python = {'realpath': str((self.tools / 'python').resolve()), 'sha256': c.sha_file(self.tools / 'python'), 'version': 'synthetic Python'}
        self.verifier = SimpleNamespace(
            python_identity=lambda: copy.deepcopy(self.python),
            python_helper_closure=self.python_helpers,
            schema_agreement=lambda backend: {'schemaTokensMatch': True, 'syntheticSchemaBytes': c.sha_file(backend / 'prisma/schema.prisma')})
        self.stack.enter_context(mock.patch.object(c, 'module', side_effect=self.module))
        self.client_path = self.evidence / 'synthetic-current-client.receipt.json'
        self.client = {
            'scope': 'EXISTING_GENERATED_CLIENT_VERIFIED_NOT_GENERATION_PROVENANCE', 'head': self.head,
            **{key: True for key in ['passed', 'inputsUnchanged', 'clientUnchanged', 'dependenciesUnchanged',
                                    'pythonHelpersUnchanged', 'installedNativeEngineMatches', 'pythonUnchanged', 'compilerUnchanged']},
            'nodeVersion': 'v24.21.0', 'nodeSha256': c.sha_file(self.node),
            'verificationToolSha256': c.sha_file(self.harness / 'c25-verify-client.py'),
            'pythonHelperClosure': self.python_helpers(self.harness), 'python': self.python,
            'compiler': c.backend_compiler(self.backend), 'dependencies': c.dependency_inventory(self.backend),
            'client': c.file_inventory(self.backend, 'node_modules/.prisma/client'),
            'inputs': {name: c.sha_file(self.backend / name) for name in ['prisma/schema.prisma', 'package.json', 'package-lock.json', 'tsconfig.json']},
            'schemaAgreement': self.verifier.schema_agreement(self.backend),
            'runtimeMetadata': {key: True for key in ['inlineSchemaExact', 'runtimeFieldMetadataMatches', 'modelMappingsMatch', 'enumValuesAndMappingsMatch']},
        }
        self.write_json(self.client_path, self.client)
        for kind in ['backend', 'frontend']:
            self.make_receipt(kind)
        return self

    def __exit__(self, *args):
        return self.stack.__exit__(*args)

    def write(self, path, content):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def write_json(self, path, value):
        self.write(path, json.dumps(value, sort_keys=True))

    def module(self, _name, filename):
        assert filename == 'c25-verify-client.py', 'unexpected module import from pure acceptance fixture'
        return self.verifier

    def python_helpers(self, base):
        return {str(path.relative_to(base)): {'realpath': str(path.resolve()), 'mode': path.stat().st_mode & 0o777, 'sha256': c.sha_file(path)}
                for path in sorted(base.rglob('*.py'))}

    def git(self, *args, repo=None):
        if args == ('rev-parse', 'HEAD'):
            return (self.head + '\n').encode()
        if args[:2] == ('diff', '--name-only'):
            return '\n'.join(self.changed).encode()
        if args[:2] == ('ls-files', '--others'):
            return self.untracked
        if args[:2] == ('ls-files', '-z'):
            prefixes = args[args.index('--') + 1:]
            names = [name for name in self.tracked if any(name == prefix or name.startswith(prefix + '/') for prefix in prefixes)]
            return b'\0'.join(name.encode() for name in names) + (b'\0' if names else b'')
        raise AssertionError('unexpected Git request in synthetic fixture: ' + repr(args))

    def run(self, command, **_):
        assert command[0] == 'git', 'no external executable is permitted by pure tests'
        if command[1:3] == ['diff', '--quiet']:
            return SimpleNamespace(returncode=int(self.dirty))
        if command[1:3] == ['merge-base', '--is-ancestor']:
            return SimpleNamespace(returncode=0 if self.ancestor else 1)
        raise AssertionError('unexpected subprocess request')

    def check_output(self, command, **_):
        assert list(map(str, command)) == [str(self.node), str(self.harness / 'runtime-fingerprint.cjs'), str(self.backend)]
        return json.dumps(self.fingerprint)

    def steps(self, kind):
        component = self.backend if kind == 'backend' else self.frontend
        result = []
        if kind == 'backend':
            result.append({'name': 'verify-current-client', 'command': [sys.executable, str(self.harness / 'c25-verify-client.py'),
                '--backend', str(component), '--node', str(self.node), '--expected-head', self.head, '--receipt', str(self.client_path)],
                'cwd': str(component), 'exitCode': 0})
        result.append({'name': kind + '-emit', 'command': [str(self.node), 'node_modules/typescript/bin/tsc'] if kind == 'backend'
                       else [str(self.node), 'node_modules/vite/bin/vite.js', 'build'], 'cwd': str(component), 'exitCode': 0})
        return result

    def make_receipt(self, kind):
        component = self.backend if kind == 'backend' else self.frontend
        output = self.evidence / kind
        output.mkdir()
        closure = {'head': self.head, 'inputs': c.component_inputs(component, self.repo),
                   'sourceHelperClosure': c.source_inventory(self.repo), 'dependencies': c.dependency_inventory(component),
                   'client': c.file_inventory(self.backend, 'node_modules/.prisma/client'),
                   'compiler': c.backend_compiler(component) if kind == 'backend' else c.frontend_compiler(component),
                   'tools': {str(path): {'realpath': str(path.resolve()), 'sha256': c.sha_file(path)} for path in [
                       self.node, self.tools / 'python', self.harness / 'c25-produce.py', self.harness / 'c25-contracts.py', self.harness / 'c25-verify-client.py']}}
        refs = {}
        for name in ['before', 'after']:
            path = output / ('closure-' + name + '.json')
            self.write_json(path, closure)
            refs[name] = {'path': str(path), 'sha256': c.sha_file(path)}
        self.receipt_paths[kind] = output / (kind + '-build.receipt.json')
        self.receipts[kind] = {
            'scope': 'C25_' + kind.upper() + '_SINGLE_EMITTING_BUILD', 'producerResultPath': str(output / 'producer-result.json'),
            **{key: True for key in ['passed', 'inputsUnchanged', 'dependenciesUnchanged', 'clientUnchanged',
                                    'sourceHelpersUnchanged', 'compilerUnchanged', 'toolsUnchanged']},
            'nodeVersion': 'v24.21.0', 'nodeSha256': c.sha_file(self.node), **closure,
            'dist': c.file_inventory(component, 'dist'), 'steps': self.steps(kind), 'closureEvidence': refs,
            'producer': {'path': str(self.harness / 'c25-produce.py'), 'sha256': c.sha_file(self.harness / 'c25-produce.py')},
            'prismaClientReceipt': {'path': str(self.client_path), 'sha256': c.sha_file(self.client_path)},
        }
        self.save_receipt(kind)

    def save_receipt(self, kind):
        self.write_json(self.receipt_paths[kind], self.receipts[kind])
        self.receipt_sha[kind] = c.sha_file(self.receipt_paths[kind])
        self.write_json(Path(self.receipts[kind]['producerResultPath']),
                        {'passed': True, 'kind': kind, 'expectedHead': self.head, 'steps': self.receipts[kind]['steps'],
                         'receipt': {'path': str(self.receipt_paths[kind].resolve()), 'sha256': self.receipt_sha[kind]}})

    def validate(self, kind):
        return c.validate_build(self.receipt_paths[kind], self.receipt_sha[kind], kind, self.head, self.node, self.repo)

    def launcher_scope(self):
        """Actual new nested dual-build/binding functions, all external reads mocked."""
        names = {'validate_build', 'receipt_references', 'binding', 'verify'}
        tree = ast.parse((BASE / 'c25-http.py').read_text())
        main = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'main')
        functions = [node for node in main.body if isinstance(node, ast.FunctionDef) and node.name in names]
        assert {node.name for node in functions} == names
        facade = SimpleNamespace(**{name: getattr(c, name) for name in [
            'accepted_binding', 'git', 'file_inventory', 'dependency_inventory']})
        facade.validate_build = lambda path, sha, kind, head, node: c.validate_build(path, sha, kind, head, node, self.repo)
        facade.source_inventory = lambda: c.source_inventory(self.repo)
        facade.component_inputs = lambda component: c.component_inputs(component, self.repo)
        descriptor_path = self.evidence / 'descriptor.json'
        self.write_json(descriptor_path, {'syntheticDescriptor': True})
        args = SimpleNamespace(backend_receipt=self.receipt_paths['backend'], frontend_receipt=self.receipt_paths['frontend'],
                               expected_backend_receipt_sha256=self.receipt_sha['backend'], expected_frontend_receipt_sha256=self.receipt_sha['frontend'],
                               expected_head=self.head, descriptor=descriptor_path, expected_descriptor_sha256=c.sha_file(descriptor_path))
        scope = {'a': args, 'preflight': facade, 'BACKEND': self.backend, 'FRONTEND': self.frontend, 'BASE': self.harness,
                 'Path': Path, 'sys': sys, 'json': json, 'subprocess': c.subprocess, 'node': self.node, 'tools': self.tools,
                 'pg': self.pg, 'redis': self.redis, 'sha_file': c.sha_file, 'digest': c.digest,
                 'effective': {'syntheticRuntime': True}, 'requested': list(c.PHASES), 'descriptor': {'syntheticDescriptor': True},
                 'source_contract': SimpleNamespace(assert_unchanged=lambda *_: None)}
        exec(compile(ast.Module(body=functions, type_ignores=[]), 'actual-c25-dual-artifact-binding', 'exec'), scope)
        scope['backend_build'], scope['frontend_build'] = scope['validate_build']()
        scope['pinned'] = c.accepted_binding(scope['binding'], scope['validate_build'], self.head)
        return scope


class EmissionAndScopeContracts(unittest.TestCase):
    def test_exact_one_backend_and_frontend_emission_shapes(self):
        with SyntheticArtifacts() as fixture:
            for kind, component in [('backend', fixture.backend), ('frontend', fixture.frontend)]:
                c.emitted_build(fixture.steps(kind), component, fixture.node, kind)

    def test_noemit_alternate_duplicate_failed_or_wrong_component_emits_rejected(self):
        with SyntheticArtifacts() as fixture:
            for kind, component in [('backend', fixture.backend), ('frontend', fixture.frontend)]:
                for mutation in [lambda rows: rows[-1]['command'].append('--noEmit'),
                                 lambda rows: rows[-1]['command'].extend(['--mode', 'production']),
                                 lambda rows: rows.append(copy.deepcopy(rows[-1])),
                                 lambda rows: rows.append({**rows[-1], 'command': rows[-1]['command'] + ['--project', 'tsconfig.json']}),
                                 lambda rows: rows[-1].update(exitCode=1),
                                 lambda rows: rows[-1].update(cwd='/wrong/component'),
                                 lambda rows: rows[-1].update(name='other-emit'),
                                 lambda rows: rows[-1]['command'].__setitem__(0, '/wrong/node')]:
                    steps = fixture.steps(kind)
                    mutation(steps)
                    with self.subTest(kind=kind, steps=steps), self.assertRaises(AssertionError):
                        c.emitted_build(steps, component, fixture.node, kind)

    def test_backend_verifier_shape_and_exact_receipt_reference_required(self):
        with SyntheticArtifacts() as fixture:
            for mutation in [lambda rows: rows.pop(0), lambda rows: rows[0].update(exitCode=1),
                             lambda rows: rows[0].update(name='generation'),
                             lambda rows: rows[0]['command'].__setitem__(1, '/wrong/verifier.py'),
                             lambda rows: rows[0]['command'].__setitem__(3, str(fixture.frontend)),
                             lambda rows: rows[0]['command'].__setitem__(5, '/wrong/node')]:
                steps = fixture.steps('backend')
                mutation(steps)
                with self.assertRaises(AssertionError):
                    c.emitted_build(steps, fixture.backend, fixture.node, 'backend')
            for index, value in [(7, 'b' * 40), (9, '/wrong/client-receipt.json')]:
                fixture.receipts['backend']['steps'] = fixture.steps('backend')
                fixture.receipts['backend']['steps'][0]['command'][index] = value
                fixture.save_receipt('backend')
                with self.assertRaises(AssertionError):
                    fixture.validate('backend')

    def test_only_explicit_committed_c25_harness_differences_reused(self):
        name = 'server-version/scripts/recovery/c25-fixture.mjs'
        c.validate_source_reuse({name: 'before'}, {name: 'after'}, [name])
        with self.assertRaises(AssertionError):
            c.validate_source_reuse({name: 'before'}, {name: 'after'}, [])
        for forbidden in ['server-version/backend/src/index.ts', 'server-version/frontend/src/index.ts',
                          'server-version/backend/prisma/schema.prisma', 'server-version/backend/prisma/migrations/20261019060000_training_feedback_release/migration.sql',
                          'server-version/backend/package-lock.json', 'server-version/scripts/recovery/c23-checkpoint-db.py']:
            with self.assertRaises(AssertionError):
                c.validate_source_reuse({forbidden: 'before'}, {forbidden: 'after'}, [forbidden])

    def test_ignored_source_config_env_and_nested_helpers_are_input_bytes(self):
        with SyntheticArtifacts() as fixture:
            for component in [fixture.backend, fixture.frontend]:
                baseline = c.component_inputs(component, fixture.repo)
                for name in ['.env.local', 'ignored.config.json', 'src/ignored-extra.ts', 'scripts/ignored-helper.cjs', 'public/ignored-asset.txt']:
                    path = component / name
                    fixture.write(path, 'new ignored input')
                    current = c.component_inputs(component, fixture.repo)
                    self.assertEqual(current[name], c.sha_file(path))
                    self.assertNotEqual(current, baseline)
                    path.unlink()
                    self.assertEqual(c.component_inputs(component, fixture.repo), baseline)

    def test_complete_requires_exact_six_phases_and_all_final_invariants(self):
        result = {'phases': {phase: {'passed': True} for phase in c.PHASES}, 'apiStoppedAfterScheduled': True, 'apiLifetime': {'stopped': True, 'expired': False},
                  **dict.fromkeys(['cleanupVerified', 'sourceUnchanged', 'inputsUnchanged', 'finalSnapshotVerified'], True)}
        self.assertEqual(c.PHASES, ['upgrade', 'prepare', 'scheduled', 'guards', 'consumers', 'restore'])
        self.assertTrue(c.complete(result))
        for phase in c.PHASES:
            bad = copy.deepcopy(result)
            del bad['phases'][phase]
            self.assertFalse(c.complete(bad))
            bad = copy.deepcopy(result)
            bad['phases'][phase]['passed'] = False
            self.assertFalse(c.complete(bad))
        for field in ['cleanupVerified', 'sourceUnchanged', 'inputsUnchanged', 'finalSnapshotVerified', 'apiStoppedAfterScheduled']:
            self.assertFalse(c.complete({**result, field: False}))
        bad = copy.deepcopy(result)
        bad['phases']['unapproved-extra'] = {'passed': True}
        self.assertFalse(c.complete(bad))

        for lifetime in [{}, {'stopped': False, 'expired': False}, {'stopped': True, 'expired': True}]:
            self.assertFalse(c.complete({**result, 'apiLifetime': lifetime}))


class ArtifactReceiptContracts(unittest.TestCase):
    def test_coherent_independent_backend_and_frontend_receipts_accept(self):
        with SyntheticArtifacts() as fixture:
            for kind in ['backend', 'frontend']:
                self.assertEqual(fixture.validate(kind), fixture.receipts[kind])

    def test_committed_mjs_harness_change_reuses_build_but_business_change_cannot(self):
        with SyntheticArtifacts() as fixture:
            changed = fixture.harness / 'c25-fixture.mjs'
            changed.write_text('reviewed new C25 harness only')
            fixture.changed = [str(changed.relative_to(fixture.repo))]
            fixture.head = 'b' * 40
            fixture.validate('backend')
            fixture.validate('frontend')
            fixture.changed += ['server-version/backend/src/index.ts']
            fixture.backend.joinpath('src/index.ts').write_text('changed business input')
            for kind in ['backend', 'frontend']:
                with self.assertRaisesRegex(AssertionError, 'only C25 harness'):
                    fixture.validate(kind)

    def test_failed_or_misbound_final_producer_result_never_grants_receipt(self):
        with SyntheticArtifacts() as fixture:
            for kind in ['backend', 'frontend']:
                path = Path(fixture.receipts[kind]['producerResultPath'])
                original = json.loads(path.read_text())
                changes = [{'passed': value} for value in [False, None, 1, 'true']]
                changes += [{'kind': 'frontend' if kind == 'backend' else 'backend'},
                            {'receipt': {**original['receipt'], 'sha256': '0' * 64}},
                            {'receipt': {**original['receipt'], 'path': '/different/receipt'}}]
                for change in changes:
                    fixture.write_json(path, {**original, **change})
                    with self.assertRaises(AssertionError):
                        fixture.validate(kind)
                fixture.write_json(path, original)

    def test_client_receipt_python_compiler_and_consumed_helpers_are_current(self):
        with SyntheticArtifacts() as fixture:
            c.validate_client(fixture.client_path, c.sha_file(fixture.client_path), fixture.node, fixture.head, fixture.repo, fixture.backend)
            for mutation in [lambda row: row.update(pythonUnchanged=False), lambda row: row.update(compilerUnchanged=False),
                             lambda row: row['python'].update(sha256='0' * 64),
                             lambda row: row['compiler'].update({'node_modules/typescript/lib/_tsc.js': '0' * 64}),
                             lambda row: row.update(pythonHelperClosure={})]:
                row = copy.deepcopy(fixture.client)
                mutation(row)
                fixture.write_json(fixture.client_path, row)
                with self.assertRaises(AssertionError):
                    c.validate_client(fixture.client_path, c.sha_file(fixture.client_path), fixture.node, fixture.head, fixture.repo, fixture.backend)

    def test_client_receipt_requires_tsconfig_input_hash(self):
        with SyntheticArtifacts() as fixture:
            # Both producers accept the actual verifier's complete four-key input closure.
            self.assertEqual(set(fixture.client['inputs']), {'prisma/schema.prisma', 'package.json', 'package-lock.json', 'tsconfig.json'})
            fixture.validate('backend')
            fixture.validate('frontend')
            for mutation in [lambda row: row['inputs'].pop('tsconfig.json'),
                             lambda row: row['inputs'].update({'tsconfig.json': '0' * 64})]:
                row = copy.deepcopy(fixture.client)
                mutation(row)
                fixture.write_json(fixture.client_path, row)
                with self.assertRaises(AssertionError):
                    c.validate_client(fixture.client_path, c.sha_file(fixture.client_path), fixture.node, fixture.head, fixture.repo, fixture.backend)

    def test_current_artifact_dependency_compiler_or_ignored_input_mutation_rejected(self):
        with SyntheticArtifacts() as fixture:
            for kind, component, names in [('backend', fixture.backend, ['dist/index.js', 'src/index.ts', 'node_modules/typescript/lib/_tsc.js', 'node_modules/.prisma/client/index.js']),
                                           ('frontend', fixture.frontend, ['dist/index.html', 'src/index.ts', 'node_modules/vite/bin/vite.js'])]:
                for name in names + ['.env.local', 'src/ignored-extra.ts', 'node_modules/new-dependency.js']:
                    path = component / name
                    original = path.read_text() if path.exists() else None
                    fixture.write(path, 'intervening changed bytes')
                    with self.assertRaises(AssertionError):
                        fixture.validate(kind)
                    if original is None:
                        path.unlink()
                    else:
                        path.write_text(original)

    def test_receipt_captured_before_after_closure_cannot_be_replaced_or_detached(self):
        with SyntheticArtifacts() as fixture:
            for kind in ['backend', 'frontend']:
                receipt = fixture.receipts[kind]
                for key in ['inputs', 'dependencies', 'client', 'compiler', 'sourceHelperClosure', 'tools']:
                    originals = {}
                    for name in ['before', 'after']:
                        path = Path(receipt['closureEvidence'][name]['path'])
                        originals[name] = path.read_text()
                        closure = json.loads(originals[name])
                        closure[key] = {'forgedCapturedValue': 'different'}
                        fixture.write_json(path, closure)
                        receipt['closureEvidence'][name]['sha256'] = c.sha_file(path)
                    fixture.save_receipt(kind)
                    with self.assertRaises(AssertionError):
                        fixture.validate(kind)
                    for name, content in originals.items():
                        path = Path(receipt['closureEvidence'][name]['path'])
                        path.write_text(content)
                        receipt['closureEvidence'][name]['sha256'] = c.sha_file(path)
                    fixture.save_receipt(kind)
                path = Path(receipt['closureEvidence']['after']['path'])
                original = path.read_text()
                after = json.loads(original)
                after['head'] = 'b' * 40
                fixture.write_json(path, after)
                receipt['closureEvidence']['after']['sha256'] = c.sha_file(path)
                fixture.save_receipt(kind)
                with self.assertRaisesRegex(AssertionError, 'before/after closure differs'):
                    fixture.validate(kind)
                path.write_text(original)
                receipt['closureEvidence']['after']['sha256'] = c.sha_file(path)
                fixture.save_receipt(kind)

    def test_dirty_untracked_moved_head_or_nonancestor_source_rejected(self):
        with SyntheticArtifacts() as fixture:
            for field, value in [('dirty', True), ('untracked', b'server-version/scripts/recovery/c25-new.py\0'), ('ancestor', False)]:
                original = getattr(fixture, field)
                setattr(fixture, field, value)
                with self.assertRaises(AssertionError):
                    fixture.validate('frontend')
                setattr(fixture, field, original)
            with self.assertRaises(AssertionError):
                c.validate_build(fixture.receipt_paths['frontend'], fixture.receipt_sha['frontend'], 'frontend', 'b' * 40, fixture.node, fixture.repo)


class DualLauncherBindingContracts(unittest.TestCase):
    def test_actual_dual_wiring_requires_one_identical_client_receipt(self):
        with SyntheticArtifacts() as fixture:
            scope = fixture.launcher_scope()
            self.assertEqual(scope['backend_build']['prismaClientReceipt'], scope['frontend_build']['prismaClientReceipt'])
            another = fixture.evidence / 'another-valid-client-receipt.json'
            fixture.write_json(another, fixture.client)
            fixture.receipts['frontend']['prismaClientReceipt'] = {'path': str(another), 'sha256': c.sha_file(another)}
            fixture.save_receipt('frontend')
            scope['a'].expected_frontend_receipt_sha256 = fixture.receipt_sha['frontend']
            with self.assertRaisesRegex(AssertionError, 'identical client'):
                scope['validate_build']()

    def test_actual_dual_artifact_interval_mutations_fail_before_clone(self):
        with SyntheticArtifacts() as fixture:
            scope = fixture.launcher_scope()
            for path in [fixture.backend / 'dist/index.js', fixture.frontend / 'dist/index.html',
                         fixture.backend / 'src/index.ts', fixture.frontend / 'src/index.ts',
                         fixture.frontend / '.env.local', fixture.backend / 'node_modules/.prisma/client/index.js',
                         fixture.evidence / 'frontend/producer-result.json', fixture.client_path]:
                original = path.read_text() if path.exists() else None
                fixture.write(path, 'intervening bytes')
                cloned = []
                with self.assertRaises((AssertionError, json.JSONDecodeError)):
                    scope['verify']()
                    cloned.append(True)
                self.assertEqual(cloned, [])
                if original is None:
                    path.unlink()
                else:
                    path.write_text(original)

    def test_actual_binding_detects_mutation_during_dual_validation(self):
        with SyntheticArtifacts() as fixture:
            scope = fixture.launcher_scope()
            validate = scope['validate_build']
            def changes_during_validation():
                validate()
                fixture.frontend.joinpath('dist/index.html').write_text('mutated after both validations')
            cloned = []
            with self.assertRaisesRegex(AssertionError, 'inputs changed across accepted binding'):
                c.accepted_binding(scope['binding'], changes_during_validation, fixture.head)
                cloned.append(True)
            self.assertEqual(cloned, [])

    def test_actual_binding_pins_runtime_library_config_and_receipt_references(self):
        with SyntheticArtifacts() as fixture:
            scope = fixture.launcher_scope()
            for mutate, restore in [
                (lambda: scope['effective'].update(syntheticRuntime=False), lambda: scope['effective'].update(syntheticRuntime=True)),
                (lambda: fixture.fingerprint.update(syntheticRuntimeFingerprint='changed'), lambda: fixture.fingerprint.update(syntheticRuntimeFingerprint='accepted')),
            ]:
                mutate()
                with self.assertRaisesRegex(AssertionError, 'frozen sources/artifacts/tools/config changed'):
                    scope['verify']()
                restore()
            path = fixture.tools / 'postgresql/lib/synthetic.so'
            path.write_text('mutated library bytes')
            with self.assertRaisesRegex(AssertionError, 'frozen sources/artifacts/tools/config changed'):
                scope['verify']()


class RuntimePythonContracts(unittest.TestCase):
    def test_actual_child_python_path_bytes_identity_and_version_are_frozen(self):
        with SyntheticArtifacts() as fixture:
            scope=fixture.launcher_scope()
            first=fixture.evidence/'python-first';second=fixture.evidence/'python-second'
            first.write_bytes(b'synthetic interpreter one');second.write_bytes(b'synthetic interpreter two')
            alias=fixture.evidence/'python-current';alias.symlink_to(first)
            scope['sys']=SimpleNamespace(executable=str(alias),version='synthetic 3.x')
            scope['pinned']=c.accepted_binding(scope['binding'],scope['validate_build'],fixture.head)
            self.assertEqual(scope['pinned']['launcherPython'],{'path':str(alias),'realpath':str(first.resolve()),'sha256':c.sha_file(first),'version':'synthetic 3.x'})
            mutations=[(lambda:first.write_bytes(b'changed interpreter'),lambda:first.write_bytes(b'synthetic interpreter one')),
                       (lambda:setattr(scope['sys'],'version','changed version'),lambda:setattr(scope['sys'],'version','synthetic 3.x')),
                       (lambda:setattr(scope['sys'],'executable',str(second)),lambda:setattr(scope['sys'],'executable',str(alias)))]
            for mutate,restore in mutations:
                mutate();cloned=[]
                with self.assertRaisesRegex(AssertionError,'frozen sources/artifacts/tools/config changed'):
                    scope['verify']();cloned.append(True)
                self.assertEqual(cloned,[]);restore()
            alias.unlink();alias.symlink_to(second)
            with self.assertRaisesRegex(AssertionError,'frozen sources/artifacts/tools/config changed'):scope['verify']()
            alias.unlink();alias.symlink_to(first)
            original=scope['validate_build']
            def drift_inside_validation():
                original();first.write_bytes(b'changed during validation')
            with self.assertRaisesRegex(AssertionError,'inputs changed across accepted binding'):
                c.accepted_binding(scope['binding'],drift_inside_validation,fixture.head)
        tree=ast.parse((BASE/'c25-http.py').read_text())
        commands=[node for node in ast.walk(tree) if isinstance(node,ast.List) and len(node.elts)>1
                  and isinstance(node.elts[1],ast.BinOp) and isinstance(node.elts[1].right,ast.Constant)
                  and node.elts[1].right.value=='c25-db.py']
        self.assertEqual(len(commands),2)
        for command in commands:self.assertEqual(ast.unparse(command.elts[0]),'sys.executable')


class ApiLifetimeContracts(unittest.TestCase):
    def test_cleanup_entry_alarm_cannot_skip_bounded_writer_or_postgres_shutdown(self):
        tree=ast.parse((BASE/'c25-http.py').read_text())
        main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
        final=next(n.finalbody for n in main.body if isinstance(n,ast.Try) and n.finalbody)
        finish=next(i for i,n in enumerate(final) if isinstance(n,ast.Expr)
                    and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute)
                    and n.value.func.attr=='finish_database')
        functions=[n for n in main.body if isinstance(n,ast.FunctionDef)
                   and n.name in {'stop_child','terminate_api_writers'}]
        for expired_at_entry in [False,True]:
            with self.subTest(expired_at_entry=expired_at_entry):
                events=[];now=[0.0];handlers={};timer=[]
                class Process:
                    def __init__(self,pid):self.pid=pid;self.returncode=None
                    def poll(self):return self.returncode
                    def wait(self,timeout):
                        events.append(('wait',self.pid,timeout));self.returncode=0;return 0
                processes={name:Process(i+1) for i,name in enumerate(['postgres','api','phase-client'])}
                def killpg(pid,sig):events.append(('kill',pid,sig))
                def set_signal(number,handler):handlers[number]=handler
                def pending_alarm():
                    events.append(('pending-alarm',))
                    self.assertEqual(handlers[14],0,'cleanup must ignore the pending deadline signal')
                    if callable(handlers[14]):handlers[14]()
                def set_timer(which,seconds):
                    self.assertEqual((which,seconds),(0,0));pending_alarm();timer.append(seconds)
                lifetime=c.ApiLifetime(lambda:now[0],timer.append,lambda:None);lifetime.start()
                handlers[14]=lifetime.interrupt;now[0]=2700 if expired_at_entry else 2699
                scope={'signal':SimpleNamespace(SIGALRM=14,SIG_IGN=0,SIGINT=2,SIGTERM=15,SIGHUP=1,SIGKILL=9,
                                               ITIMER_REAL=0,signal=set_signal,setitimer=set_timer),
                       'time':SimpleNamespace(monotonic=lambda:now[0]),'os':SimpleNamespace(killpg=killpg),
                       'result':{'passed':False,'errorType':'OriginalPhaseFailure'},
                       'children':[(name,proc,False) for name,proc in processes.items()],
                       'cleanup':[],'expected_stopped':set(),'api_lifetime':lifetime,'preflight':c,
                       'subprocess':c.subprocess,'resources':lambda *_:None,'state':Path('/missing-test-inventory')}
                exec(compile(ast.Module(body=functions,type_ignores=[]),'actual-cleanup-functions','exec'),scope)
                lifetime.terminate_writers=scope['terminate_api_writers']
                real_stop=scope['stop_child']
                def stop(name,proc):
                    events.append(('stop',name));pending_alarm();real_stop(name,proc)
                scope['stop_child']=stop
                exec(compile(ast.Module(body=final[:finish+1],type_ignores=[]),'actual-cleanup-entry','exec'),scope)
                self.assertEqual([v[1] for v in events if v[0]=='stop'],['api','phase-client','postgres'])
                self.assertTrue(all(proc.poll() is not None for proc in processes.values()))
                self.assertTrue(all(v[2]==25 for v in events if v[0]=='wait'))
                self.assertTrue(lifetime.stopped);self.assertEqual(lifetime.expired,expired_at_entry)
                self.assertFalse(scope['result']['passed']);self.assertFalse(scope['result']['finalSnapshotVerified'])
                self.assertEqual(scope['result'].get('apiLifetimeExpired',False),expired_at_entry)
                with self.assertRaises(AssertionError):lifetime.start()

    def test_independent_monotonic_deadline_interrupts_without_phase_polling(self):
        now=[100.0];scheduled=[];terminated=[]
        lifetime=c.ApiLifetime(lambda:now[0],scheduled.append,lambda:terminated.append('writers'))
        lifetime.start();self.assertEqual(scheduled,[2700]);self.assertEqual(lifetime.deadline,2800)
        now[0]=2799;lifetime.interrupt();self.assertEqual(scheduled[-1],1);self.assertEqual(lifetime.deadline,2800)
        self.assertEqual(terminated,[])
        now[0]=2800
        with self.assertRaises(TimeoutError):lifetime.interrupt()
        self.assertEqual(terminated,['writers']);self.assertEqual(scheduled[-1],0);self.assertTrue(lifetime.expired)
        with self.assertRaises(AssertionError):lifetime.start()

    def test_normal_stop_cancels_interrupt_and_forbids_restart_or_extension(self):
        now=[1.0];scheduled=[];terminated=[]
        lifetime=c.ApiLifetime(lambda:now[0],scheduled.append,lambda:terminated.append(True))
        lifetime.start();now[0]=302;lifetime.stop();self.assertEqual(scheduled[-1],0)
        now[0]=4000;lifetime.interrupt();self.assertEqual(terminated,[]);self.assertFalse(lifetime.expired)
        with self.assertRaises(AssertionError):lifetime.start()
        with self.assertRaises(AssertionError):c.ApiLifetime(lambda:0,scheduled.append,lambda:None,2701)

    def test_actual_launcher_stops_api_after_scheduled_and_timeout_kills_only_writers(self):
        class Process:
            def __init__(self,pid):self.pid=pid;self.returncode=None
            def poll(self):return self.returncode
            def wait(self,timeout):return self.returncode
        processes={name:Process(i+1) for i,name in enumerate(['postgres','redis','api','c25-scheduled'])}
        calls=[]
        def killpg(pid,sig):
            calls.append((pid,sig))
            next(proc for proc in processes.values() if proc.pid==pid).returncode=0 if sig==15 else -9
        timer=c.ApiLifetime(lambda:0,lambda _:None,lambda:None);timer.start()
        scope={'result':{'passed':True},'children':[(name,proc,name in ['postgres','redis','api']) for name,proc in processes.items()],
               'os':SimpleNamespace(killpg=killpg),'signal':SimpleNamespace(SIGKILL=9,SIGINT=2,SIGTERM=15),
               'subprocess':c.subprocess,'preflight':c,'expected_stopped':set(),'cleanup':[],'api_lifetime':timer,
               'http':True,'time':SimpleNamespace(time=lambda:123),'status':{'state':'running'},'record':lambda:None,
               'resources':lambda *_:None,'state':Path('/no-stopping-file'),'Path':Path}
        tree=ast.parse((BASE/'c25-http.py').read_text());main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
        names={'stop_child','stop_api_after_scheduled','terminate_api_writers','guard'}
        nodes=[n for n in main.body if isinstance(n,ast.FunctionDef) and n.name in names]
        self.assertEqual({n.name for n in nodes},names)
        exec(compile(ast.Module(body=nodes,type_ignores=[]),'actual-c25-api-lifetime','exec'),scope)
        scope['stop_api_after_scheduled']()
        self.assertEqual(processes['api'].returncode,0);self.assertEqual(scope['expected_stopped'],{'api'})
        self.assertTrue(scope['result']['apiStoppedAfterScheduled']);self.assertTrue(timer.stopped)
        scope['guard']();scope['stop_child']('api',processes['api']);self.assertEqual(scope['cleanup'],[])
        with self.assertRaises(AssertionError):scope['stop_api_after_scheduled']()
        scope['terminate_api_writers']()
        self.assertIsNone(processes['postgres'].returncode)
        self.assertEqual(processes['redis'].returncode,-9);self.assertEqual(processes['c25-scheduled'].returncode,-9)
        self.assertFalse(scope['result']['passed']);self.assertTrue(scope['result']['apiLifetimeExpired'])
        source=(BASE/'c25-http.py').read_text()
        self.assertIn('signal.signal(signal.SIGALRM,api_lifetime.interrupt)',source)
        self.assertIn('signal.setitimer(signal.ITIMER_REAL,seconds)',source)
        self.assertIn('api_lifetime.start();ready(aport,api)',source)
        self.assertLess(source.index("if phase=='scheduled':stop_api_after_scheduled()"),source.index("audit('preserve','c25-audit-preserve-'+phase)"))
        self.assertEqual(source.count("api=start("),1)


class PrivateDestinationContracts(unittest.TestCase):
    def test_dedicated_new_direct_children_reject_all_old_trees_and_aliases(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            evidence = root/'c25-build-evidence'; evidence.mkdir()
            self.assertEqual(c.private_run_path(evidence/'backend-01', 'producer', root), evidence/'backend-01')
            self.assertEqual(c.private_run_path(root/'eduk12_c25_http_01', 'runtime', root), root/'eduk12_c25_http_01')
            for name in ['eduk12_c23_http_03', 'eduk12_c21_http_01', 'eduk12_c23_http_01',
                         'eduk12_c23_http_02', 'c23-build-evidence', 'eduk12_tools_20261018', 'other-git']:
                old = root/name; old.mkdir()
                if name == 'other-git': (old/'.git').mkdir()
                for kind in ['producer', 'runtime']:
                    with self.subTest(old=name, kind=kind), self.assertRaises(AssertionError):
                        c.private_run_path(old/'fresh', kind, root)
            (evidence/'existing').mkdir()
            for destination,kind in [(evidence/'existing','producer'),(evidence/'nested/child','producer'),
                                     (root/'eduk12_c25_http_1','runtime'),(root/'unexpected','runtime'),
                                     (root/'backend-01','producer')]:
                with self.subTest(destination=destination), self.assertRaises(AssertionError):
                    c.private_run_path(destination,kind,root)
            alias=root/'alias';alias.symlink_to(evidence,target_is_directory=True)
            with self.assertRaises(AssertionError):c.private_run_path(alias/'backend-02','producer',root)
            linked=root/'linked';linked.symlink_to(root,target_is_directory=True)
            with self.assertRaises(AssertionError):c.private_run_path(linked/'eduk12_c25_http_02','runtime',linked)
        # Actual call sites must retain both dedicated roots and strict source/
        # Git/protected-path validation, before any mkdir or clone is possible.
        producer=(BASE/'c25-produce.py').read_text();launcher=(BASE/'c25-http.py').read_text()
        self.assertIn("source.destination_path(c.private_run_path(a.output, 'producer')", producer)
        self.assertIn("source.SOURCE.parent/'eduk12_c21_http_01'", producer)
        self.assertLess(producer.index('source.destination_path('),producer.index('output.mkdir('))
        self.assertIn("preflight.private_run_path(a.state,'runtime')", launcher)
        self.assertIn("destination=state", launcher)
        self.assertLess(launcher.index('validate_descriptor('),launcher.index('state.mkdir('))


if __name__ == '__main__':
    unittest.main()
