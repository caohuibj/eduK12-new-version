#!/usr/bin/env python3
"""New C25 source/client rejection contracts; synthetic files, no services.

Does not read accepted source data, invoke pg_controldata/Node/Prisma, regenerate
clients, compile an application, or execute any old contract suite.
"""
import copy
import errno
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, BASE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


s = load('c25_source_under_test', 'c25-source.py')
v = load('c25_client_under_test', 'c25-verify-client.py')


def accepted_receipt(snapshot_sha=None):
    receipt = {key: True for key in ['passed', 'cleanupVerified', 'sourceUnchanged', 'inputsUnchanged',
                                    'finalSnapshotVerified', 'requestedPrefixPassed']}
    receipt.update(scope='C23_CHECKPOINT_HTTP_PG_RESTORE_NOT_C26_CAPACITY',
                   finalSnapshotSha256=snapshot_sha or s.SNAPSHOT_SHA256,
                   privateRuntimeFileSha256=s.RUNTIME_SHA256,
                   phases={phase: {'passed': True} for phase in ['upgrade', 'functional', 'races', 'restore']},
                   finalOriginalRowsPreserved={'allOriginalRowsRetained': True, 'originalGuardsUnchanged': True},
                   processExits={name: 0 for name in ['postgres', 'redis', 'api', 'c23-audit-final']})
    return receipt


