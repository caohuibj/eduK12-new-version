#!/usr/bin/env python3
"""Issue/consume a private, read-only descriptor of the exact stopped C23 HTTP03.

Issuance inventories existing bytes. It neither starts PostgreSQL nor creates a
clone, and it never relabels the retained C21 source manifests as HTTP03 data.
The CLI owns the existing measurement lock; callers must not wrap it in flock.
Library consumers must hold that same lock across validation and source use.
"""
import argparse
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
SOURCE = Path('/workspace/scratch/5a77e8bdc1ae/eduk12_c23_http_03')
RECEIPT_SHA256 = 'c81cd9219d12abc1f591c84f877ec21155076546ac0027b9536f1231e67e3c1e'
SNAPSHOT_SHA256 = '4dd59702b756e0d16cf9fe1c2b821118ba1aa5587f0408a9ccb8527d3d8a01e5'
RUNTIME_SHA256 = '78984d47ae039d301d36ca0d5285004e42e5e01ac5b22c88bee794d3e06e3c80'
SOURCE_HEAD = '83621ccee3b3d552cfb7539781f603c7b8ef7011'
SCOPE = 'READ_ONLY_C23_HTTP03_SOURCE_DESCRIPTOR_NOT_A_NEW_RUN_RECEIPT'
DATA_DIRS = ('pgdata', 'uploads', 'exports')
FILES = {
    'finalReceipt': 'c23-runtime-result.json',
    'finalSnapshot': 'c23-final-db-snapshot.json',
    'runtimeTemplatePrivate': 'runtime-private.json',
    'legacyFixturePrivate': 'fixture-private.json',
    'finalAudit': 'c23-audit-final-result.json',
    'sourceStatus': 'status.json',
    'sourceFrozenInputs': 'frozen-inputs.json',
    'originalC21ManifestBefore': 'source-byte-manifest-before.json',
    'originalC21ManifestAfter': 'source-byte-manifest-after.json',
}


