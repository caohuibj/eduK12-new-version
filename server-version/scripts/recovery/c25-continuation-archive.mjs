/** Prepared C25 recovery archive. Importing this module performs no I/O.
 * Execution requires separate approval. No old Python helper is changed and
 * no generated Python file is added to the accepted client helper closure.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath, pathToFileURL} from 'node:url'

export const failureState='/workspace/scratch/5a77e8bdc1ae/eduk12_c25_http_01'
export const recoveryOutput='/tmp/c25-continuation-recovery-01'

export function parseArchiveArgs(argv){
 const names=new Set(['python','tools','failure-state','output','expected-head','descriptor','expected-descriptor-sha256']),result={}
 assert.equal(argv.length,names.size*2,'exact explicit archive arguments required')
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i].slice(2),value=argv[i+1]
  assert.ok(argv[i].startsWith('--')&&names.has(key)&&!(key in result),'unknown or repeated archive argument')
  assert.ok(typeof value==='string'&&value.length>0&&!value.startsWith('--'),'argument value required')
  result[key]=value
 }
 for(const key of ['python','tools','failure-state','output','descriptor'])assert.ok(path.isAbsolute(result[key])&&path.normalize(result[key])===result[key],'canonical absolute path required')
 assert.equal(result['failure-state'],failureState);assert.equal(result.output,recoveryOutput)
 assert.match(result['expected-head'],/^[a-f0-9]{40}$/)
 assert.match(result['expected-descriptor-sha256'],/^[a-f0-9]{64}$/)
 return result
}

export const pythonProgram=String.raw`
"""C25 node-local temporary recovery, never durable backup or PG qualification.

Library verifiers do NOT acquire a lock: their caller must already hold the
measurement lock through verification and subsequent use. Loading definitions
does not read source data, run an archive, or start a service.
"""
import argparse, base64, fcntl, hashlib, importlib.util, json, os
from pathlib import Path, PurePosixPath
import re, shutil, signal, stat, subprocess, sys, tarfile, threading, time, traceback
sys.dont_write_bytecode = True
ROOT = Path('/workspace/scratch/5a77e8bdc1ae')
REPO = ROOT / 'eduk12_c22_20261019'
BASE = REPO / 'server-version/scripts/recovery'
PRODUCER = BASE / 'c25-continuation-archive.mjs'
SOURCE = ROOT / 'eduk12_c25_http_01'
OUTPUT = Path('/tmp/c25-continuation-recovery-01')
DATA_DIRS = ('pgdata', 'uploads', 'exports')
FAILED_RECEIPT_SHA = '8f7f0697582519c4032a1726e71fb2bd3879c7f81afea54e36d76d6c07c50eff'
FAILED_SNAPSHOT_SHA = '4ab9189d33c04e7aae7cd1b80d6e390246672eaa9841b5dac887bbbb1fbcc3b1'
SCOPE = 'C25_FAILED_STATE_NODE_LOCAL_TEMPORARY_RECOVERY_NOT_DURABLE_BACKUP'
FLOOR, RESERVE, MEMORY = 8*1024**3, 512*1024**2, 2*1024**3
ARCHIVE_CAP, METADATA_RESERVE, PROCESS_RESERVE = 1024**3, 128*1024**2, 128*1024**2
NAMES = {'archive': 'c25-failed-state-data.tar.gz',
         'dataManifest': 'c25-continuation-data-manifest.json',
         'fullFailureManifest': 'c25-continuation-failure-full-manifest.json',
         'frozenFailureManifest': 'c25-continuation-failure-evidence-manifest.json',
         'archiveReceipt': 'archive-receipt.json', 'restoreInstructions': 'RESTORE.txt',
         'descriptor': 'c25-continuation-recovery-descriptor.json'}
_helpers = None

def helpers():
    global _helpers
    if _helpers is None:
        loaded = []
        for name, filename in [('c25_archive_source', 'c25-source.py'), ('c25_archive_contracts', 'c25-contracts.py')]:
            spec = importlib.util.spec_from_file_location(name, BASE / filename)
            module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); loaded.append(module)
        _helpers = tuple(loaded)
    return _helpers

def sha_file(path):
    value = hashlib.sha256()
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'rb') as handle:
        assert stat.S_ISREG(os.fstat(handle.fileno()).st_mode), 'hash target is not a regular file'
        for block in iter(lambda: handle.read(1024*1024), b''): value.update(block)
    return value.hexdigest()

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def canonical(path):
    path = Path(path)
    assert path.is_absolute() and str(path) == os.path.normpath(str(path)), 'canonical absolute path required'
    for item in [path, *path.parents]: assert not item.is_symlink(), 'symlink path or ancestor forbidden'
    return path

def private_directory(path):
    path = canonical(path); info = path.lstat()
    assert stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700, 'owned private directory required'
    return path

def file_binding(path):
    path = canonical(path); before = path.lstat()
    assert stat.S_ISREG(before.st_mode) and before.st_nlink == 1, 'regular unaliased file required'
    result = {'path': str(path), 'bytes': before.st_size, 'mode': stat.S_IMODE(before.st_mode), 'sha256': sha_file(path)}
    after = path.lstat()
    assert stable_stat(before) == stable_stat(after), 'file changed during binding'
    return result

def stable_stat(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid, info.st_nlink,
            info.st_size, info.st_mtime_ns, info.st_ctime_ns)

def xattrs(path):
    result = {}
    for name in sorted(os.listxattr(path, follow_symlinks=False)):
        value = os.getxattr(path, name, follow_symlinks=False)
        result[name] = {'bytes': len(value), 'sha256': hashlib.sha256(value).hexdigest(),
                        'base64': base64.b64encode(value).decode('ascii')}
    return result

def mutable_path(relative):
    return any(relative == name or relative.startswith(name + '/') for name in DATA_DIRS)

def inventory(root, prune_data=False):
    root = canonical(root); device = root.lstat().st_dev; rows = []
    def visit(path):
        relative = str(path.relative_to(root))
        if prune_data and mutable_path(relative): return
        before = path.lstat()
        assert before.st_dev == device and before.st_uid == os.getuid(), 'foreign filesystem or owner'
        assert not path.is_mount() or path == root, 'nested mount forbidden'
        assert not stat.S_ISLNK(before.st_mode), 'symlinks forbidden'
        entry = {'path': relative, 'mode': stat.S_IMODE(before.st_mode), 'uid': before.st_uid,
                 'gid': before.st_gid, 'mtimeNs': before.st_mtime_ns, 'linkTarget': None, 'xattrs': xattrs(path)}
        if stat.S_ISDIR(before.st_mode): entry['type'] = 'directory'
        else:
            assert stat.S_ISREG(before.st_mode) and before.st_nlink == 1, 'special files and hardlinks forbidden'
            entry.update(type='file', size=before.st_size, links=1, sha256=sha_file(path))
        assert stable_stat(before) == stable_stat(path.lstat()) and entry['xattrs'] == xattrs(path), 'entry changed during inventory'
        rows.append(entry)
        if entry['type'] == 'directory':
            for child in sorted(path.iterdir()): visit(child)
            assert stable_stat(before) == stable_stat(path.lstat()), 'directory changed during traversal'
    visit(root)
    assert rows and rows[0]['type'] == 'directory', 'real manifest root required'
    return rows

def nondata_manifest(failure_state):
    """Prune the three exact roots BEFORE hashing; safe while their PG is live."""
    return inventory(failure_state, prune_data=True)

def frozen_failure_manifest(failure_state): return inventory(failure_state)

def data_manifests(failure_state):
    return {name: inventory(Path(failure_state) / name) for name in DATA_DIRS}

def data_projection(full):
    result = {name: [] for name in DATA_DIRS}
    for row in full:
        for name in DATA_DIRS:
            if row['path'] == name or row['path'].startswith(name + '/'):
                result[name].append({**row, 'path': '.' if row['path'] == name else row['path'][len(name)+1:]})
    assert all(rows and rows[0]['path'] == '.' and rows[0]['type'] == 'directory' for rows in result.values())
    return result

def validate_failure_receipt(receipt, snapshot, audit):
    assert receipt.get('scope') == 'C25_C22_OVER_C23_LOCAL_SYNTHETIC_CORE_NOT_COMPLETE_RELEASE_OR_CAPACITY'
    assert receipt.get('passed') is False, 'failed run cannot be promoted'
    assert set(receipt.get('phases', {})) == {'upgrade', 'prepare'}
    assert all(receipt['phases'][name].get('passed') is True for name in ['upgrade', 'prepare'])
    assert all(receipt.get(name) is True for name in ['cleanupVerified', 'sourceUnchanged', 'inputsUnchanged', 'finalSnapshotVerified'])
    assert receipt.get('finalSnapshotSha256') == FAILED_SNAPSHOT_SHA
    assert set(snapshot['projection']) == set(snapshot['columns']) == set(snapshot['columnMetadata'])
    assert len(snapshot['columns']) == 217 and sum(row['rows'] for row in snapshot['projection'].values()) == 6582
    assert audit.get('passed') is True and audit.get('mode') == 'final' and audit.get('snapshotSha256') == FAILED_SNAPSHOT_SHA
    assert audit['retainedFacts'] == receipt['finalOriginalRowsPreserved']
    assert all(audit['retainedFacts'].get(name) is True for name in ['allOriginalRowsRetained', 'originalGuardsUnchanged'])
    exits = receipt['processExits']
    for name in ['postgres', 'redis', 'api', 'c25-upgrade', 'c25-prepare', 'c25-audit-final']:
        assert type(exits.get(name)) is int and exits[name] == 0, 'expected successful source child differs'
    assert type(exits.get('c25-scheduled')) is int and exits['c25-scheduled'] == 1, 'failed scheduled child differs'

def validate_failure(failure_state):
    source = canonical(failure_state); assert source == SOURCE, 'exact C25 HTTP01 source required'
    private_directory(source)
    names = ['c25-runtime-result.json', 'c25-final-db-snapshot.json', 'c25-audit-final-result.json',
             'status.json', 'frozen-inputs.json', 'runtime-private.json', 'fixture-private.json',
             'c25-fixture-private.json', 'c25-original-rows-private.json', 'c25-upgrade-result.json',
             'c25-prepare-result.json', 'source-byte-manifest-before.json', 'source-byte-manifest-after.json']
    files = {name: file_binding(source / name) for name in names}
    assert files['c25-runtime-result.json']['sha256'] == FAILED_RECEIPT_SHA
    assert files['c25-final-db-snapshot.json']['sha256'] == FAILED_SNAPSHOT_SHA
    read = lambda name: json.loads((source / name).read_text())
    receipt, snapshot, audit = [read(name) for name in names[:3]]
    validate_failure_receipt(receipt, snapshot, audit)
    assert receipt['privateRuntimeFileSha256'] == files['runtime-private.json']['sha256']
    assert receipt['frozenInputsSha256'] == files['frozen-inputs.json']['sha256']
    assert read('frozen-inputs.json')['head'] == read('status.json')['head']
    assert receipt['auditProducers']['c25-audit-final']['resultSha256'] == files['c25-audit-final-result.json']['sha256']
    for phase in ['upgrade', 'prepare']:
        assert read('c25-' + phase + '-result.json') == receipt['phases'][phase]
        assert receipt['phaseProducers'][phase]['resultSha256'] == files['c25-' + phase + '-result.json']['sha256']
    assert files['source-byte-manifest-before.json']['sha256'] == files['source-byte-manifest-after.json']['sha256']
    assert all(file_binding(source / name) == binding for name, binding in files.items())
    return files

def stopped_failure(failure_state, tools):
    source = canonical(failure_state); assert source == SOURCE
    source_helpers, _ = helpers()
    return source_helpers.stopped(source, Path(tools) / 'postgresql/bin/pg_controldata')

def output_path(path, source=SOURCE, repo=REPO, protected=()):
    path = canonical(path); assert path == OUTPUT and path.parent == Path('/tmp'), 'exact new /tmp destination required'
    assert not os.path.lexists(path), 'archive destination already exists'
    source_helpers, _ = helpers(); source_helpers.outside_git(path)
    for root in [source, repo, *protected]:
        root = canonical(root)
        assert path != root and root not in path.parents and path not in root.parents, 'nested or protected destination'
    assert path.parent.stat().st_dev != Path(source).stat().st_dev, 'archive must be on an independent filesystem'
    # Use the last matching mount: container mount tables can contain an older
    # read-only entry and the actual writable bind at the same mount point.
    mounts = [line.split() for line in Path('/proc/self/mountinfo').read_text().splitlines()]
    matches = [row for row in mounts if row[4] == '/tmp']
    assert matches and matches[-1][matches[-1].index('-') + 1] == 'tmpfs', '/tmp must be independent tmpfs'
    return path

def producer_binding(tools, expected_head):
    tools = canonical(tools); assert tools == ROOT / 'eduk12_tools_20261018'
    assert re.fullmatch('[a-f0-9]{40}', expected_head)
    source_helpers, contracts = helpers()
    assert contracts.git('rev-parse', 'HEAD').decode().strip() == expected_head
    assert subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--'], cwd=REPO, timeout=15).returncode == 0, 'commit all current source first'
    assert not contracts.git('ls-files', '--others', '--exclude-standard', '-z'), 'untracked source is not reviewed'
    paths = [Path(sys.executable).resolve(), tools / 'node_modules/node/bin/node', Path('/usr/bin/tar'),
             Path('/usr/bin/gzip'), Path('/usr/bin/prlimit'), tools / 'postgresql/bin/pg_controldata']
    bindings = {str(path): file_binding(path) for path in paths}
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1'}
    node = paths[1]
    assert subprocess.check_output([node, '--version'], text=True, timeout=10, env=env).strip() == 'v24.21.0'
    script = "import {createHash} from 'node:crypto';import {pythonProgram} from " + json.dumps(PRODUCER.as_uri()) + ";process.stdout.write(createHash('sha256').update(pythonProgram).digest('hex'))"
    inline_sha = subprocess.check_output([node, '--input-type=module', '-e', script], text=True, timeout=10, env=env)
    assert re.fullmatch('[a-f0-9]{64}', inline_sha)
    python_helpers = source_helpers.python_helper_closure()
    assert len(python_helpers) == 72, 'existing 72-file Python helper closure required'
    result = {'head': expected_head, 'producer': file_binding(PRODUCER), 'inlinePythonSha256': inline_sha,
              'pythonVersion': sys.version, 'pythonHelperClosure': python_helpers,
              'recoverySources': contracts.source_inventory(REPO, ['server-version/scripts/recovery']), 'tools': bindings}
    assert all(file_binding(Path(name)) == binding for name, binding in bindings.items()), 'tool changed during binding'
    return result

def resource_snapshot():
    memory = next(int(line.split()[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
    return {'workspaceFreeBytes': shutil.disk_usage(ROOT).free, 'tmpFreeBytes': shutil.disk_usage('/tmp').free, 'memAvailableBytes': memory}

def resource_floor(current):
    assert current['workspaceFreeBytes'] >= FLOOR, '8 GiB workspace floor'
    assert current['tmpFreeBytes'] >= RESERVE, '512 MiB tmp floor'
    assert current['memAvailableBytes'] >= MEMORY, '2 GiB memory floor'

def recovery_budget(data, current):
    assert set(data) == set(DATA_DIRS)
    entries = [entry for group in data.values() for entry in group]
    logical = sum(entry['size'] for entry in entries if entry['type'] == 'file')
    rounded = sum(((entry['size'] + 4095)//4096)*4096 for entry in entries if entry['type'] == 'file')
    xattr_bytes = sum(value['bytes'] for entry in entries for value in entry['xattrs'].values())
    extraction = rounded + len(entries)*4096 + xattr_bytes + 32*1024**2
    assert extraction <= ARCHIVE_CAP and xattr_bytes <= 32*1024**2, 'data exceeds bounded archive/extraction scope'
    tmp_need = ARCHIVE_CAP + extraction + METADATA_RESERVE + RESERVE
    memory_need = MEMORY + ARCHIVE_CAP + extraction + METADATA_RESERVE + PROCESS_RESERVE
    assert current['workspaceFreeBytes'] >= FLOOR + RESERVE, 'archive starts below workspace reserve'
    assert current['tmpFreeBytes'] >= tmp_need and current['memAvailableBytes'] >= memory_need, 'archive and full extraction cannot coexist within floors'
    return {'sourceLogicalBytes': logical, 'sourceEntries': len(entries), 'archiveMaxBytes': ARCHIVE_CAP,
            'extractionReserveBytes': extraction, 'metadataReserveBytes': METADATA_RESERVE,
            'requiredTmpFreeBytes': tmp_need, 'requiredMemAvailableBytes': memory_need,
            'workspaceFloorBytes': FLOOR, 'tmpFloorBytes': RESERVE, 'memoryFloorBytes': MEMORY}

class ResourceGuard:
    def __init__(self, sample=resource_snapshot):
        self.sample = sample; self.minimum = {}; self.error = None; self.finished = threading.Event(); self.thread = None
    def check(self):
        current = self.sample()
        for key, value in current.items(): self.minimum[key] = min(self.minimum.get(key, value), value)
        resource_floor(current)
        if self.error: raise RuntimeError(self.error)
        return current
    def watch(self):
        while not self.finished.wait(.25):
            try: self.check()
            except BaseException as error:
                self.error = str(error); os.kill(os.getpid(), signal.SIGTERM); return
    def start(self):
        self.check(); self.thread = threading.Thread(target=self.watch, daemon=True); self.thread.start()
    def stop(self):
        self.finished.set()
        if self.thread: self.thread.join(timeout=2)

def bounded(argv, log_path, seconds, guard, *, popen=subprocess.Popen, clock=time.monotonic, sleep=time.sleep, killpg=os.killpg):
    """Kill and reap the entire owned child group on timeout/guard/interrupt."""
    assert 0 < seconds <= 300
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1'}
    # Avoid Python preexec_fn while the resource watchdog thread is alive.
    command = ['/usr/bin/prlimit', '--fsize=' + str(ARCHIVE_CAP) + ':' + str(ARCHIVE_CAP), '--', *map(str, argv)]
    with Path(log_path).open('xb') as log:
        process = popen(command, stdout=log, stderr=subprocess.STDOUT, env=env, start_new_session=True)
        started = clock()
        try:
            while process.poll() is None:
                guard(); assert clock() - started < seconds, 'bounded archive child deadline'; sleep(.1)
            assert process.returncode == 0, 'archive child failed; private log retained'
            guard()
        except BaseException:
            try: killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError: pass
            process.wait(timeout=5)
            raise
        finally: log.flush(); os.fsync(log.fileno())
    return {'argv': list(map(str, argv)), 'seconds': clock() - started, 'exitCode': process.returncode, 'logSha256': sha_file(log_path)}

def fsync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try: os.fsync(descriptor)
    finally: os.close(descriptor)

def sync_bytes(path, data):
    assert len(data) <= 64*1024**2, 'bounded evidence file exceeded'
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'wb') as handle: handle.write(data); handle.flush(); os.fsync(handle.fileno())

def sync_json(path, value): sync_bytes(path, (json.dumps(value, indent=2, sort_keys=True) + '\n').encode())

def fsync_tree(root):
    paths = [Path(root), *sorted(Path(root).rglob('*'))]
    for path in paths:
        if path.is_file():
            descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            try: os.fsync(descriptor)
            finally: os.close(descriptor)
    for path in reversed(paths):
        if path.is_dir(): fsync_directory(path)

def archive_members(path, data, guard):
    expected = {name if row['path'] == '.' else name + '/' + row['path']: row for name, rows in data.items() for row in rows}
    seen = set()
    with tarfile.open(path, mode='r|gz') as archive:
        for member in archive:
            guard(); name = member.name[:-1] if member.isdir() and member.name.endswith('/') else member.name
            assert name == str(PurePosixPath(name)) and not name.startswith('/') and '..' not in PurePosixPath(name).parts
            assert name in expected and name not in seen, 'unexpected or duplicate archive member'
            seen.add(name); row = expected[name]
            assert (member.isdir() and row['type'] == 'directory') or (member.isfile() and row['type'] == 'file'), 'links/special archive entries forbidden'
            assert not member.issym() and not member.islnk() and member.sparse is None, 'archive alias/sparse member forbidden'
            assert member.uid == row['uid'] and member.gid == row['gid'] and member.mode == row['mode'], 'archive metadata differs'
            assert member.size == (row['size'] if row['type'] == 'file' else 0), 'archive file size differs'
    assert seen == set(expected), 'archive member set incomplete'

def restore_instructions():
    return ('NODE-LOCAL TEMPORARY RECOVERY ONLY. This /tmp tmpfs copy does not survive host restart.\n'
            'No PostgreSQL service was started for this filesystem round-trip. Functional DB restore is not qualified.\n'
            'Retain archive, manifests, receipt and descriptor throughout continuation, including failure.\n'
            'Restore requires separate authorization. Hold the measurement lock; stop every owned writer and verify shutdown.\n'
            'Verify the externally pinned descriptor SHA and all referenced hashes. Extract to a fresh private directory first.\n'
            'GNU tar --acls --xattrs --xattrs-include=* --same-owner --same-permissions -xzf ARCHIVE -C FRESH_DIRECTORY\n'
            'Compare every path/type/mode/uid/gid/mtime_ns/size/SHA/xattr/ACL, including empty roots and zero-link topology.\n'
            'Never extract over existing source data. Preserve all continuation evidence. Handling current data roots needs separate approval.\n'
            'Restore only pgdata, uploads and exports, preserving every other original source byte and root metadata.\n')

def verify_recovery_archive(descriptor_path, expected_sha, tools, failure_state, expected_head, check_data=True):
    """Caller holds measurement lock. False is safe for live reused PGDATA."""
    assert type(check_data) is bool and re.fullmatch('[a-f0-9]{64}', expected_sha)
    source = canonical(failure_state); assert source == SOURCE
    target = canonical(descriptor_path); assert target == OUTPUT / NAMES['descriptor']
    private_directory(OUTPUT)
    assert not os.path.lexists(OUTPUT / 'archive-failure-private.json') and not os.path.lexists(OUTPUT / 'archive-failure-private.log'), 'failed archive issuance cannot be consumed'
    target_binding = file_binding(target); assert target_binding['sha256'] == expected_sha and target_binding['mode'] == 0o600
    value = json.loads(target.read_text())
    assert value['schemaVersion'] == 1 and value['scope'] == SCOPE
    assert value['sourceRoot'] == str(source) and value['sourceOverallPassed'] is False
    assert value['allowedMutableRoots'] == list(DATA_DIRS) and value['observedTables'] == 217 and value['observedRows'] == 6582
    assert value['failedReceiptSha256'] == FAILED_RECEIPT_SHA and value['failedSnapshotSha256'] == FAILED_SNAPSHOT_SHA
    assert value['head'] == expected_head and value['producer'] == producer_binding(tools, expected_head)
    assert value['failureFiles'] == validate_failure(source)
    source_descriptor = value['http03Descriptor']; assert file_binding(Path(source_descriptor['path'])) == source_descriptor
    assert set(value['files']) == {'dataManifest', 'fullFailureManifest', 'frozenFailureManifest', 'archiveReceipt', 'restoreInstructions'}
    for name, binding in value['files'].items():
        assert binding == file_binding(OUTPUT / NAMES[name]) and binding['mode'] == 0o600
    assert value['archive'] == file_binding(OUTPUT / NAMES['archive']) and value['archive']['mode'] == 0o600
    assert value['archive']['bytes'] <= ARCHIVE_CAP
    load = lambda name: json.loads((OUTPUT / NAMES[name]).read_text())
    receipt, data, full, frozen = [load(name) for name in ['archiveReceipt', 'dataManifest', 'fullFailureManifest', 'frozenFailureManifest']]
    assert set(data) == set(DATA_DIRS)
    assert data_projection(full) == data, 'full and three-tree manifests disagree'
    assert [row for row in full if not mutable_path(row['path'])] == frozen
    assert nondata_manifest(source) == frozen, 'frozen failure evidence changed'
    assert receipt['scope'] == SCOPE and receipt.get('passed') is True
    for name in ['roundTripVerified', 'sourceUnchangedDuringArchive', 'nonDataEvidencePreserved', 'rawSourceRetained', 'restoreMaterialFsynced']:
        assert value.get(name) is True and receipt.get(name) is True
    assert value['servicesStarted'] is False and receipt['servicesStarted'] is False
    assert value['durableBackup'] is False and receipt['durableBackup'] is False
    assert receipt['archive'] == value['archive'] and receipt['producer'] == value['producer']
    assert receipt['manifestSha256'] == value['files']['dataManifest']['sha256']
    assert receipt['failureEvidenceSha256'] == value['files']['frozenFailureManifest']['sha256']
    assert receipt['symlinkCount'] == 0 and receipt['hardlinkGroups'] == []
    assert (OUTPUT / NAMES['restoreInstructions']).read_text() == restore_instructions()
    if check_data:
        assert data_manifests(source) == data, 'failed data changed since verified archive'
        assert stopped_failure(source, tools) == value['stoppedEvidence'], 'failed source shutdown evidence changed'
    assert file_binding(target) == target_binding, 'descriptor changed during validation'
    return value

verify_recovery_descriptor = verify_recovery_archive

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['tools', 'failure-state', 'output', 'descriptor']: parser.add_argument('--' + name, type=Path, required=True)
    for name in ['expected-head', 'expected-descriptor-sha256', 'expected-producer-sha256', 'expected-inline-sha256', 'expected-python-sha256']:
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args(); os.umask(0o077)
    tools, source = canonical(args.tools), canonical(args.failure_state)
    assert source == SOURCE and tools == ROOT / 'eduk12_tools_20261018'
    assert re.fullmatch('[a-f0-9]{64}', args.expected_descriptor_sha256)
    assert sha_file(Path(sys.executable).resolve()) == args.expected_python_sha256
    assert file_binding(PRODUCER)['sha256'] == args.expected_producer_sha256
    output = output_path(args.output, protected=[tools, canonical(args.descriptor).parent, ROOT / 'eduk12_c23_http_03', ROOT / 'eduk12_c21_http_01'])
    lock_path = canonical(tools / '.measurement.lock'); assert lock_path.is_file()
    with lock_path.open('rb') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        guard = ResourceGuard(); steps = []; started = time.monotonic(); created = False
        result = {'scope': SCOPE, 'passed': False, 'servicesStarted': False, 'durableBackup': False, 'rawSourceRetained': True}
        def interrupted(signum, _frame): raise TimeoutError(guard.error or ('archive signal ' + str(signum)))
        previous = {sig: signal.signal(sig, interrupted) for sig in [signal.SIGALRM, signal.SIGTERM, signal.SIGINT, signal.SIGHUP]}
        signal.setitimer(signal.ITIMER_REAL, 600)
        try:
            guard.start(); assert guard.check()['workspaceFreeBytes'] >= FLOOR + RESERVE
            producer = producer_binding(tools, args.expected_head)
            assert producer['inlinePythonSha256'] == args.expected_inline_sha256
            source_helpers, _ = helpers()
            source_helpers.validate_descriptor(args.descriptor, args.expected_descriptor_sha256, tools / 'postgresql/bin/pg_controldata')
            http03 = file_binding(args.descriptor)
            failed_files = validate_failure(source); stopped = stopped_failure(source, tools)
            full, data = frozen_failure_manifest(source), data_manifests(source)
            assert data_projection(full) == data, 'source changed across full/data capture'
            frozen = [entry for entry in full if not mutable_path(entry['path'])]
            assert frozen == nondata_manifest(source)
            budget = recovery_budget(data, guard.check())
            output.mkdir(mode=0o700); created = True; fsync_directory(output.parent)
            for name, value in [('fullFailureManifest', full), ('dataManifest', data), ('frozenFailureManifest', frozen)]: sync_json(output / NAMES[name], value)
            sync_bytes(output / NAMES['restoreInstructions'], restore_instructions().encode())
            partial = output / 'archive.part'; archive = output / NAMES['archive']; restore = output / 'verification-restore'
            def run(argv, name, seconds):
                step = bounded(argv, output / (name + '.log'), seconds, guard.check); steps.append(step); return step
            run(['/usr/bin/tar', '--format=pax', '--acls', '--xattrs', '--xattrs-include=*', '--numeric-owner', '--atime-preserve=system',
                 '-I', '/usr/bin/gzip -6 -n', '-cf', partial, '-C', source, *DATA_DIRS], 'archive', 300)
            assert file_binding(partial)['bytes'] <= ARCHIVE_CAP
            descriptor = os.open(partial, os.O_RDONLY | os.O_NOFOLLOW)
            try: os.fsync(descriptor)
            finally: os.close(descriptor)
            partial_sha = sha_file(partial)
            run(['/usr/bin/gzip', '-t', partial], 'gzip-integrity', 60)
            archive_members(partial, data, guard.check)
            restore.mkdir(mode=0o700)
            run(['/usr/bin/tar', '--acls', '--xattrs', '--xattrs-include=*', '--same-owner', '--same-permissions', '-xzf', partial, '-C', restore], 'roundtrip-extract', 180)
            fsync_tree(restore)
            assert data_manifests(restore) == data, 'complete extracted bytes/metadata differ'
            run([tools / 'postgresql/bin/pg_controldata', '-D', restore / 'pgdata'], 'restored-controldata', 10)
            assert sha_file(output / 'restored-controldata.log') == stopped['pgControldataSha256'], 'restored PG control differs'
            assert frozen_failure_manifest(source) == full and data_manifests(source) == data, 'failed raw source changed during archive'
            assert validate_failure(source) == failed_files and stopped_failure(source, tools) == stopped
            source_helpers.validate_descriptor(args.descriptor, args.expected_descriptor_sha256, tools / 'postgresql/bin/pg_controldata')
            assert file_binding(args.descriptor) == http03 and producer_binding(tools, args.expected_head) == producer
            assert sha_file(partial) == partial_sha
            guard.check()
            # This is the ONLY removal: a newly created, fully verified extraction.
            assert restore.parent == output and restore.name == 'verification-restore' and private_directory(output) == output
            shutil.rmtree(restore); fsync_directory(output)
            assert not os.path.lexists(archive); os.rename(partial, archive); fsync_directory(output)
            archive_binding = file_binding(archive)
            result.update(passed=True, roundTripVerified=True, sourceUnchangedDuringArchive=True, nonDataEvidencePreserved=True,
                          restoreMaterialFsynced=True, temporaryVerificationCopyRemoved=True, archive=archive_binding,
                          manifestSha256=sha_file(output / NAMES['dataManifest']), failureEvidenceSha256=sha_file(output / NAMES['frozenFailureManifest']),
                          symlinkCount=0, hardlinkGroups=[], producer=producer, budget=budget, steps=steps,
                          elapsedSeconds=time.monotonic()-started, minimumObserved=guard.minimum,
                          comparedMetadata=['path', 'type', 'mode', 'uid', 'gid', 'mtime_ns', 'size', 'SHA256', 'all xattrs and ACLs', 'zero links'],
                          excludedMetadata=['atime', 'ctime', 'inode number', 'allocated blocks', 'directory size'])
            sync_json(output / NAMES['archiveReceipt'], result); fsync_directory(output)
            value = {'schemaVersion': 1, 'scope': SCOPE, 'sourceRoot': str(source), 'sourceOverallPassed': False,
                     'allowedMutableRoots': list(DATA_DIRS), 'observedTables': 217, 'observedRows': 6582,
                     'failedReceiptSha256': FAILED_RECEIPT_SHA, 'failedSnapshotSha256': FAILED_SNAPSHOT_SHA,
                     'head': args.expected_head, 'producer': producer, 'failureFiles': failed_files, 'http03Descriptor': http03,
                     'stoppedEvidence': stopped, 'archive': archive_binding,
                     'files': {name: file_binding(output / NAMES[name]) for name in ['dataManifest', 'fullFailureManifest', 'frozenFailureManifest', 'archiveReceipt', 'restoreInstructions']},
                     **{name: result[name] for name in ['roundTripVerified', 'sourceUnchangedDuringArchive', 'nonDataEvidencePreserved', 'rawSourceRetained', 'restoreMaterialFsynced', 'servicesStarted', 'durableBackup']}}
            guard.check(); sync_json(output / NAMES['descriptor'], value); fsync_directory(output)
            # Publication is the final step; no source mutation or service follows.
            print(json.dumps({'passed': True, 'scope': SCOPE, 'descriptorPath': str(output / NAMES['descriptor']),
                              'descriptorSha256': sha_file(output / NAMES['descriptor']), 'archiveSha256': archive_binding['sha256']}), flush=True)
        except BaseException as error:
            # Stop asynchronous guard signals before preserving the failure.
            for sig in previous: signal.signal(sig, signal.SIG_IGN)
            signal.setitimer(signal.ITIMER_REAL, 0); guard.stop()
            if created and os.path.lexists(output / NAMES['descriptor']):
                os.rename(output / NAMES['descriptor'], output / 'descriptor-unpublished.json')
            result.update(passed=False, errorType=type(error).__name__, error=str(error), steps=steps,
                          minimumObserved=guard.minimum, elapsedSeconds=time.monotonic()-started)
            if created:
                sync_json(output / 'archive-failure-private.json', result)
                sync_bytes(output / 'archive-failure-private.log', traceback.format_exc().encode()); fsync_directory(output)
            raise
        finally:
            for sig in previous: signal.signal(sig, signal.SIG_IGN)
            signal.setitimer(signal.ITIMER_REAL, 0); guard.stop()
            for sig, handler in previous.items(): signal.signal(sig, handler)
            fcntl.flock(lock, fcntl.LOCK_UN)

if __name__ == '__main__': main()
`

export const ARCHIVE_PYTHON=pythonProgram

export function archivePythonArgv(options,bindings){
 for(const name of ['producerSha256','inlineSha256','pythonSha256'])assert.match(bindings[name],/^[a-f0-9]{64}$/)
 const argv=['-B','-c',pythonProgram]
 for(const name of ['tools','failure-state','output','expected-head','descriptor','expected-descriptor-sha256'])argv.push('--'+name,options[name])
 for(const [name,key] of [['producer-sha256','producerSha256'],['inline-sha256','inlineSha256'],['python-sha256','pythonSha256']])argv.push('--expected-'+name,bindings[key])
 return argv
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const options=parseArchiveArgs(process.argv.slice(2)),producer=fileURLToPath(import.meta.url)
 const hash=value=>createHash('sha256').update(value).digest('hex'),python=fs.realpathSync(options.python)
 const bindings={producerSha256:hash(fs.readFileSync(producer)),inlineSha256:hash(pythonProgram),pythonSha256:hash(fs.readFileSync(python))}
 const child=spawnSync(python,archivePythonArgv(options,bindings),{stdio:'inherit',env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',PYTHONDONTWRITEBYTECODE:'1'}})
 if(child.error)throw child.error
 process.exitCode=child.status??1
}