class SourceContracts(unittest.TestCase):
    def test_exact_source_constants_and_old_lineage_are_distinct(self):
        self.assertEqual(s.RECEIPT_SHA256, 'c81cd9219d12abc1f591c84f877ec21155076546ac0027b9536f1231e67e3c1e')
        self.assertEqual(s.SNAPSHOT_SHA256, '4dd59702b756e0d16cf9fe1c2b821118ba1aa5587f0408a9ccb8527d3d8a01e5')
        self.assertEqual(s.SOURCE.name, 'eduk12_c23_http_03')
        self.assertEqual(s.FILES['originalC21ManifestBefore'], 'source-byte-manifest-before.json')
        self.assertEqual(s.FILES['originalC21ManifestAfter'], 'source-byte-manifest-after.json')
        self.assertNotIn('resumedDataManifest', s.FILES)

    def test_source_receipt_rejects_partial_failed_wrong_scope_or_snapshot(self):
        good = accepted_receipt()
        s.source_receipt(good, s.SNAPSHOT_SHA256)
        mutations = [{key: False} for key in ['passed', 'cleanupVerified', 'sourceUnchanged', 'inputsUnchanged',
                                             'finalSnapshotVerified', 'requestedPrefixPassed']]
        mutations += [{'scope': 'C21_FINAL'}, {'finalSnapshotSha256': '0' * 64},
                      {'privateRuntimeFileSha256': '0' * 64}, {'phases': {'upgrade': {'passed': True}}},
                      {'processExits': {'postgres': 0, 'redis': 0, 'api': 0, 'c23-audit-final': -9}},
                      {'processExits': {'postgres': 0, 'redis': 0, 'api': 0, 'c23-audit-final': False}},
                      {'finalOriginalRowsPreserved': {'allOriginalRowsRetained': False, 'originalGuardsUnchanged': True}}]
        for change in mutations:
            with self.subTest(change=change), self.assertRaises(AssertionError):
                s.source_receipt({**good, **change}, s.SNAPSHOT_SHA256)
        for phase in good['phases']:
            bad = copy.deepcopy(good)
            bad['phases'][phase]['passed'] = False
            with self.assertRaises(AssertionError):
                s.source_receipt(bad, s.SNAPSHOT_SHA256)
        with self.assertRaises(AssertionError):
            s.source_receipt(good, '0' * 64)

    def test_manifest_binds_bytes_metadata_empty_directories_and_links(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'empty').mkdir()
            file = root / 'data'
            file.write_bytes(b'accepted')
            original = s.manifest(root)
            by_path = {entry['path']: entry for entry in original}
            self.assertEqual(set(by_path), {'.', 'empty', 'data'})
            self.assertEqual(by_path['data']['size'], 8)
            self.assertEqual(by_path['data']['links'], 1)
            self.assertIsNone(by_path['data']['linkTarget'])
            self.assertEqual(by_path['data']['xattrs'], s.xattrs(file))
            self.assertEqual(by_path['empty']['xattrs'], s.xattrs(root / 'empty'))
            self.assertTrue({'uid', 'gid', 'mtimeNs', 'mode', 'sha256'} <= set(by_path['data']))
            file.write_bytes(b'changed!')
            self.assertNotEqual(s.manifest(root), original)
            prior = s.manifest(root)
            file.chmod(0o600 if file.stat().st_mode & 0o777 != 0o600 else 0o640)
            self.assertNotEqual(s.manifest(root), prior)

    @unittest.skipUnless(all(hasattr(os, name) for name in ['listxattr', 'getxattr', 'setxattr']), 'OS lacks xattr APIs')
    def test_manifest_binds_file_and_directory_xattr_mutations(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            file = root / 'data'
            file.write_bytes(b'unchanged bytes')
            try:
                os.setxattr(file, 'user.c25-synthetic', b'first')
                os.setxattr(root, 'user.c25-synthetic', b'directory')
            except OSError as error:
                if error.errno in {errno.ENOTSUP, errno.EOPNOTSUPP, errno.ENOSYS}:
                    self.skipTest('Temporary filesystem lacks xattr support')
                raise
            before = s.manifest(root)
            entries = {entry['path']: entry for entry in before}
            self.assertEqual(entries['data']['xattrs']['user.c25-synthetic']['base64'], 'Zmlyc3Q=')
            self.assertEqual(entries['data']['xattrs']['user.c25-synthetic']['bytes'], 5)
            self.assertIn('user.c25-synthetic', entries['.']['xattrs'])
            os.setxattr(file, 'user.c25-synthetic', b'other')
            self.assertNotEqual(s.manifest(root), before)
            before = s.manifest(root)
            os.setxattr(root, 'user.c25-synthetic', b'changed-directory')
            self.assertNotEqual(s.manifest(root), before)

    def test_xattr_reads_fail_closed_and_include_acl_names(self):
        with mock.patch.object(s.os, 'listxattr', return_value=[]):
            self.assertEqual(s.xattrs(Path('/synthetic')), {})
        with mock.patch.object(s.os, 'listxattr', return_value=['system.posix_acl_access']), mock.patch.object(s.os, 'getxattr', return_value=b'\x01\x02'):
            self.assertEqual(s.xattrs(Path('/synthetic'))['system.posix_acl_access']['base64'], 'AQI=')
        with mock.patch.object(s.os, 'listxattr', return_value=['system.posix_acl_access']), mock.patch.object(s.os, 'getxattr', side_effect=PermissionError('synthetic inaccessible ACL')):
            with self.assertRaises(PermissionError):
                s.xattrs(Path('/synthetic'))

    def test_manifest_rejects_symlinks_hardlinks_and_special_files(self):
        for kind in ['symlink', 'hardlink', 'fifo']:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                original = root / 'original'
                original.write_bytes(b'private')
                alias = root / 'alias'
                if kind == 'symlink':
                    alias.symlink_to(original)
                elif kind == 'hardlink':
                    os.link(original, alias)
                else:
                    os.mkfifo(alias)
                with self.assertRaises(AssertionError):
                    s.manifest(root)

    def test_destination_rejects_existing_nested_and_symlink_ancestors(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, repo, evidence = [root / name for name in ['source', 'repo', 'evidence']]
            for path in [source, repo, evidence]:
                path.mkdir()
            # Framework markers can be empty directories; they are not repos.
            (root / '.git').mkdir()
            self.assertEqual(s.destination_path(root / 'fresh', source, repo, [evidence]), root / 'fresh')
            for path in [source, source / 'nested', repo / 'nested', evidence / 'nested', root]:
                with self.subTest(path=str(path)), self.assertRaises(AssertionError):
                    s.destination_path(path, source, repo, [evidence])
            (root / 'alias').symlink_to(evidence, target_is_directory=True)
            with self.assertRaises(AssertionError):
                s.destination_path(root / 'alias/new', source, repo)
            other_repo = root / 'other-repo'
            other_repo.mkdir()
            env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
            env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull)
            subprocess.run(['git', 'init', '--quiet', '--template=', str(other_repo)],
                           env=env, check=True, capture_output=True, timeout=15)
            with self.assertRaises(AssertionError):
                s.destination_path(other_repo / 'new', source, repo)

    def fixture(self, root):
        source = root / 'source'
        source.mkdir()
        for name in s.DATA_DIRS:
            (source / name).mkdir()
        (source / 'pgdata/pg_tblspc').mkdir()
        (source / 'pgdata/global').mkdir()
        (source / 'pgdata/global/pg_control').write_bytes(b'synthetic control')
        (source / 'pgdata/PG_VERSION').write_text('16\n')
        for name in ['postgresql.conf', 'postgresql.auto.conf']:
            (source / 'pgdata' / name).write_text('# synthetic only\n')
        status = {'state': 'stopped', 'cleanupVerified': True, 'cleanupErrors': [], 'head': s.SOURCE_HEAD,
                  'pids': dict(zip(['postgres', 'redis', 'api'], [2147483645, 2147483646, 2147483647])),
                  'ports': {'postgres': 54001, 'redis': 54002, 'api': 54003}}
        (source / 'status.json').write_text(json.dumps(status))
        tables = {f'table_{i}': [] for i in range(217)}
        snapshot = {'columns': tables, 'columnMetadata': tables,
                    'projection': {name: {'rows': 6529 if i == 0 else 0} for i, name in enumerate(tables)}}
        (source / s.FILES['finalSnapshot']).write_text(json.dumps(snapshot))
        (source / s.FILES['runtimeTemplatePrivate']).write_text('{"TEST_SECRET":"synthetic only"}')
        (source / s.FILES['legacyFixturePrivate']).write_text('{"TEST_FIXTURE":"synthetic only"}')
        (source / s.FILES['sourceFrozenInputs']).write_text(json.dumps({'head': s.SOURCE_HEAD}))
        for key in ['originalC21ManifestBefore', 'originalC21ManifestAfter']:
            (source / s.FILES[key]).write_text('[{"path":"ORIGINAL_C21"}]')
        snapshot_sha = s.sha_file(source / s.FILES['finalSnapshot'])
        runtime_sha = s.sha_file(source / s.FILES['runtimeTemplatePrivate'])
        receipt = accepted_receipt(snapshot_sha)
        receipt['privateRuntimeFileSha256'] = runtime_sha
        audit = {'passed': True, 'mode': 'final', 'snapshotSha256': snapshot_sha,
                 'retainedFacts': receipt['finalOriginalRowsPreserved']}
        (source / s.FILES['finalAudit']).write_text(json.dumps(audit))
        receipt['auditProducers'] = {'c23-audit-final': {'resultSha256': s.sha_file(source / s.FILES['finalAudit'])}}
        receipt['sourceManifestSha256'] = s.digest(json.loads((source / s.FILES['originalC21ManifestBefore']).read_text()))
        receipt['frozenInputsSha256'] = s.sha_file(source / s.FILES['sourceFrozenInputs'])
        (source / s.FILES['finalReceipt']).write_text(json.dumps(receipt))
        constants = {'SOURCE': source, 'SNAPSHOT_SHA256': snapshot_sha, 'RUNTIME_SHA256': runtime_sha,
                     'RECEIPT_SHA256': s.sha_file(source / s.FILES['finalReceipt'])}
        tools = root / 'tools'
        pg = tools / 'postgresql/bin/pg_controldata'
        pg.parent.mkdir(parents=True)
        pg.write_text('synthetic executable placeholder; NEVER RUN')
        return source, pg, constants

    def test_source_files_bind_final_receipt_snapshot_runtime_and_c21_lineage(self):
        with tempfile.TemporaryDirectory() as directory:
            source, pg, constants = self.fixture(Path(directory))
            with mock.patch.multiple(s, **constants):
                bound = s.source_files(source)
                self.assertEqual(set(bound), set(s.FILES))
                for relative in [s.FILES[key] for key in ['finalReceipt', 'finalSnapshot', 'runtimeTemplatePrivate',
                                                        'originalC21ManifestAfter', 'sourceFrozenInputs']]:
                    path = source / relative
                    before = path.read_bytes()
                    path.write_bytes(before + b' ')
                    with self.subTest(file=relative), self.assertRaises(AssertionError):
                        s.source_files(source)
                    path.write_bytes(before)

    def test_stopped_uses_mocked_control_and_rejects_pid_or_running_control(self):
        with tempfile.TemporaryDirectory() as directory:
            source, pg, _ = self.fixture(Path(directory))
            fake_socket = mock.MagicMock()
            fake_socket.__enter__.return_value.connect_ex.return_value = 111
            def output(command, **kwargs):
                return ('pg_controldata (PostgreSQL) 16.15\n' if command[-1] == '--version'
                        else 'Database cluster state:               shut down\nDatabase system identifier: 123\n')
            with mock.patch.object(s.socket, 'socket', return_value=fake_socket), mock.patch.object(s.subprocess, 'check_output', side_effect=output):
                result = s.stopped(source, pg)
                self.assertTrue(result['noPostmasterPid'])
                (source / 'pgdata/postmaster.pid').write_text('1')
                with self.assertRaises(AssertionError):
                    s.stopped(source, pg)
                (source / 'pgdata/postmaster.pid').unlink()
                status = json.loads((source / 'status.json').read_text())
                status['pids']['postgres'] = os.getpid()
                (source / 'status.json').write_text(json.dumps(status))
                with self.assertRaises(AssertionError):
                    s.stopped(source, pg)
                status['pids']['postgres'] = 2147483645
                (source / 'status.json').write_text(json.dumps(status))
                with mock.patch.object(s.subprocess, 'check_output', side_effect=['pg_controldata (PostgreSQL) 16.15\n', 'Database cluster state: in production\n']):
                    with self.assertRaises(AssertionError):
                        s.stopped(source, pg)

    def test_source_capture_rejects_receipt_mutation_during_inventory(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            for name in s.DATA_DIRS:
                (source / name).mkdir()
            with mock.patch.object(s, 'source_files', side_effect=[{'receipt': 'before'}, {'receipt': 'after'}]), mock.patch.object(s, 'stopped', return_value={}):
                with self.assertRaises(AssertionError):
                    s.capture(source, Path('/synthetic/pg'))

    def test_issuance_new_manifests_no_secrets_and_unchanged_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, pg, constants = self.fixture(root)
            output = root / 'issued'
            producer = {'head': 'a' * 40, 'tool': 'synthetic-bound-tool'}
            stopped = {'noPostmasterPid': True, 'clusterState': 'shut down'}
            with mock.patch.multiple(s, **constants), mock.patch.object(s, 'producer_binding', return_value=producer), mock.patch.object(s, 'stopped', return_value=stopped):
                before = s.manifest(source)
                path = s.issue(source, output, pg, 'a' * 40)
                descriptor = s.validate_descriptor(path, s.sha_file(path), pg, root / 'new-clone')
                self.assertEqual(s.manifest(source), before)
                self.assertNotIn('synthetic only', path.read_text())
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                self.assertEqual(output.stat().st_mode & 0o777, 0o700)
                self.assertIn('ORIGINAL_C21_SOURCE_BYTES', descriptor['lineage'])
                self.assertNotEqual(descriptor['files']['resumedDataManifest']['path'], descriptor['files']['originalC21ManifestBefore']['path'])
                with self.assertRaises(AssertionError):
                    s.issue(source, output, pg, 'a' * 40)
                with self.assertRaises(AssertionError):
                    s.validate_descriptor(path, '0' * 64, pg)
                for relative in ['uploads/new.bin', 'outside-data-private.json']:
                    file = source / relative
                    file.write_bytes(b'intervening mutation')
                    with self.subTest(file=relative), self.assertRaises(AssertionError):
                        s.assert_unchanged(descriptor, pg)
                    file.unlink()

    def test_issuance_does_not_write_descriptor_after_capture_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, pg, constants = self.fixture(root)
            with mock.patch.multiple(s, **constants), mock.patch.object(s, 'producer_binding', return_value={}), mock.patch.object(s, 'capture', side_effect=[{'data': 'before'}, {'data': 'changed'}]) as capture:
                with self.assertRaises(AssertionError):
                    s.issue(source, root / 'out', pg, 'a' * 40)
                self.assertEqual(capture.call_count, 2, 'must reach the changed capture, not fail at an earlier guard')
                self.assertFalse((root / 'out/c25-source-descriptor.json').exists())


class ClientContracts(unittest.TestCase):
    SOURCE_SCHEMA = '''generator client {
  provider = "prisma-client-js"
  previewFeatures = ["metrics"]
}
datasource db {
  provider = "postgresql"
  url = env("DATABASE_URL")
}
model CompositeAssessmentAccessToken {
  id String @id
  @@map("composite_assessment_access_tokens")
  @@index([trainingRoundId])
}
model SituationalAttempt {
  id String @id
  @@index([instrumentKey, instrumentVersion, participantKey, attemptNo])
  @@index([userId, status])
  @@index([participantKey, status])
  @@index([instrumentKey, instrumentVersion, status])
  @@index([compositeAttemptId, status])
  @@unique([compositeAttemptId, compositeItemId], map: "situational_attempts_composite_item_key")
  @@map("situational_attempts")
}
model ScaleDeploymentPolicy {
  id String @id
  createdAt DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  activatedAt DateTime? @db.Timestamptz(6) @map("activated_at")
  retiredAt DateTime? @db.Timestamptz(6) @map("retired_at")
}
model Ordered {
  first String @default("spaces // and /* comments */ retained")
  second String @relation(fields: [a,b], references: [c,d])
}
'''

    def generated_schema(self):
        result = self.SOURCE_SCHEMA.replace('  @@map("composite_assessment_access_tokens")\n  @@index([trainingRoundId])',
                                           '  @@index([trainingRoundId])\n  @@map("composite_assessment_access_tokens")')
        unique = '  @@unique([compositeAttemptId, compositeItemId], map: "situational_attempts_composite_item_key")\n'
        result = result.replace(unique, '').replace('  @@index([instrumentKey, instrumentVersion, participantKey, attemptNo])',
                                                    unique + '  @@index([instrumentKey, instrumentVersion, participantKey, attemptNo])')
        for mapping in ['created_at', 'activated_at', 'retired_at']:
            result = result.replace('@db.Timestamptz(6) @map("' + mapping + '")', '@map("' + mapping + '") @db.Timestamptz(6)')
        return result

    def test_only_five_reviewed_moves_preserve_all_other_tokens(self):
        expected = v.reviewed_source_tokens(self.SOURCE_SCHEMA)
        generated = self.generated_schema()
        self.assertEqual(expected, v.schema_tokens(generated))
        self.assertEqual(expected, v.schema_tokens('// ordinary comment\n' + generated.replace('  id String', '    id   String')))
        changes = [('"metrics"', '"metric"'), ('"postgresql"', '"mysql"'), ('DATABASE_URL', 'OTHER_URL'),
                   ('spaces // and', 'spaces  // and'), ('fields: [a,b]', 'fields: [b,a]'),
                   ('fields: [a,b], references: [c,d]', 'references: [c,d], fields: [a,b]'),
                   ('  first String', '  renamed String'), ('@db.Timestamptz(6)', '@db.Timestamptz(3)')]
        for old, new in changes:
            with self.subTest(old=old):
                self.assertNotEqual(expected, v.schema_tokens(generated.replace(old, new)))
        ordered = '  first String @default("spaces // and /* comments */ retained")\n  second String @relation(fields: [a,b], references: [c,d])'
        self.assertNotEqual(expected, v.schema_tokens(generated.replace(ordered, '\n'.join(reversed(ordered.splitlines())))))

    def test_unreviewed_attribute_reorder_is_not_generically_sorted(self):
        source = self.SOURCE_SCHEMA.replace('  id String @id', '  id String @id @unique', 1)
        generated = self.generated_schema().replace('  id String @id', '  id String @unique @id', 1)
        self.assertNotEqual(v.reviewed_source_tokens(source), v.schema_tokens(generated))
        with self.assertRaises(AssertionError):
            v.reviewed_source_tokens(self.SOURCE_SCHEMA.replace('@@index([trainingRoundId])', '@@index([differentId])'))

    def test_exact_new_pair_only_old_pair_and_equal_other_bytes_rejected(self):
        self.assertEqual(v.REVIEWED_FORMATTING_PAIR, ('2a753ccecd230abc8f4d468cf8ccc7a5313b0bdc6ba25a59620076b9db6a072e',
                                                      '3d13a0c9584a9797360c725f42d376f35603f79ec7909990b7dd18d580e814d3'))
        old = ('4ce65dad2773c956c79c2fb56d3d74c50c28430a01e0b131a5e796db2a14244b',
               'c1fbc3dfe259197ce8c14b523c9f0831a7d8a895a81a54ef862093846a490339')
        for pair in [old, ('0' * 64, '0' * 64), (v.REVIEWED_FORMATTING_PAIR[0], '0' * 64)]:
            with mock.patch.object(v.db, 'sha_file', side_effect=pair), self.assertRaises(AssertionError):
                v.schema_agreement(Path('/synthetic/not-read'))

    def metadata_fixture(self):
        schema = 'model Sample {\n  id String @id\n  choice Choice? @map("choice_value")\n  @@map("samples")\n}\nenum Choice {\n  YES @map("yes")\n  NO\n  @@map("choices")\n}\n'
        metadata = {'models': {'Sample': {'dbName': 'samples', 'fields': [
            {'name': 'id', 'type': 'String', 'kind': 'scalar', 'isList': False, 'isRequired': True},
            {'name': 'choice', 'type': 'Choice', 'kind': 'enum', 'isList': False, 'isRequired': False, 'dbName': 'choice_value'}]}},
            'enums': {'Choice': {'dbName': 'choices', 'values': [{'name': 'YES', 'dbName': 'yes'}, {'name': 'NO', 'dbName': None}]}}}
        versions = {'prisma': '5.22.0', '@prisma/client': '5.22.0', '@prisma/engines': '5.22.0', 'engineCommit': 'abc'}
        def index(value):
            return ('  "inlineSchema": ' + json.dumps(schema) + ',\n  "clientVersion": "5.22.0",\n  "engineVersion": "abc",\nconfig.runtimeDataModel = JSON.parse(' + json.dumps(json.dumps(value)) + ')')
        return schema, metadata, versions, index

    def test_inline_dmmf_enum_mapping_field_order_and_engine_are_exact(self):
        schema, metadata, versions, index = self.metadata_fixture()
        self.assertTrue(v.inspect_metadata(schema, index(metadata), versions)['inlineSchemaExact'])
        mutations = [lambda m: m['models']['Sample']['fields'].reverse(),
                     lambda m: m['models']['Sample'].update(dbName='wrong'),
                     lambda m: m['models']['Sample']['fields'][1].update(isRequired=True),
                     lambda m: m['enums']['Choice']['values'].reverse(),
                     lambda m: m['enums']['Choice'].update(dbName='wrong'),
                     lambda m: m['enums']['Choice']['values'][0].update(dbName='wrong')]
        for mutate in mutations:
            bad = copy.deepcopy(metadata)
            mutate(bad)
            with self.assertRaises(AssertionError):
                v.inspect_metadata(schema, index(bad), versions)
        with self.assertRaises(AssertionError):
            v.inspect_metadata(schema + '// drift', index(metadata), versions)
        with self.assertRaises(AssertionError):
            v.inspect_metadata(schema, index(metadata), {**versions, 'engineCommit': 'wrong'})

    def test_helper_closure_and_dependency_inventory_detect_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            helper = root / 'helper.py'
            helper.write_text('original helper')
            bound = v.python_helper_closure(root)
            v.unchanged_python_helpers(bound, root)
            helper.write_text('mutated helper')
            with self.assertRaises(AssertionError):
                v.unchanged_python_helpers(bound, root)
            dependencies = root / 'node_modules'
            dependencies.mkdir()
            (dependencies / 'compiler.js').write_text('compiler')
            before = v.closure(root, 'node_modules')
            (dependencies / 'extra.js').write_text('new dependency')
            self.assertNotEqual(v.closure(root, 'node_modules'), before)


if __name__ == '__main__':
    unittest.main(verbosity=2)