def sha_file(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def regular_file(path):
    path = Path(path)
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_nlink == 1, 'regular, unaliased file required'
    return info


def file_binding(path):
    path = Path(path)
    before = regular_file(path)
    value = {'path': str(path.absolute()), 'bytes': before.st_size,
             'mode': stat.S_IMODE(before.st_mode), 'sha256': sha_file(path)}
    after = regular_file(path)
    assert (before.st_dev, before.st_ino, before.st_size, before.st_mode, before.st_mtime_ns, before.st_ctime_ns) == (
        after.st_dev, after.st_ino, after.st_size, after.st_mode, after.st_mtime_ns, after.st_ctime_ns), 'file changed while hashing'
    return value


def xattrs(path):
    """Retain every readable xattr, including POSIX ACLs, without a whitelist.

    Missing APIs, inaccessible names/values, or a failed read are errors. The
    private manifest keeps exact values so recovery metadata is not lossy.
    """
    result = {}
    for name in sorted(os.listxattr(path, follow_symlinks=False)):
        value = os.getxattr(path, name, follow_symlinks=False)
        result[name] = {'bytes': len(value), 'sha256': hashlib.sha256(value).hexdigest(),
                        'base64': base64.b64encode(value).decode('ascii')}
    return result


def manifest(root):
    """Exact recoverable inventory, including empty directories and root metadata.

    Symlinks, external hardlinks and special files are deliberately unsupported;
    each entry records that decision rather than silently following an alias.
    Read-induced atimes and filesystem-specific inode/directory sizes are absent.
    """
    root = Path(root)
    assert root.is_dir() and not root.is_symlink(), 'manifest root must be a real directory'
    result = []
    for path in [root, *sorted(root.rglob('*'))]:
        before = path.lstat()
        assert not stat.S_ISLNK(before.st_mode), 'source symlinks are forbidden'
        entry = {'path': str(path.relative_to(root)), 'mode': stat.S_IMODE(before.st_mode),
                 'uid': before.st_uid, 'gid': before.st_gid, 'mtimeNs': before.st_mtime_ns,
                 'linkTarget': None, 'xattrs': xattrs(path)}
        if stat.S_ISDIR(before.st_mode):
            entry.update(type='directory')
        else:
            assert stat.S_ISREG(before.st_mode) and before.st_nlink == 1, 'special files and hardlinked files are forbidden'
            entry.update(type='file', size=before.st_size, links=before.st_nlink, sha256=sha_file(path))
        after = path.lstat()
        assert xattrs(path) == entry['xattrs'], 'source extended attributes changed during inventory'
        assert (before.st_dev, before.st_ino, before.st_size, before.st_mode, before.st_uid,
                before.st_gid, before.st_mtime_ns, before.st_ctime_ns) == (
                after.st_dev, after.st_ino, after.st_size, after.st_mode, after.st_uid,
                after.st_gid, after.st_mtime_ns, after.st_ctime_ns), 'source changed during inventory'
        result.append(entry)
    return result


def no_symlink_ancestors(path):
    path = Path(os.path.abspath(path))
    for ancestor in [path, *path.parents]:
        assert not ancestor.is_symlink(), 'symlink path or ancestor is forbidden'
    return path


def outside_git(path):
    """Reject real Git storage/worktrees, while tolerating empty sandbox markers.

    An empty .git directory is not a repository. Git is the membership oracle;
    all other discovery errors and nonempty unrecognized markers fail closed.
    """
    path = Path(path)
    probe = path if path.is_dir() else path.parent
    assert probe.is_dir(), 'private output parent must already exist'
    env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
    env.update(LC_ALL='C', GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull,
               GIT_DISCOVERY_ACROSS_FILESYSTEM='1')
    result = subprocess.run(['git', '--no-optional-locks', '-C', str(probe),
                             'rev-parse', '--absolute-git-dir'], env=env,
                            capture_output=True, text=True, timeout=15)
    assert result.returncode != 0, 'private output must be outside every Git worktree/storage directory'
    assert result.returncode == 128 and not result.stdout and result.stderr.strip() == (
        'fatal: not a git repository (or any of the parent directories): .git'), 'cannot establish private output is outside Git'
    for ancestor in [probe, *probe.parents]:
        marker = ancestor / '.git'
        if os.path.lexists(marker):
            assert marker.is_dir() and not marker.is_symlink() and not any(marker.iterdir()), 'unrecognized nonempty Git marker'


def destination_path(destination, source=SOURCE, repo=REPO, protected=()):
    destination = no_symlink_ancestors(destination)
    outside_git(destination)
    assert not destination.exists(), 'destination already exists'
    assert destination.parent.is_dir(), 'destination parent must already exist'
    for root in [Path(source).resolve(), Path(repo).resolve(), *map(lambda p: Path(p).resolve(), protected)]:
        assert destination != root and root not in destination.parents and destination not in root.parents, 'nested source/repository/evidence destination forbidden'
    return destination


def source_receipt(receipt, snapshot_sha):
    assert receipt.get('scope') == 'C23_CHECKPOINT_HTTP_PG_RESTORE_NOT_C26_CAPACITY', 'wrong source receipt scope'
    for key in ['passed', 'cleanupVerified', 'sourceUnchanged', 'inputsUnchanged',
                'finalSnapshotVerified', 'requestedPrefixPassed']:
        assert receipt.get(key) is True, 'source receipt is not fully accepted: ' + key
    assert snapshot_sha == SNAPSHOT_SHA256 and receipt.get('finalSnapshotSha256') == SNAPSHOT_SHA256
    assert set(receipt.get('phases', {})) == {'upgrade', 'functional', 'races', 'restore'}
    assert all(phase.get('passed') is True for phase in receipt['phases'].values())
    assert receipt.get('privateRuntimeFileSha256') == RUNTIME_SHA256
    assert receipt.get('finalOriginalRowsPreserved', {}).get('allOriginalRowsRetained') is True
    assert receipt.get('finalOriginalRowsPreserved', {}).get('originalGuardsUnchanged') is True
    exits = receipt.get('processExits', {})
    assert {'postgres', 'redis', 'api', 'c23-audit-final'} <= set(exits)
    assert all(type(code) is int and code == 0 for code in exits.values()), 'source process exit failed'


def source_files(source):
    source = no_symlink_ancestors(source)
    assert source == SOURCE, 'only the exact accepted C23 HTTP03 source is allowed'
    files = {name: file_binding(source / relative) for name, relative in FILES.items()}
    assert files['finalReceipt']['sha256'] == RECEIPT_SHA256, 'wrong C23 HTTP03 runtime receipt'
    assert files['finalSnapshot']['sha256'] == SNAPSHOT_SHA256, 'wrong C23 HTTP03 final snapshot'
    assert files['runtimeTemplatePrivate']['sha256'] == RUNTIME_SHA256, 'source private runtime changed'
    receipt = json.loads((source / FILES['finalReceipt']).read_text())
    source_receipt(receipt, files['finalSnapshot']['sha256'])
    assert receipt['frozenInputsSha256'] == files['sourceFrozenInputs']['sha256']
    frozen = json.loads((source / FILES['sourceFrozenInputs']).read_text())
    status = json.loads((source / FILES['sourceStatus']).read_text())
    assert frozen['head'] == status['head'] == SOURCE_HEAD
    snapshot = json.loads((source / FILES['finalSnapshot']).read_text())
    assert set(snapshot['projection']) == set(snapshot['columns']) == set(snapshot['columnMetadata'])
    assert len(snapshot['columns']) == 217 and sum(v['rows'] for v in snapshot['projection'].values()) == 6529
    audit = json.loads((source / FILES['finalAudit']).read_text())
    assert audit['passed'] is True and audit['mode'] == 'final' and audit['snapshotSha256'] == SNAPSHOT_SHA256
    assert audit['retainedFacts'] == receipt['finalOriginalRowsPreserved']
    assert receipt['auditProducers']['c23-audit-final']['resultSha256'] == files['finalAudit']['sha256']
    before = files['originalC21ManifestBefore']['sha256']
    assert before == files['originalC21ManifestAfter']['sha256'], 'original C21 source manifests changed'
    assert digest(json.loads((source / FILES['originalC21ManifestBefore']).read_text())) == receipt['sourceManifestSha256']
    return files


def stopped(source, pg_controldata):
    source, pg_controldata = Path(source), Path(pg_controldata)
    status = json.loads((source / 'status.json').read_text())
    assert status['state'] == 'stopped' and status['cleanupVerified'] is True and status['cleanupErrors'] == []
    assert set(status['pids']) == set(status['ports']) == {'postgres', 'redis', 'api'}
    assert not os.path.lexists(source / 'pgdata/postmaster.pid'), 'source PostgreSQL PID file exists'
    assert (source / 'pgdata/PG_VERSION').read_text().strip() == '16'
    assert not any((source / 'pgdata/pg_tblspc').iterdir()), 'external tablespaces forbidden'
    for pid in status['pids'].values():
        assert type(pid) is int and pid > 1
        assert not Path('/proc', str(pid)).exists(), 'recorded source PID is still present; resolve before proceeding'
    for port in status['ports'].values():
        assert type(port) is int and 0 < port < 65536
        with socket.socket() as sock:
            sock.settimeout(.2)
            assert sock.connect_ex(('127.0.0.1', port)) != 0, 'source service port is still open'
    for config in ['postgresql.conf', 'postgresql.auto.conf']:
        for line in (source / 'pgdata' / config).read_text().splitlines():
            active = line.split('#', 1)[0].strip()
            assert not re.match(r'(?i)^(include(?:_if_exists|_dir)?|data_directory|hba_file|ident_file|external_pid_file|log_directory|archive_command|restore_command)\b', active), 'external PostgreSQL path/command forbidden'
    tool = file_binding(pg_controldata)
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC'}
    version = subprocess.check_output([str(pg_controldata), '--version'], env=env, text=True, timeout=10).strip()
    assert version == 'pg_controldata (PostgreSQL) 16.15'
    output = subprocess.check_output([str(pg_controldata), '-D', str(source / 'pgdata')], env=env, text=True, timeout=10)
    values = dict(line.split(':', 1) for line in output.splitlines() if ':' in line)
    assert values.get('Database cluster state', '').strip() == 'shut down', 'PostgreSQL control state is not cleanly shut down'
    assert file_binding(pg_controldata) == tool, 'pg_controldata changed'
    return {'statusSha256': sha_file(source / 'status.json'), 'noPostmasterPid': True,
            'recordedPidsAbsent': True, 'sourcePortsClosed': True, 'clusterState': 'shut down',
            'controlFileSha256': sha_file(source / 'pgdata/global/pg_control'),
            'pgControldata': tool, 'pgControldataVersion': version,
            'pgControldataSha256': hashlib.sha256(output.encode()).hexdigest()}


def python_helper_closure(base=BASE):
    return {str(path.relative_to(base)): file_binding(path) for path in sorted(base.rglob('*.py'))}


def producer_binding(expected_head):
    assert re.fullmatch('[a-f0-9]{40}', expected_head)
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True, timeout=15).strip() == expected_head
    paths = ['server-version/scripts/recovery']
    assert subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--', *paths], cwd=REPO, timeout=15).returncode == 0, 'commit source producer/helpers before issuance'
    assert not subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '--', *paths], cwd=REPO, timeout=15).strip(), 'untracked source producer/helper'
    return {'head': expected_head, 'sourceTool': file_binding(Path(__file__)),
            'python': file_binding(Path(sys.executable).resolve()),
            'pythonVersion': sys.version, 'pythonHelperClosure': python_helper_closure()}


