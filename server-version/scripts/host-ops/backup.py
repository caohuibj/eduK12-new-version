#!/usr/bin/env python3
"""Host-only encrypted DB/config backups. Never restore into production or delete COS objects."""
import datetime as dt
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import time
import uuid

CONFIG = Path('/etc/eduk12-backups/config.json')
STATE = Path('/var/lib/eduk12-backups')
CODE = Path(__file__).resolve().parent
KEY_FILE = Path('/opt/eduk12-new/deploy/release-234/backup.env')
NODE = '/opt/eduk12-new/tools/node-v24.21.0-linux-x64/bin/node'
BACKEND = 'eduk12-prod-backend'
POSTGRES = 'eduk12-prod-postgres'
LABEL = 'eduk12.host-backup-task'
LOCAL_FILES = {'database.edubackup.enc', 'database.edubackup.enc.sha256', 'server-config.gcm', 'receipt.json'}


def require(ok, code):
    if not ok:
        raise RuntimeError(code)


def private_read(path):
    s = path.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_uid == 0 and not s.st_mode & 0o077, 'PRIVATE_ROOT_FILE_REQUIRED')
    return path.read_text()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()


def seal(value, secret):
    body = {k: v for k, v in value.items() if k != 'mac'}
    return {**body, 'mac': hmac.new(secret.encode(), canonical(body), hashlib.sha256).hexdigest()}


def unseal(value, secret):
    require(isinstance(value, dict), 'CATALOG_AUTHENTICATION_FAILED')
    require(isinstance(value.get('mac'), str) and hmac.compare_digest(value['mac'], seal(value, secret)['mac']), 'CATALOG_AUTHENTICATION_FAILED')
    return {k: v for k, v in value.items() if k != 'mac'}


def atomic(path, value):
    require(not path.is_symlink(), 'STATE_SYMLINK_REFUSED')
    tmp = path.with_name('.write-' + uuid.uuid4().hex)
    try:
        with tmp.open('x') as stream:
            os.chmod(tmp, 0o600)
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 ** 2), b''):
            digest.update(chunk)
    return digest.hexdigest()

def cleanup_pending(secret):
    journal = Path('/var/lib/eduk12-cos-cleanup/journal.json')
    return journal.exists() and unseal(json.loads(private_read(journal)), secret).get('status') != 'COMPLETE'


def validate_config(c):
    require(c.get('schema') == 1 and c.get('sourceBucket') == 'ptool-videos-edu-1393949445'
            and c.get('backupBucket') == 'eduk12-backups-1393949445' and c.get('region') == 'ap-beijing', 'BUCKET_BINDING_REFUSED')
    require(c.get('cleanupMode') == 'plan_only' and c.get('localCopies') == 2, 'UNSAFE_RETENTION_CONFIG')
    require(isinstance(c.get('maxBackupBytes'), int) and 0 < c['maxBackupBytes'] <= 512 * 1024 ** 2
            and c.get('minimumFreeBytes', 0) >= 6 * 1024 ** 3, 'UNSAFE_RESOURCE_CONFIG')
    r = c.get('retention', {})
    require(r.get('dailyDays', 0) >= 30 and r.get('weeklyWeeks', 0) >= 12 and r.get('monthlyMonths', 0) >= 12, 'RETENTION_TOO_SHORT')
    hashes = c.get('backupSourceSha256', {})
    require(set(hashes) == {'backup-db.mjs', 'restore-db.mjs'} and all(re.fullmatch('[a-f0-9]{64}', v or '') for v in hashes.values()), 'BACKUP_SOURCE_PINS_REQUIRED')
    return c


