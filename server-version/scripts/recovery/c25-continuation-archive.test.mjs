/** New archive contracts only: inline Python definitions, temporary synthetic
 * files and mocked child processes. No tar/gzip, database, service or old suite.
 * Preparing this file does not run it or create any recovery archive.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {pythonProgram,ARCHIVE_PYTHON,parseArchiveArgs,archivePythonArgv,failureState,recoveryOutput} from './c25-continuation-archive.mjs'

const options={python:'/usr/bin/python3',tools:'/workspace/scratch/5a77e8bdc1ae/eduk12_tools_20261018',
 'failure-state':failureState,output:recoveryOutput,'expected-head':'a'.repeat(40),
 descriptor:'/tmp/synthetic-http03/descriptor.json','expected-descriptor-sha256':'b'.repeat(64)}
const argv=value=>Object.entries(value).flatMap(([key,item])=>['--'+key,item])

test('archive wrapper is exact, explicit and does not create Python source files',()=>{
 assert.equal(ARCHIVE_PYTHON,pythonProgram)
 assert.deepEqual(parseArchiveArgs(argv(options)),options)
 for(const [key,value] of [['output',recoveryOutput+'-other'],['failure-state',failureState+'-other'],['python','python3'],['descriptor','/tmp/../tmp/source.json'],['expected-head','wrong'],['expected-descriptor-sha256','wrong']]){
  assert.throws(()=>parseArchiveArgs(argv({...options,[key]:value})))
 }
 assert.throws(()=>parseArchiveArgs([...argv(options),'--output',recoveryOutput]))
 const bindings={producerSha256:'c'.repeat(64),inlineSha256:'d'.repeat(64),pythonSha256:'e'.repeat(64)}
 const command=archivePythonArgv(options,bindings)
 assert.deepEqual(command.slice(0,3),['-B','-c',pythonProgram]);assert.equal(command.filter(item=>item===pythonProgram).length,1)
 assert.equal(command[command.indexOf('--expected-python-sha256')+1],bindings.pythonSha256)
 assert.ok(!command.some(item=>item.endsWith('.py')))
})

const contracts=String.raw`
import copy, io, os, signal, stat, sys, tempfile, types, unittest
from pathlib import Path
from unittest import mock

A = types.ModuleType('c25_archive_synthetic_contracts')
with mock.patch('subprocess.Popen', side_effect=AssertionError('definition import must not spawn')):
    exec(compile(sys.stdin.read(), '<bound C25 archive definitions>', 'exec'), A.__dict__)

class ArchiveContracts(unittest.TestCase):
    def tree(self, root):
        for name in A.DATA_DIRS:
            (root / name).mkdir()
            (root / name / 'bytes').write_bytes(b'synthetic data')
        (root / 'receipt.json').write_text('failed evidence')
        (root / 'exports.log').write_text('also frozen')
        (root / 'pgdata-old').mkdir()
        (root / 'pgdata-old' / 'bytes').write_text('frozen')
        return root

    def test_pruning_preserves_root_and_all_other_evidence_without_reading_data(self):
        with tempfile.TemporaryDirectory(prefix='c25-archive-contract-') as directory:
            root = self.tree(Path(directory)); baseline = A.nondata_manifest(root)
            self.assertEqual({row['path'] for row in baseline}, {'.','receipt.json','exports.log','pgdata-old','pgdata-old/bytes'})
            original = A.sha_file
            def no_live_data(path):
                self.assertFalse(A.mutable_path(str(Path(path).relative_to(root))))
                return original(path)
            with mock.patch.object(A, 'sha_file', side_effect=no_live_data):
                for name in A.DATA_DIRS: (root / name / 'bytes').write_bytes(b'live changing data')
                self.assertEqual(A.nondata_manifest(root), baseline)
            (root / 'exports.log').write_text('changed')
            self.assertNotEqual(A.nondata_manifest(root), baseline)
            before = A.nondata_manifest(root); (root / 'added-evidence').write_text('new')
            self.assertNotEqual(A.nondata_manifest(root), before)
            before = A.nondata_manifest(root); root.chmod(0o750)
            self.assertNotEqual(A.nondata_manifest(root), before)
        for name in ['pgdata-old','exports.log','other/pgdata','uploads2']:
            self.assertFalse(A.mutable_path(name))

    def test_exact_manifest_metadata_and_zero_link_policy(self):
        with tempfile.TemporaryDirectory(prefix='c25-archive-contract-') as directory:
            root = Path(directory); (root / 'empty').mkdir(); file = root / 'bytes'; file.write_bytes(b'first')
            before = A.inventory(root); record = next(row for row in before if row['path'] == 'bytes')
            self.assertTrue({'uid','gid','mode','mtimeNs','size','sha256','xattrs','links','linkTarget'} <= set(record))
            self.assertEqual(record['links'], 1); self.assertIsNone(record['linkTarget'])
            file.write_bytes(b'other'); self.assertNotEqual(A.inventory(root), before)
            before = A.inventory(root); file.chmod(0o640 if file.stat().st_mode & 0o777 == 0o600 else 0o600); self.assertNotEqual(A.inventory(root), before)
            before = A.inventory(root); os.utime(file, ns=(1, 123456789)); self.assertNotEqual(A.inventory(root), before)
            original_xattrs = A.xattrs
            acl = {'system.posix_acl_access': {'bytes': 2, 'base64': 'AQI=', 'sha256': 'a'*64}}
            with mock.patch.object(A, 'xattrs', side_effect=lambda p: acl if Path(p) == file else original_xattrs(p)):
                self.assertEqual(next(row for row in A.inventory(root) if row['path'] == 'bytes')['xattrs'], acl)
            for kind in ['symlink','hardlink','fifo']:
                alias = root / 'alias'
                if kind == 'symlink': alias.symlink_to(file)
                elif kind == 'hardlink': os.link(file, alias)
                else: os.mkfifo(alias)
                with self.assertRaises(AssertionError): A.inventory(root)
                alias.unlink()
            with mock.patch.object(A.os, 'listxattr', return_value=['system.posix_acl_access']), mock.patch.object(A.os, 'getxattr', side_effect=PermissionError('unreadable ACL')):
                with self.assertRaises(PermissionError): A.xattrs(file)

    def test_path_aliases_existing_targets_and_special_files_fail_closed(self):
        with tempfile.TemporaryDirectory(prefix='c25-archive-contract-') as directory:
            root = Path(directory); (root / 'real').mkdir(); (root / 'alias').symlink_to(root / 'real', target_is_directory=True)
            with self.assertRaises(AssertionError): A.canonical(root / 'alias' / 'new')
            with self.assertRaises(AssertionError): A.canonical(root / '..' / root.name)
            with self.assertRaises(AssertionError): A.output_path(root / 'new')
            with mock.patch.object(A.os.path, 'lexists', return_value=True):
                with self.assertRaises(AssertionError): A.output_path(A.OUTPUT)
            self.assertEqual(A.private_directory(root), root)
            root.chmod(0o755)
            with self.assertRaises(AssertionError): A.private_directory(root)

    def test_failed_receipt_is_pinned_failure_never_promoted_or_rebased(self):
        columns = {str(n): [] for n in range(217)}
        snapshot = {'columns': columns, 'columnMetadata': copy.deepcopy(columns),
                    'projection': {str(n): {'rows': 6582 if n == 0 else 0} for n in range(217)}}
        facts = {'allOriginalRowsRetained': True, 'originalGuardsUnchanged': True}
        receipt = {'scope': 'C25_C22_OVER_C23_LOCAL_SYNTHETIC_CORE_NOT_COMPLETE_RELEASE_OR_CAPACITY',
                   'passed': False, 'phases': {'upgrade': {'passed': True}, 'prepare': {'passed': True}},
                   'cleanupVerified': True, 'sourceUnchanged': True, 'inputsUnchanged': True, 'finalSnapshotVerified': True,
                   'finalSnapshotSha256': A.FAILED_SNAPSHOT_SHA, 'finalOriginalRowsPreserved': facts,
                   'processExits': {name: 0 for name in ['postgres','redis','api','c25-upgrade','c25-prepare','c25-audit-final']}}
        receipt['processExits']['c25-scheduled'] = 1
        audit = {'passed': True, 'mode': 'final', 'snapshotSha256': A.FAILED_SNAPSHOT_SHA, 'retainedFacts': facts}
        A.validate_failure_receipt(receipt, snapshot, audit)
        for change in [{'passed': True}, {'finalSnapshotSha256': '0'*64}, {'cleanupVerified': False}, {'phases': {'upgrade': {'passed': True}}}]:
            with self.assertRaises(AssertionError): A.validate_failure_receipt({**receipt, **change}, snapshot, audit)
        old = copy.deepcopy(snapshot); old['projection']['0']['rows'] = 6529
        with self.assertRaises(AssertionError): A.validate_failure_receipt(receipt, old, audit)
        bad = copy.deepcopy(receipt); bad['processExits']['c25-scheduled'] = True
        with self.assertRaises(AssertionError): A.validate_failure_receipt(bad, snapshot, audit)

    def test_archive_and_extraction_coexistence_and_runtime_floors(self):
        with tempfile.TemporaryDirectory(prefix='c25-archive-contract-') as directory:
            data = A.data_manifests(self.tree(Path(directory)))
            self.assertEqual(A.data_projection(A.inventory(Path(directory))), data)
            good = {'workspaceFreeBytes': A.FLOOR+A.RESERVE, 'tmpFreeBytes': 4*1024**3, 'memAvailableBytes': 8*1024**3}
            budget = A.recovery_budget(data, good)
            self.assertGreater(budget['requiredTmpFreeBytes'], 2*budget['sourceLogicalBytes']+A.RESERVE)
            for key, minimum in [('workspaceFreeBytes',A.FLOOR+A.RESERVE),('tmpFreeBytes',budget['requiredTmpFreeBytes']),('memAvailableBytes',budget['requiredMemAvailableBytes'])]:
                with self.assertRaises(AssertionError): A.recovery_budget(data, {**good, key: minimum-1})
            for key, minimum in [('workspaceFreeBytes',A.FLOOR),('tmpFreeBytes',A.RESERVE),('memAvailableBytes',A.MEMORY)]:
                with self.assertRaises(AssertionError): A.resource_floor({**good, key: minimum-1})
            enormous = copy.deepcopy(data); enormous['pgdata'][1]['size'] = A.ARCHIVE_CAP+1
            with self.assertRaises(AssertionError): A.recovery_budget(enormous, good)

    def test_member_validation_rejects_duplicates_traversal_links_and_size_changes(self):
        with tempfile.TemporaryDirectory(prefix='c25-archive-contract-') as directory:
            data = A.data_manifests(self.tree(Path(directory))); members = []
            for name, rows in data.items():
                for row in rows:
                    member = A.tarfile.TarInfo(name if row['path'] == '.' else name+'/'+row['path'])
                    member.type = A.tarfile.DIRTYPE if row['type'] == 'directory' else A.tarfile.REGTYPE
                    member.uid, member.gid, member.mode = row['uid'], row['gid'], row['mode']; member.size = row.get('size',0)
                    members.append(member)
            def check(items):
                handle = mock.MagicMock(); handle.__enter__.return_value = iter(items)
                with mock.patch.object(A.tarfile, 'open', return_value=handle): A.archive_members('never-opened', data, lambda: None)
            check(members)
            for alter in [lambda rows: rows.append(rows[0]), lambda rows: setattr(rows[0],'name','../escape'),
                          lambda rows: setattr(rows[1],'type',A.tarfile.SYMTYPE), lambda rows: setattr(rows[1],'size',999),
                          lambda rows: rows.pop()]:
                bad = copy.deepcopy(members); alter(bad)
                with self.assertRaises(AssertionError): check(bad)

    def test_timeout_guard_interrupt_kills_and_reaps_only_the_owned_mock_group(self):
        with tempfile.TemporaryDirectory(prefix='c25-archive-contract-') as directory:
            for kind in ['deadline','guard','interrupt']:
                child = mock.Mock(pid=123456789, returncode=None); child.poll.return_value = None
                killed = []; ticks = iter([0, 301])
                def check():
                    if kind == 'guard': raise AssertionError('synthetic resource floor')
                    if kind == 'interrupt': raise KeyboardInterrupt()
                launch = mock.Mock(return_value=child)
                expected = KeyboardInterrupt if kind == 'interrupt' else AssertionError
                with self.assertRaises(expected):
                    A.bounded(['NEVER_EXECUTE'], Path(directory)/(kind+'.log'), 300, check,
                              popen=launch, clock=lambda: next(ticks), sleep=lambda _: None,
                              killpg=lambda pid, sig: killed.append((pid,sig)))
                self.assertEqual(killed, [(child.pid,signal.SIGKILL)]); child.wait.assert_called_once_with(timeout=5)
                self.assertTrue(launch.call_args.kwargs['start_new_session'])
                self.assertNotIn('preexec_fn', launch.call_args.kwargs)
                self.assertEqual(launch.call_args.args[0][0], '/usr/bin/prlimit')
            target = Path(directory)/'receipt.json'
            A.sync_json(target, {'passed': False})
            with self.assertRaises(FileExistsError): A.sync_json(target, {'passed': True})
            self.assertEqual(A.json.loads(target.read_text()), {'passed': False})
        self.assertIs(A.verify_recovery_descriptor, A.verify_recovery_archive)

unittest.main(argv=['c25-continuation-archive-inline-contracts'], verbosity=2)
`

test('actual inline archive helpers pass only synthetic filesystem and mocked-process contracts',()=>{
 const result=spawnSync(process.env.C25_TEST_PYTHON??'python3',['-B','-c',contracts],{input:pythonProgram,encoding:'utf8',timeout:30000,
  env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',TZ:'UTC',PYTHONDONTWRITEBYTECODE:'1'},maxBuffer:1024*1024})
 process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'')
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr||result.stdout)
 assert.match(result.stderr,/Ran 7 tests/);assert.match(result.stderr,/\bOK\b/)
})

test('official two-link Node tools bind exact topology while data rejects aliases and later drift',()=>{
 const program=String.raw`
import os,pathlib,sys,tempfile
scope={'__name__':'c25_tool_link_contract'}
exec(compile(sys.stdin.read(),'<actual archive definitions>','exec'),scope)
def reject(fn):
 try:fn()
 except AssertionError:return
 raise AssertionError('unexpected alias/drift accepted')
with tempfile.TemporaryDirectory() as directory:
 root=pathlib.Path(directory)
 one=root/'node_modules/node/bin/node';two=root/'node_modules/node/node_modules/node-linux-x64/bin/node'
 one.parent.mkdir(parents=True);two.parent.mkdir(parents=True)
 one.write_bytes(b'official-synthetic-node');os.link(one,two)
 binding=scope['node_tool_bindings'](root)
 assert len(binding)==2
 for item in binding.values():
  assert item['links']==2 and item['realpath']==item['path']
  assert {'device','inode','uid','gid','mode','bytes','sha256'}<=set(item)
 reject(lambda:scope['file_binding'](one))
 reject(lambda:scope['inventory'](root))
 scope['assert_tools_unchanged'](binding)
 one.write_bytes(b'mutated-tool');reject(lambda:scope['assert_tools_unchanged'](binding))
 one.write_bytes(b'official-synthetic-node');scope['assert_tools_unchanged'](binding)
 extra=root/'third-alias';os.link(one,extra);reject(lambda:scope['node_tool_bindings'](root));reject(lambda:scope['assert_tools_unchanged'](binding));extra.unlink()
 replacement=root/'replacement';replacement.write_bytes(one.read_bytes());old_inode=one.stat().st_ino
 one.unlink();two.unlink();os.rename(replacement,one);os.link(one,two)
 assert one.stat().st_ino!=old_inode
 reject(lambda:scope['assert_tools_unchanged'](binding))
 current=scope['node_tool_bindings'](root)
 assert all(item['inode']!=binding[name]['inode'] for name,item in current.items())
 plain=root/'ordinary';plain.write_bytes(b'ordinary')
 assert scope['tool_binding'](plain)['links']==1
 assert scope['file_binding'](plain)['sha256']==scope['tool_binding'](plain)['sha256']
print('PASS exact two-link tool identity; unchanged one-link evidence rule; byte/inode/link-count drift rejected')
`
 const result=spawnSync(process.env.C25_TEST_PYTHON??'python3',['-B','-c',program],{input:pythonProgram,encoding:'utf8',timeout:10000,maxBuffer:1024*1024})
 process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'')
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr||result.stdout)
})
