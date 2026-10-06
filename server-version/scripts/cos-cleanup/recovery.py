#!/usr/bin/env python3
"""Read-only isolated joint recovery; never restores into production or deletes COS."""
import datetime
import fcntl
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import re
import select
import shutil
import signal
import subprocess
import time
import uuid

ROOT = Path('/var/lib/eduk12-cos-recovery')
CODE = Path('/opt/eduk12-cos-cleanup/current')
CONFIG = Path('/etc/eduk12-cos-cleanup/config.json')
PROOF = Path('/etc/eduk12-cos-cleanup/recovery-proof.json')
KEY = Path('/opt/eduk12-new/deploy/release-234/backup.env')

def require(ok, code):
    if not ok: raise RuntimeError(code)

def utc(): return datetime.datetime.now(datetime.timezone.utc).isoformat()

def host_module():
    file = Path('/opt/eduk12-backups/current/backup.py')
    require(file.resolve().parent.parent.parent == Path('/opt/eduk12-backups/releases'), 'REVIEWED_BACKUP_CODE_REQUIRED')
    spec = importlib.util.spec_from_file_location('joint_backup', file)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); return mod

def export_rows(command, file, max_bytes=536870912, timeout=180):
    require(not file.exists() and not file.is_symlink(), 'RECOVERY_EXPORT_PATH_REFUSED')
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    count = 0; end = time.monotonic() + timeout
    try:
        with file.open('xb') as target:
            os.chmod(file, 0o600)
            while True:
                require(time.monotonic() < end, 'RECOVERY_QUERY_TIMEOUT')
                if not select.select([process.stdout], [], [], 0.5)[0]: continue
                chunk = os.read(process.stdout.fileno(), 1024 * 1024)
                if not chunk: break
                count += len(chunk); require(count <= max_bytes, 'RECOVERY_EXPORT_LIMIT'); target.write(chunk)
        process.wait(timeout=10)
        require(process.returncode == 0, 'RECOVERY_QUERY_FAILED')
        return count
    finally:
        if process.poll() is None: process.kill(); process.wait(timeout=10)
        process.stdout.close()