def run(args, env=None, data=None, timeout=600):
    result = subprocess.run(args, input=data, env=env, capture_output=True, timeout=timeout)
    if result.returncode:
        # Private diagnostics remain root-only and never reach journal/stdout.
        (STATE / 'last-command.log').write_bytes(result.stdout + result.stderr)
        os.chmod(STATE / 'last-command.log', 0o600)
        raise RuntimeError('BACKUP_COMMAND_FAILED')
    return result.stdout


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def cleanup_container(name, ident):
    require(re.fullmatch(r'eduk12-(?:restore-[a-f0-9]{12}|host-backup-[a-f0-9]{32})', name) is not None, 'CLEANUP_TARGET_REFUSED')
    found = subprocess.run(['docker', 'inspect', name], capture_output=True, timeout=30)
    if found.returncode:
        return
    item = json.loads(found.stdout)[0]
    require((item['Config'].get('Labels') or {}).get(LABEL) == ident, 'CLEANUP_OWNERSHIP_REFUSED')
    require(not any(m.get('Type') == 'volume' and not re.fullmatch('[a-f0-9]{64}', m.get('Name', '')) for m in item.get('Mounts', [])), 'NAMED_VOLUME_CLEANUP_REFUSED')
    run(['docker', 'rm', '--force', '--volumes', name], timeout=30)


def transfer(c, credentials, image, work, ident, command='put', file=None):
    name = 'eduk12-host-backup-' + ident
    for p in work.iterdir():
        if p.is_file() and p.name in LOCAL_FILES:
            os.chown(p, 1000, 1000)
    os.chown(work, 1000, 1000)
    payload = {'config': c, 'credentials': credentials, 'command': command, 'runId': ident}
    if file:
        payload.update(file=file, sha256=sha(work / file))
    try:
        output = run(['docker', 'run', '--rm', '-i', '--name', name, '--label', LABEL + '=' + ident,
                      '--user', '1000:1000', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
                      '--memory', '256m', '--cpus', '0.3', '--pids-limit', '64', '--tmpfs', '/tmp:size=32m,noexec,nosuid',
                      '--mount', 'type=bind,src=' + str(CODE) + ',dst=/ops,readonly',
                      '--mount', 'type=bind,src=' + str(work) + ',dst=/work',
                      '--entrypoint', 'node', image, '/ops/backup-cos.cjs'], data=canonical(payload), timeout=1200)
        return json.loads(output)
    finally:
        cleanup_container(name, ident)


def migration_fingerprint(rows):
    return hashlib.sha256(''.join(row['name'] + '\t' + row['checksum'] + '\n'
                                  for row in sorted(rows, key=lambda row: row['name'])).encode()).hexdigest()


def release_migrations(source):
    directory = source.parent.parent / 'backend/prisma/migrations'
    require(directory.is_dir() and not directory.is_symlink(), 'RELEASE_MIGRATIONS_REQUIRED')
    rows = []
    for folder in sorted(directory.iterdir()):
        if folder.is_dir():
            sql = folder / 'migration.sql'
            require(not folder.is_symlink() and sql.is_file() and not sql.is_symlink(), 'RELEASE_MIGRATION_SOURCE_INVALID')
            rows.append({'name': folder.name, 'checksum': sha(sql)})
    require(bool(rows), 'RELEASE_MIGRATIONS_REQUIRED')
    return rows


def verify_restored_migrations(applied, expected):
    require(bool(expected) and len(applied) == len(expected)
            and len({row['name'] for row in applied}) == len(applied)
            and migration_fingerprint(applied) == migration_fingerprint(expected), 'RESTORE_RELEASE_SCHEMA_MISMATCH')
    return migration_fingerprint(expected)


def source_runtime_proof(expected):
    # A runtime outage must not stop taking a recoverable database backup.
    # This is source-side evidence, never a claim that restore provisioned roles.
    try:
        proof = json.loads(run(['docker', 'exec', BACKEND, 'node', 'scripts/runtime-role-contract.mjs', 'verify-current'], timeout=60))
        require(proof.get('ok') and proof.get('restrictedRuntimeRole')
                and proof.get('migrationFingerprint') == migration_fingerprint(expected), 'SOURCE_RELEASE_RUNTIME_NOT_READY')
        return {'status': 'PASS', **proof}
    except RuntimeError as error:
        if str(error) not in ['BACKUP_COMMAND_FAILED', 'SOURCE_RELEASE_RUNTIME_NOT_READY']:
            raise
    except (ValueError, AttributeError, subprocess.TimeoutExpired):
        pass
    return {'status': 'NOT_VERIFIED', 'reason': 'runtime_preflight_failed_or_unavailable', 'applicationReleaseReady': False}