def capture(source, pg_controldata):
    files = source_files(source)
    status = stopped(source, pg_controldata)
    full = manifest(source)
    data = {name: manifest(source / name) for name in DATA_DIRS}
    assert source_files(source) == files and stopped(source, pg_controldata) == status, 'source changed across capture'
    return {'files': files, 'stoppedEvidence': status, 'fullManifest': full, 'dataManifest': data}


def write_private(path, value):
    with Path(path).open('x') as handle:
        os.chmod(path, 0o600)
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())


def issue(source, output, pg_controldata, expected_head):
    """Called only under the measurement lock; refuses existing destinations."""
    source = no_symlink_ancestors(source)
    assert source == SOURCE
    output = destination_path(output, source, protected=[Path(pg_controldata).resolve().parents[2]])
    producer = producer_binding(expected_head)
    before = capture(source, pg_controldata)
    after = capture(source, pg_controldata)
    assert before == after, 'source changed between complete inventories'
    assert producer_binding(expected_head) == producer, 'source producer changed'
    output.mkdir(mode=0o700)
    write_private(output / 'c25-source-full-manifest.json', before['fullManifest'])
    write_private(output / 'c25-source-data-manifest.json', before['dataManifest'])
    files = {**before['files'],
             'sourceFullManifest': file_binding(output / 'c25-source-full-manifest.json'),
             'resumedDataManifest': file_binding(output / 'c25-source-data-manifest.json')}
    descriptor = {'schemaVersion': 1, 'scope': SCOPE, 'dataRoot': str(source), 'evidenceRoot': str(output),
                  'stopped': True, 'acceptedTables': 217, 'acceptedRows': 6529,
                  'sourceReceiptSha256': RECEIPT_SHA256, 'finalSnapshotSha256': SNAPSHOT_SHA256,
                  'files': files, 'stoppedEvidence': before['stoppedEvidence'], 'producer': producer,
                  'sourceBytesUnchanged': True, 'producerUnchanged': True,
                  'plannedCloneBytes': sum(e['size'] for entries in before['dataManifest'].values() for e in entries if e['type'] == 'file'),
                  'lineage': 'source-byte-manifest-before/after remain ORIGINAL_C21_SOURCE_BYTES; the new C25 manifests inventory stopped C23 HTTP03.',
                  'limitations': ['Read-only current stopped-byte descriptor, not a new PG/HTTP acceptance.',
                                  'Runtime template is referenced by exact file SHA only; no credentials are copied into this descriptor.']}
    # A failed final capture leaves private partial evidence, never a descriptor.
    assert capture(source, pg_controldata) == before, 'source changed before descriptor issuance'
    assert producer_binding(expected_head) == producer, 'source producer changed before issuance'
    target = output / 'c25-source-descriptor.json'
    write_private(target, descriptor)
    return target