def isolated_export(backup, file, source, secret, work, ident):
    name = 'eduk12-restore-' + ident[:12]
    envfile = work / 'restore.env'
    envfile.write_text('POSTGRES_USER=restore\nPOSTGRES_DB=restore\nPOSTGRES_PASSWORD=' + uuid.uuid4().hex + '\n'); envfile.chmod(0o600)
    def sql(value):
        return backup.run(['docker', 'exec', name, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'restore', '-d', 'restore', '-c', "SET statement_timeout='120s'; " + value])
    try:
        backup.run(['docker', 'run', '-d', '--name', name, '--label', backup.LABEL + '=' + ident,
            '--network', 'none', '--memory', '384m', '--cpus', '0.5', '--pids-limit', '128', '--env-file', str(envfile), 'postgres:16.15-bookworm'])
        # The image init server accepts Unix sockets before its final restart.
        # TCP readiness waits for the actual restore server, not that temporary one.
        for _ in range(90):
            r = subprocess.run(['docker', 'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'restore', '-d', 'restore'], capture_output=True, timeout=10)
            if r.returncode == 0: break
            time.sleep(1)
        else: raise RuntimeError('JOINT_DATABASE_NOT_READY')
        env = {**os.environ, 'BACKUP_ENCRYPTION_KEY': secret, 'RESTORE_CONFIRMATION': 'RESTORE',
            'RESTORE_TARGET_CONTAINER': name, 'RESTORE_TARGET_DB_NAME': 'restore', 'RESTORE_TARGET_DB_USER': 'restore', 'NODE_OPTIONS': '--max-old-space-size=768'}
        backup.run([backup.NODE, str(source / 'restore-db.mjs'), str(file)], env=env, timeout=600)
        counts = sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL; SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL; SELECT count(*) FROM users;').decode().strip().splitlines()
        require(len(counts) == 3 and all(x.isdigit() for x in counts) and int(counts[0]) > 0 and counts[1] == '0', 'JOINT_RESTORE_SCHEMA_FAILED')
        tables = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;").decode().strip().splitlines()
        require('stored_assets' in tables and 'asset_references' in tables and all(re.fullmatch('[A-Za-z_][A-Za-z0-9_]{0,62}', t) for t in tables), 'JOINT_REFERENCE_SCHEMA_UNKNOWN')
        def export(query, destination, max_bytes):
            return export_rows(['docker', 'exec', name, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'restore', '-d', 'restore', '-c', "SET statement_timeout='120s'; " + query], destination, max_bytes)
        export('SELECT row_to_json(a) FROM public.stored_assets a;', work / 'assets.jsonl', 16777216)
        # All persistent table rows, including JSON snapshots, are scanned. They stay
        # root-private and are removed before this task returns; no rows enter logs.
        target = work / 'references.jsonl'; total = 0
        with target.open('xb') as output:
            target.chmod(0o600)
            for n, table in enumerate(tables):
                part = work / ('reference-part-' + str(n)); remaining = 536870912 - total
                require(remaining > 0, 'JOINT_REFERENCE_EXPORT_LIMIT')
                size = export("SELECT json_build_object('table', '" + table + "', 'data', to_jsonb(t)) FROM public.\"" + table + '\" t;', part, remaining)
                with part.open('rb') as stream: shutil.copyfileobj(stream, output, 1024 * 1024)
                total += size; part.unlink()
        return {'status': 'PASS', 'at': utc(), 'appliedMigrations': int(counts[0]), 'failedMigrations': 0, 'users': int(counts[2]), 'referenceTables': len(tables), 'referenceExportBytes': total, 'network': 'none'}
    finally:
        backup.cleanup_container(name, ident); envfile.unlink(missing_ok=True)

def helper(backup, image, work, c, secret, credentials, command, **extra):
    ident = uuid.uuid4().hex; name = 'eduk12-host-backup-' + ident
    empty = work / 'empty-proof'; empty.mkdir(mode=0o700, exist_ok=True)
    proof_mount = 'type=bind,src=' + str(PROOF) + ',dst=/proof/recovery-proof.json,readonly' if PROOF.exists() else 'type=bind,src=' + str(empty) + ',dst=/proof,readonly'
    payload = {'command': command, 'config': c, 'secret': secret, 'credentials': credentials, **extra}
    try:
        args = ['docker', 'run', '--rm', '-i', '--name', name, '--label', backup.LABEL + '=' + ident,
            '--user', '0:0', '--read-only', '--cap-drop', 'ALL', '--cap-add', 'DAC_OVERRIDE', '--security-opt', 'no-new-privileges',
            '--memory', '256m', '--cpus', '0.3', '--pids-limit', '64', '--tmpfs', '/tmp:size=16m,noexec,nosuid',
            '--mount', 'type=bind,src=' + str(CODE.resolve()) + ',dst=/ops,readonly',
            '--mount', 'type=bind,src=' + str(CODE.resolve().parent / 'attachment-backup') + ',dst=/attachment-backup,readonly',
            '--mount', 'type=bind,src=' + str(work) + ',dst=/work',
            '--mount', 'type=bind,src=/var/lib/eduk12-backups,dst=/host,readonly',
            '--mount', 'type=bind,src=/var/lib/eduk12-attachments/data,dst=/attachments,readonly', '--mount', proof_mount,
            '--entrypoint', 'node', image, '/ops/recovery.mjs']
        return json.loads(backup.run(args, data=backup.canonical(payload), timeout=2400))
    finally: backup.cleanup_container(name, ident)

# A separate, signed operator request records the human authorization. Absent it,
# this task only renews evidence and never changes cleanup mode or deletes objects.
ACTIVATION = Path('/etc/eduk12-cos-cleanup/activation-request.json')
DELETE_KEY = Path('/etc/eduk12-cos-cleanup/delete.env')
PINNED_FILES = [CODE / f for f in ['recovery.py','recovery.mjs','runner.py','model.mjs','engine.mjs','store.mjs','cli.mjs']] + [
 CODE.resolve().parent / 'attachment-backup/core.mjs', Path('/opt/eduk12-backups/current/backup.py'), Path('/opt/eduk12-attachments/current/runner.py')]

def authorize_activation(backup, request, c, credentials, delete, now):
 require(request.get('schema')==1 and request.get('purpose')=='enable_protected_cos_cleanup' and request.get('deleteProbeVerified') is True, 'ACTIVATION_AUTHORIZATION_REQUIRED')
 require(re.fullmatch('[a-f0-9]{32}',request.get('id','')) is not None, 'ACTIVATION_REQUEST_ID_INVALID')
 at=datetime.datetime.fromisoformat(request['at']); end=datetime.datetime.fromisoformat(request['expiresAt'])
 require(at.tzinfo is not None and end.tzinfo is not None and at <= now < end <= at+datetime.timedelta(hours=48), 'ACTIVATION_REQUEST_EXPIRED')
 require(c['mode']=='plan_only' and backup.sha(CONFIG)==request.get('configSha256'), 'ACTIVATION_CONFIGURATION_CHANGED')
 require(delete.get('COS_SECRET_ID') and delete.get('COS_SECRET_KEY') and delete['COS_SECRET_ID']!=credentials.get('COS_SECRET_ID'), 'DEDICATED_DELETE_IDENTITY_REQUIRED')
 fingerprint=hashlib.sha256(backup.canonical(delete)).hexdigest()
 require(fingerprint==request.get('deleteIdentityFingerprint'), 'ACTIVATION_IDENTITY_CHANGED')
 pins=request.get('sourceSha256',{})
 require(set(pins)==set(str(p) for p in PINNED_FILES), 'ACTIVATION_SOURCE_PINS_REQUIRED')
 for p in PINNED_FILES: require(not p.is_symlink() and backup.sha(p)==pins[str(p)], 'ACTIVATION_REVIEWED_SOURCE_CHANGED')
 for p in PINNED_FILES[-2:]: require('COS_CLEANUP_TRANSACTION_PENDING' in p.read_text(), 'WRITER_TRANSACTION_GUARDS_REQUIRED')

def activate_if_requested(backup, c, secret, credentials, image, work):
 if not ACTIVATION.exists() or c['mode']=='execute': return False
 request=backup.unseal(json.loads(backup.private_read(ACTIVATION)),secret)
 require(request.get('runtimeImage')==image,'ACTIVATION_RUNTIME_IMAGE_CHANGED')
 delete=dict(line.split('=',1) for line in backup.private_read(DELETE_KEY).splitlines() if '=' in line and not line.startswith('#'))
 authorize_activation(backup,request,c,credentials,delete,datetime.datetime.now(datetime.timezone.utc))
 require(not backup.cleanup_pending(secret),'PENDING_CLEANUP_REQUIRES_RESUME')
 readiness=helper(backup,image,work,c,secret,credentials,'readiness')
 if not readiness.get('ready'): return False
 backup.atomic(CONFIG,{**c,'mode':'execute'})
 descriptor=os.open(str(CONFIG.parent),os.O_RDONLY)
 try:os.fsync(descriptor)
 finally:os.close(descriptor)
 backup.atomic(ROOT / ('activation-'+request['id']+'.json'),backup.seal({'at':utc(),'status':'ENABLED','requestId':request['id'],'mode':'execute','allRecoveryGatesPassed':True},secret))
 ACTIVATION.unlink()
 return True

def recover():
    require(os.geteuid() == 0, 'ROOT_REQUIRED')
    backup = host_module(); backup.STATE = ROOT
    require(CODE.resolve().parent.parent == Path('/opt/eduk12-cos-cleanup/releases'), 'REVIEWED_RECOVERY_CODE_REQUIRED')
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(not ROOT.is_symlink() and ROOT.stat().st_uid == 0 and not ROOT.stat().st_mode & 0o077, 'PRIVATE_RECOVERY_STATE_REQUIRED')
    c = json.loads(backup.private_read(CONFIG));secret = dict(x.split('=', 1) for x in backup.private_read(KEY).splitlines() if '=' in x and not x.startswith('#')).get('BACKUP_ENCRYPTION_KEY', '')
    require(len(secret) >= 32, 'BACKUP_KEY_REQUIRED')
    locks = []; work = None
    try:
        for p in [ROOT / 'recovery.lock', Path('/var/lib/eduk12-cos-cleanup/cleanup.lock'), Path('/var/lib/eduk12-backups/backup.lock'), Path('/var/lib/eduk12-attachments/host.lock')]:
            require(not p.is_symlink(), 'RECOVERY_LOCK_SYMLINK_REFUSED'); f = p.open('a'); locks.append(f)
            try: fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError: return {'status': 'SKIPPED', 'reason': 'backup_or_cleanup_running'}
        if backup.cleanup_pending(secret): return {'status': 'SKIPPED', 'reason': 'pending_cleanup_requires_resume'}
        b = backup.inspect(backup.BACKEND); require(b['State']['Running'] and not backup.inspect(b['Image'])['Config'].get('Volumes'), 'SAFE_RECOVERY_IMAGE_REQUIRED')
        e = dict(x.split('=', 1) for x in b['Config']['Env'] if '=' in x)
        require(e.get('COS_BUCKET') == c['sourceBucket'] and e.get('COS_REGION') == c['region'], 'RECOVERY_SOURCE_BUCKET_CHANGED')
        credentials = {k: e[k] for k in ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_SECURITY_TOKEN'] if e.get(k)}
        require(shutil.disk_usage(ROOT).free >= 6 * 1024 ** 3, 'RECOVERY_DISK_HEADROOM_REQUIRED')
        revision = b['Config'].get('Labels', {}).get('org.opencontainers.image.revision', '')
        require(re.fullmatch('[a-f0-9]{40}', revision) is not None, 'RECOVERY_RELEASE_REQUIRED')
        source = Path('/opt/eduk12-new/releases') / revision[:8] / 'source/server-version/scripts/backup'
        bc = backup.validate_config(json.loads(backup.private_read(Path('/etc/eduk12-backups/config.json'))))
        require(all(not (source / f).is_symlink() and backup.sha(source / f) == expected for f, expected in bc['backupSourceSha256'].items()), 'RECOVERY_SOURCE_PINS_CHANGED')
        ident = uuid.uuid4().hex; work = ROOT / ('.work-' + ident); work.mkdir(mode=0o700)
        result = helper(backup, b['Image'], work, c, secret, credentials, 'repository')
        if result.get('blocked'): return {'status': 'BLOCKED', 'blocked': result['blocked']}
        repo = backup.unseal(json.loads(backup.private_read(work / 'repository.json')), secret); bindings = []; restored = 0
        from urllib.parse import urlparse
        cos_hosts = [c['sourceBucket'] + '.cos.' + c['region'] + '.myqcloud.com']
        if e.get('COS_DOMAIN'): cos_hosts.append(urlparse(e['COS_DOMAIN'] if '://' in e['COS_DOMAIN'] else 'https://'+e['COS_DOMAIN']).hostname)
        site_hosts = ['huisurvey.cn', 'www.huisurvey.cn']
        for name in ['FRONTEND_URL', 'APP_URL', 'PUBLIC_APP_URL']:
            if e.get(name) and urlparse(e[name]).hostname: site_hosts.append(urlparse(e[name]).hostname)
        hosts = {'cos': sorted(set(x for x in cos_hosts if x)), 'site': sorted(set(site_hosts))}
        for point in repo['points']:
            cached = helper(backup, b['Image'], work, c, secret, credentials, 'cached', pointId=point['id'])
            if not cached.get('cached'):
                helper(backup, b['Image'], work, c, secret, credentials, 'database', pointId=point['id'])
                database = work / 'database.edubackup.enc'; evidence = isolated_export(backup, database, source, secret, work, uuid.uuid4().hex); restored += 1
                helper(backup, b['Image'], work, c, secret, credentials, 'attachments', pointId=point['id'], hosts=hosts, databaseRestore=evidence)
                for name in ['database.edubackup.enc', 'database.edubackup.enc.sha256', 'assets.jsonl', 'references.jsonl']: (work / name).unlink(missing_ok=True)
            binding = backup.unseal(json.loads(backup.private_read(work / 'binding.json')), secret); require(binding['hostPointId'] == point['id'] and binding['databaseVersionId'] == point['objects'][0]['versionId'], 'RECOVERY_BINDING_CHANGED')
            bindings.append(binding); (work / 'binding.json').unlink()
        require(len(bindings) == len(repo['points']) and len(bindings) >= 2, 'RECOVERY_BINDINGS_INCOMPLETE')
        # Source indices must still be the exact authenticated inputs used above.
        for file, expected in repo['sourceHashes'].items():
            if file.startswith('/host/'): p = Path('/var/lib/eduk12-backups') / Path(file).name
            elif file.startswith('/attachments/'): p = Path('/var/lib/eduk12-attachments/data') / Path(file).name
            else: continue
            require(backup.sha(p) == expected, 'RECOVERY_INPUT_CHANGED')
        proof = {'schema': 1, 'bucket': c['backupBucket'], 'region': c['region'], 'status': 'VERIFIED', 'at': utc(),
            'checks': {'databaseRestore': True, 'attachmentDecrypt': True, 'databaseReferences': True},
            'identity': repo['identity'], 'referenceVerifierSha256': backup.sha(CODE / 'recovery.mjs'), 'coverage': 'managed_cos_and_upload_attachments', 'externalResourcesBackedUp': False, 'bindings': bindings,
            'immutableCachePolicy': 'exact_database_snapshot_and_blob_versions_and_hashes_rechecked'}
        backup.atomic(PROOF, backup.seal(proof, secret))
        directory = os.open(str(PROOF.parent), os.O_RDONLY)
        try: os.fsync(directory)
        finally: os.close(directory)
        activated=activate_if_requested(backup,c,secret,credentials,b['Image'],work)
        return {'status': 'VERIFIED', 'cleanupActivated': activated, 'retainedPoints': len(bindings), 'newIsolatedRestores': restored, 'immutableBindingsRechecked': len(bindings) - restored}
    finally:
        if work:
            require(work.parent == ROOT and not work.is_symlink() and re.fullmatch(r'\.work-[a-f0-9]{32}', work.name), 'RECOVERY_WORKSPACE_REFUSED'); shutil.rmtree(work)
        for f in reversed(locks): f.close()

def main():
    os.umask(0o077); signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(RuntimeError('RECOVERY_INTERRUPTED')))
    try:
        require(__import__('sys').argv[1:] == ['run'], 'RECOVERY_COMMAND_REFUSED'); result = recover()
    except Exception as e:
        result = {'status': 'FAILED', 'error': str(e) if re.fullmatch('[A-Z][A-Z0-9_]{2,80}', str(e)) else 'JOINT_RECOVERY_FAILED'}
    if ROOT.is_dir() and not ROOT.is_symlink():
        temp = ROOT / ('.status-' + uuid.uuid4().hex); temp.write_text(json.dumps({'at': utc(), **result}) + '\n'); temp.chmod(0o600); temp.replace(ROOT / 'status.json')
    print(json.dumps(result)); return 1 if result['status'] == 'FAILED' else 0

if __name__ == '__main__': raise SystemExit(main())