def wait_for_database(name, user, database):
    # One slow Docker exec during cold startup is not a readiness verdict.
    # Keep the per-probe cap; bound the entire wait by a monotonic deadline.
    deadline = time.monotonic() + 90
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError('ISOLATED_RESTORE_NOT_READY')
        try:
            result = subprocess.run(['docker', 'exec', name, 'pg_isready', '-U', user, '-d', database],
                                    capture_output=True, timeout=min(10, remaining))
            if result.returncode == 0 and time.monotonic() < deadline:
                return
        except subprocess.TimeoutExpired:
            pass
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(1, remaining))


def restore_check(file, source, secret, work, ident, expected_migrations=None):
    expected = release_migrations(source) if expected_migrations is None else expected_migrations
    name = 'eduk12-restore-' + ident[:12]
    envfile = work / 'restore.env'
    envfile.write_text('POSTGRES_USER=restore\nPOSTGRES_DB=restore\nPOSTGRES_PASSWORD=' + uuid.uuid4().hex + '\n')
    os.chmod(envfile, 0o600)
    try:
        run(['docker', 'run', '-d', '--name', name, '--label', LABEL + '=' + ident,
             '--network', 'none', '--memory', '384m', '--cpus', '0.5', '--pids-limit', '128',
             '--env-file', str(envfile), 'postgres:16.15-bookworm'])
        wait_for_database(name, 'restore', 'restore')
        env = os.environ.copy()
        env.update(BACKUP_ENCRYPTION_KEY=secret, RESTORE_CONFIRMATION='RESTORE', RESTORE_TARGET_CONTAINER=name,
                   RESTORE_TARGET_DB_NAME='restore', RESTORE_TARGET_DB_USER='restore', NODE_OPTIONS='--max-old-space-size=768')
        run([NODE, str(source / 'restore-db.mjs'), str(file)], env=env, timeout=600)
        sql = 'SELECT COALESCE(json_agg(row_to_json(m)),\'[]\'::json) FROM (SELECT migration_name AS name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) m; SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL; SELECT count(*) FROM users;'
        counts = run(['docker', 'exec', name, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'restore', '-d', 'restore', '-Atc', sql]).decode().strip().splitlines()
        require(len(counts) == 3 and counts[1] == '0' and counts[2].isdigit(), 'RESTORE_SCHEMA_CHECK_FAILED')
        applied = json.loads(counts[0])
        fingerprint = verify_restored_migrations(applied, expected)
        return {'status': 'PASS', 'appliedMigrations': len(applied), 'migrationFingerprint': fingerprint,
                'failedMigrations': 0, 'users': int(counts[2]), 'network': 'none',
                'runtimeRoleRestored': False, 'applicationReleaseReady': False}
    finally:
        cleanup_container(name, ident)
        envfile.unlink(missing_ok=True)


def attachment_association(secret):
    p = Path('/var/lib/eduk12-attachments/data/catalog.json')
    if not p.exists():
        return {'status': 'not_available', 'compositeRecoveryVerified': False}
    state = unseal(json.loads(p.read_text()), secret)
    points = state.get('snapshots', [])
    return {'status': 'pending' if state.get('pending') or not points else 'inventory_linked',
            'snapshot': points[-1] if points else None, 'lastFullVerificationAt': state.get('lastFullVerificationAt'),
            'coverage': 'attachment_inventory_only', 'compositeRecoveryVerified': False,
            'reason': 'Independent inventories do not prove database-reference-consistent restoration.'}