def assert_unchanged(descriptor, pg_controldata):
    assert descriptor['scope'] == SCOPE and descriptor['schemaVersion'] == 1
    assert descriptor['stopped'] is True and descriptor['sourceBytesUnchanged'] is True and descriptor['producerUnchanged'] is True
    assert descriptor['dataRoot'] == str(SOURCE)
    assert descriptor['acceptedTables'] == 217 and descriptor['acceptedRows'] == 6529
    assert descriptor['sourceReceiptSha256'] == RECEIPT_SHA256 and descriptor['finalSnapshotSha256'] == SNAPSHOT_SHA256
    expected_keys = set(FILES) | {'sourceFullManifest', 'resumedDataManifest'}
    assert set(descriptor['files']) == expected_keys
    evidence = no_symlink_ancestors(descriptor['evidenceRoot'])
    outside_git(evidence)
    assert evidence != SOURCE and SOURCE not in evidence.parents and REPO not in evidence.parents
    assert evidence.is_dir() and evidence.stat().st_mode & 0o077 == 0, 'private descriptor directory required'
    expected_paths = {**{name: SOURCE / relative for name, relative in FILES.items()},
                      'sourceFullManifest': evidence / 'c25-source-full-manifest.json',
                      'resumedDataManifest': evidence / 'c25-source-data-manifest.json'}
    for name, path in expected_paths.items():
        assert descriptor['files'][name] == file_binding(path), 'descriptor binding changed: ' + name
    assert producer_binding(descriptor['producer']['head']) == descriptor['producer'], 'source producer/helpers changed'
    full = json.loads(expected_paths['sourceFullManifest'].read_text())
    data = json.loads(expected_paths['resumedDataManifest'].read_text())
    assert set(data) == set(DATA_DIRS)
    current = capture(SOURCE, pg_controldata)
    assert current['files'] == {name: descriptor['files'][name] for name in FILES}
    assert current['stoppedEvidence'] == descriptor['stoppedEvidence'], 'source stopped/control evidence changed'
    assert current['fullManifest'] == full and current['dataManifest'] == data, 'C23 HTTP03 source bytes/metadata changed'
    assert descriptor['plannedCloneBytes'] == sum(e['size'] for entries in data.values() for e in entries if e['type'] == 'file')
    assert producer_binding(descriptor['producer']['head']) == descriptor['producer']
    return current