def config_archive(work):
    deploy = Path('/opt/eduk12-new/deploy')
    files = [deploy / f for f in ['compose.sh', 'eduk12-prod.env', 'docker-compose.prod-override.yml',
                                  'docker-compose.login-workers.yml', 'docker-compose.pdf-worker-mime.yml', 'current-release.json']]
    files += [Path('/etc/nginx/nginx.conf'), Path('/etc/ssh/sshd_config'), CONFIG]
    for directory in ['/etc/eduk12-ops', '/etc/eduk12-attachments']:
        p = Path(directory) / 'config.json'
        if p.exists():
            files.append(p)
    for p in Path('/etc/systemd/system').glob('eduk12-*'):
        if p.suffix in ['.timer', '.service'] and not p.is_symlink():
            files.append(p)
    target = work / 'server-config.tar.gz'; total = 0
    with tarfile.open(target, 'w:gz') as archive:
        for p in files:
            s = p.lstat()
            owners = (0, 1000) if p.parent == deploy else (0,)
            require(stat.S_ISREG(s.st_mode) and s.st_uid in owners and not s.st_mode & 0o022
                    and s.st_size <= 8 * 1024 ** 2, 'CONFIG_SOURCE_REFUSED')
            total += s.st_size
            require(total <= 32 * 1024 ** 2, 'CONFIG_ARCHIVE_LIMIT')
            archive.add(p, arcname=str(p).lstrip('/'), recursive=False)
            again = p.lstat()
            require((s.st_ino, s.st_size, s.st_mtime_ns) == (again.st_ino, again.st_size, again.st_mtime_ns), 'CONFIG_CHANGED_DURING_BACKUP')
    os.chmod(target, 0o600)
    return target, len(files)


def rotate_local(catalog, copies):
    require(not copies.is_symlink(), 'LOCAL_ROOT_SYMLINK_REFUSED')
    verified = [p for p in catalog['points'] if p.get('status') == 'VERIFIED' and p.get('restore', {}).get('status') == 'PASS'
                and p.get('objects') and all(o.get('downloadVerified') and o.get('authenticatedDecryptionVerified') for o in p['objects'])]
    keep = {p['id'] for p in verified[-2:]}
    require(len(keep) == min(2, len(catalog['points'])), 'LOCAL_RETENTION_PROOF_REQUIRED')
    removed = 0
    for p in verified[:-2]:
        require(re.fullmatch('[a-f0-9]{32}', p['id']) is not None, 'LOCAL_POINT_ID_REFUSED')
        directory = copies / p['id']
        if not directory.exists():
            continue
        require(not directory.is_symlink() and directory.is_dir(), 'LOCAL_POINT_SYMLINK_REFUSED')
        require(all(x.is_file() and not x.is_symlink() and x.name in LOCAL_FILES for x in directory.iterdir()), 'LOCAL_POINT_CONTENT_REFUSED')
        for obj in p['objects']:
            require(obj.get('file') in LOCAL_FILES, 'LOCAL_RECEIPT_PATH_REFUSED')
            local = directory / obj['file']
            require(local.is_file() and sha(local) == obj['sha256'], 'LOCAL_RETENTION_HASH_REQUIRED')
        shutil.rmtree(directory); removed += 1
    return removed


def backup():
    require(os.geteuid() == 0, 'ROOT_REQUIRED')
    c = validate_config(json.loads(private_read(CONFIG)))
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(not STATE.is_symlink() and STATE.stat().st_uid == 0 and not STATE.stat().st_mode & 0o077, 'PRIVATE_STATE_REQUIRED')
    with (STATE / 'backup.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'status': 'SKIPPED', 'reason': 'another_backup_running'}
        values = dict(line.split('=', 1) for line in private_read(KEY_FILE).splitlines() if '=' in line and not line.startswith('#'))
        secret = values.get('BACKUP_ENCRYPTION_KEY', '')
        require(len(secret) >= 32, 'BACKUP_KEY_REQUIRED')
        if cleanup_pending(secret):
            return {'status': 'SKIPPED', 'reason': 'COS_CLEANUP_TRANSACTION_PENDING'}
        backend = inspect(BACKEND); pg = inspect(POSTGRES)
        require(backend['State']['Running'] and pg['State']['Running'] and pg['Config']['Image'] == 'postgres:16.15-bookworm', 'PRODUCTION_NOT_READY')
        require(not inspect(backend['Image'])['Config'].get('Volumes'), 'HELPER_ANONYMOUS_VOLUMES_REFUSED')
        env = dict(s.split('=', 1) for s in backend['Config']['Env'] if '=' in s)
        require(env.get('COS_BUCKET') == c['sourceBucket'] and env.get('COS_REGION') == c['region'], 'MEDIA_BUCKET_BINDING_CHANGED')
        credentials = {k: env[k] for k in ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_SECURITY_TOKEN'] if env.get(k)}
        require(credentials.get('COS_SECRET_ID') and credentials.get('COS_SECRET_KEY'), 'COS_CREDENTIALS_REQUIRED')
        revision = backend['Config'].get('Labels', {}).get('org.opencontainers.image.revision', '')
        require(re.fullmatch('[a-f0-9]{40}', revision) is not None, 'RELEASE_REVISION_REQUIRED')
        source = Path('/opt/eduk12-new/releases') / revision[:8] / 'source/server-version/scripts/backup'
        require((source / 'backup-db.mjs').is_file() and (source / 'restore-db.mjs').is_file(), 'RELEASE_BACKUP_SOURCE_REQUIRED')
        require(all(not (source / file).is_symlink() and sha(source / file) == expected for file, expected in c['backupSourceSha256'].items()), 'BACKUP_SOURCE_CHANGED_REVALIDATE')
        expected_migrations = release_migrations(source)
        runtime_proof = source_runtime_proof(expected_migrations)
        require(shutil.disk_usage(STATE).free >= c['minimumFreeBytes'], 'BACKUP_DISK_HEADROOM_REQUIRED')
        ident = uuid.uuid4().hex; work = STATE / ('.work-' + ident); work.mkdir(mode=0o700)
        fingerprint = hmac.new(secret.encode(), b'eduk12-host-backup-key-v1', hashlib.sha256).hexdigest()
        catalog_file = STATE / 'catalog.json'
        try:
            catalog = unseal(json.loads(private_read(catalog_file)), secret) if catalog_file.exists() else {'schema': 1, 'keyFingerprint': fingerprint, 'points': []}
            require(catalog.get('keyFingerprint') == fingerprint, 'KEY_ROTATION_REQUIRES_MIGRATION')
            if not catalog_file.exists():
                require(not transfer(c, credentials, backend['Image'], work, ident, 'probe')['repositoryExists'], 'REMOTE_REPOSITORY_REQUIRES_RECOVERY')
            pg_env = dict(s.split('=', 1) for s in pg['Config']['Env'] if '=' in s)
            task_env = os.environ.copy()
            task_env.update(BACKUP_ENCRYPTION_KEY=secret, POSTGRES_CONTAINER=POSTGRES,
                            DB_USER=pg_env['POSTGRES_USER'], DB_NAME=pg_env['POSTGRES_DB'],
                            ENCRYPTED_DIR=str(work), NODE_OPTIONS='--max-old-space-size=768')
            run([NODE, str(source / 'backup-db.mjs'), 'full'], env=task_env)
            encrypted = list(work.glob('*.edubackup.enc'))
            require(len(encrypted) == 1 and encrypted[0].stat().st_size <= c['maxBackupBytes'], 'DATABASE_BACKUP_LIMIT')
            database = work / 'database.edubackup.enc'; encrypted[0].rename(database)
            Path(str(database) + '.sha256').write_text(sha(database) + '  ' + database.name + '\n')
            remote_db = transfer(c, credentials, backend['Image'], work, ident, file=database.name)
            downloaded = work / (database.name + '.remote')
            Path(str(downloaded) + '.sha256').write_text(remote_db['sha256'] + '  ' + downloaded.name + '\n')
            run([NODE, str(source / 'backup-db.mjs'), 'verify', str(downloaded)], env=task_env)
            restoration = restore_check(downloaded, source, secret, work, ident, expected_migrations)
            remote_db.update(file=database.name, authenticatedDecryptionVerified=True)
            archive, config_count = config_archive(work)
            crypto_receipt = json.loads(run([NODE, str(CODE / 'backup-crypto.mjs'), 'encrypt'],
                                            data=canonical({'secret': secret, 'file': str(archive), 'output': str(work / 'server-config.gcm')})))
            archive.unlink()
            remote_config = transfer(c, credentials, backend['Image'], work, ident, file='server-config.gcm')
            run([NODE, str(CODE / 'backup-crypto.mjs'), 'verify'],
                data=canonical({'secret': secret, 'file': str(work / 'server-config.gcm.remote'), 'receipt': crypto_receipt}))
            remote_config.update(file='server-config.gcm', authenticatedDecryptionVerified=True, crypto=crypto_receipt)
            require(inspect(BACKEND)['Image'] == backend['Image'], 'RELEASE_CHANGED_DURING_BACKUP')
            receipt = {'schema': 1, 'id': ident, 'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'status': 'VERIFIED',
                       'bucket': c['backupBucket'], 'region': c['region'], 'sourceRevision': revision,
                       'expectedMigrationFingerprint': migration_fingerprint(expected_migrations), 'sourceRuntimeProof': runtime_proof,
                       'scope': 'database_and_server_configuration', 'fullServerDiskImage': False,
                       'objects': [remote_db, remote_config], 'serverConfigFiles': config_count,
                       'restore': restoration, 'attachmentAssociation': attachment_association(secret), 'protected': not catalog['points']}
            atomic(work / 'receipt.json', seal(receipt, secret))
            metadata = transfer(c, credentials, backend['Image'], work, ident, file='receipt.json')
            receipt['metadata'] = metadata
            copies = STATE / 'copies'; copies.mkdir(mode=0o700, exist_ok=True)
            require(not copies.is_symlink(), 'LOCAL_ROOT_SYMLINK_REFUSED')
            local = copies / ident; local.mkdir(mode=0o700)
            for name in LOCAL_FILES:
                shutil.copyfile(work / name, local / name); os.chmod(local / name, 0o600)
            catalog['points'].append(receipt)
            atomic(catalog_file, seal(catalog, secret))
            atomic(STATE / 'latest.json', seal(receipt, secret))
            removed = rotate_local(catalog, copies)
            # A protected cleanup PLAN; remote deletion is deliberately absent.
            atomic(STATE / 'cleanup-plan.json', seal({'at': receipt['at'], 'mode': 'plan_only',
                   'retention': c['retention'], 'protectedBaseline': catalog['points'][0]['id'],
                   'minimumRecoveryPoints': 2, 'remoteDeletionEnabled': False,
                   'blocked': ['REMOTE_DELETE_NOT_ENABLED', 'COMPOSITE_RECOVERY_NOT_VERIFIED'],
                   'localCopies': min(2, len(catalog['points']))}, secret))
            output = {'status': 'VERIFIED', 'at': receipt['at'], 'id': ident, 'bucket': c['backupBucket'],
                      'databaseBytes': remote_db['bytes'], 'serverConfigBytes': remote_config['bytes'],
                      'remoteDownloadAndDecryption': 'PASS', 'isolatedRestore': 'PASS', 'localCopies': min(2, len(catalog['points'])),
                      'localExpiredCopiesRemoved': removed, 'attachmentAssociation': receipt['attachmentAssociation']['status'],
                      'compositeRecoveryVerified': False, 'remoteCleanup': 'plan_only'}
            atomic(STATE / 'status.json', output)
            return output
        finally:
            require(work.parent == STATE and work.name == '.work-' + ident and not work.is_symlink(), 'WORKSPACE_CLEANUP_REFUSED')
            shutil.rmtree(work)


def interrupted(*_):
    raise RuntimeError('BACKUP_INTERRUPTED')


def main():
    os.umask(0o077)
    signal.signal(signal.SIGTERM, interrupted); signal.signal(signal.SIGINT, interrupted)
    try:
        require(len(sys.argv) == 2 and sys.argv[1] == 'backup', 'COMMAND_REFUSED')
        print(json.dumps(backup()))
        return 0
    except Exception as e:
        code = str(e) if re.fullmatch('[A-Z][A-Z0-9_]{2,80}', str(e)) else 'BACKUP_FAILED'
        if STATE.is_dir() and not STATE.is_symlink():
            atomic(STATE / 'status.json', {'status': 'FAILED', 'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'error': code})
        print(json.dumps({'status': 'FAILED', 'error': code}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