def validate_descriptor(path, expected_sha256, pg_controldata, destination=None):
    path = no_symlink_ancestors(path)
    assert re.fullmatch('[a-f0-9]{64}', expected_sha256)
    assert sha_file(path) == expected_sha256, 'descriptor SHA mismatch'
    assert regular_file(path).st_mode & 0o077 == 0, 'descriptor must be private'
    descriptor = json.loads(path.read_text())
    assert path == Path(descriptor['evidenceRoot']) / 'c25-source-descriptor.json'
    if destination is not None:
        destination_path(destination, SOURCE, protected=[descriptor['evidenceRoot'], Path(pg_controldata).resolve().parents[2]])
    assert_unchanged(descriptor, pg_controldata)
    assert sha_file(path) == expected_sha256, 'descriptor changed during validation'
    return descriptor


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['issue', 'validate'])
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--expected-head')
    parser.add_argument('--descriptor', type=Path)
    parser.add_argument('--expected-descriptor-sha256')
    parser.add_argument('--destination', type=Path)
    a = parser.parse_args()
    os.umask(0o077)
    tools = no_symlink_ancestors(a.tools)
    assert tools.is_dir()
    with (tools / '.measurement.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        pg = tools / 'postgresql/bin/pg_controldata'
        if a.action == 'issue':
            assert a.output and a.expected_head and not a.descriptor and not a.expected_descriptor_sha256 and not a.destination
            path = issue(a.source, a.output, pg, a.expected_head)
            print(json.dumps({'scope': SCOPE, 'descriptorPath': str(path), 'descriptorSha256': sha_file(path)}))
        else:
            assert a.descriptor and a.expected_descriptor_sha256 and not a.output and not a.expected_head and a.source == SOURCE
            descriptor = validate_descriptor(a.descriptor, a.expected_descriptor_sha256, pg, a.destination)
            print(json.dumps({'scope': SCOPE, 'descriptorSha256': a.expected_descriptor_sha256,
                              'acceptedTables': descriptor['acceptedTables'], 'acceptedRows': descriptor['acceptedRows'], 'sourceUnchanged': True}))


if __name__ == '__main__':
    main()
