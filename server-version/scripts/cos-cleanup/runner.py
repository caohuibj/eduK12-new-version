#!/usr/bin/env python3
"""Independent cleanup launcher; holds both writer locks, never mounts Docker into task."""
import fcntl
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import uuid

CONFIG = Path('/etc/eduk12-cos-cleanup/config.json')
STATE = Path('/var/lib/eduk12-cos-cleanup')
CODE = Path('/opt/eduk12-cos-cleanup/current')
KEY = Path('/opt/eduk12-new/deploy/release-234/backup.env')
DELETE_KEY = Path('/etc/eduk12-cos-cleanup/delete.env')
PROOF = Path('/etc/eduk12-cos-cleanup/recovery-proof.json')
LABEL = 'eduk12.cos-cleanup-task'
LOCKS = [Path('/var/lib/eduk12-backups/backup.lock'), Path('/var/lib/eduk12-attachments/host.lock')]

def require(ok, code):
    if not ok: raise RuntimeError(code)

def private(p):
    s = p.lstat()
    require(stat.S_ISREG(s.st_mode) and not s.st_mode & 0o077 and s.st_uid == 0, 'PRIVATE_ROOT_FILE_REQUIRED')
    return p.read_text()

def env_values(text):
    return dict(line.split('=', 1) for line in text.splitlines() if '=' in line and not line.startswith('#'))

def inspect(name):
    return json.loads(subprocess.run(['docker', 'inspect', name], capture_output=True, check=True, timeout=30).stdout)[0]

def cleanup_container(name, ident):
    require(re.fullmatch('eduk12-cos-cleanup-[a-f0-9]{32}', name) is not None, 'CLEANUP_CONTAINER_REFUSED')
    r = subprocess.run(['docker', 'inspect', name], capture_output=True, timeout=30)
    if r.returncode: return
    data = json.loads(r.stdout)[0]
    require((data['Config'].get('Labels') or {}).get(LABEL) == ident and not any(m.get('Type') == 'volume' for m in data.get('Mounts', [])), 'CLEANUP_CONTAINER_OWNERSHIP_REFUSED')
    subprocess.run(['docker', 'rm', '--force', name], capture_output=True, check=True, timeout=30)

def cleanup_workspace(ident):
    require(re.fullmatch('[a-f0-9]{32}', ident) is not None, 'WORKSPACE_OWNER_REQUIRED')
    for p in STATE.glob('.work-' + ident + '-*'):
        require(not p.is_symlink() and p.is_dir() and p.resolve().parent == STATE, 'WORKSPACE_SYMLINK_REFUSED')
        shutil.rmtree(p)

def interrupted(*_):
    raise RuntimeError('CLEANUP_INTERRUPTED')

def record_status(value):
    if not STATE.is_dir() or STATE.is_symlink(): return
    target = STATE / 'status.json'; require(not target.is_symlink(), 'STATUS_SYMLINK_REFUSED')
    journal = STATE / 'journal.json'
    pending = journal.exists() and json.loads(private(journal)).get('status') != 'COMPLETE'
    temp = STATE / ('.status-' + uuid.uuid4().hex)
    try:
        with temp.open('x') as stream:
            os.chmod(temp, 0o600); json.dump({'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'pendingTransaction': pending, **value}, stream)
            stream.flush(); os.fsync(stream.fileno())
        temp.replace(target)
    finally: temp.unlink(missing_ok=True)

def run():
    require(os.geteuid() == 0, 'ROOT_REQUIRED')
    c = json.loads(private(CONFIG))
    require(c.get('mode') in ['plan_only', 'execute'], 'CLEANUP_MODE_REFUSED')
    require(c.get('backupBucket') == 'eduk12-backups-1393949445' and c.get('sourceBucket') == 'ptool-videos-edu-1393949445' and c.get('region') == 'ap-beijing', 'BUCKET_BINDING_REFUSED')
    require(CODE.resolve().parent.parent == Path('/opt/eduk12-cos-cleanup/releases'), 'REVIEWED_CODE_REQUIRED')
    for directory in [STATE, Path('/var/lib/eduk12-backups'), Path('/var/lib/eduk12-attachments')]:
        s = directory.lstat()
        require(stat.S_ISDIR(s.st_mode) and directory.resolve() == directory and s.st_uid == 0 and not s.st_mode & 0o077, 'PRIVATE_STATE_REQUIRED')
    locks = []
    try:
        for p in [STATE / 'cleanup.lock', *LOCKS]:
            require(not p.is_symlink(), 'LOCK_SYMLINK_REFUSED')
            stream = p.open('a'); locks.append(stream)
            try: fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError: return {'skipped': 'backup_or_cleanup_running', 'mode': c['mode']}
        backend = inspect('eduk12-prod-backend')
        require(backend['State']['Running'] and not inspect(backend['Image'])['Config'].get('Volumes'), 'SAFE_HELPER_IMAGE_REQUIRED')
        values = dict(line.split('=', 1) for line in backend['Config']['Env'] if '=' in line)
        require(values.get('COS_BUCKET') == c['sourceBucket'] and values.get('COS_REGION') == c['region'], 'SOURCE_BUCKET_CHANGED')
        credentials = {k: values[k] for k in ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_SECURITY_TOKEN'] if values.get(k)}
        secret = env_values(private(KEY)).get('BACKUP_ENCRYPTION_KEY', '')
        require(len(secret) >= 32, 'BACKUP_KEY_REQUIRED')
        payload = {'config': c, 'credentials': credentials, 'secret': secret}
        if PROOF.exists(): private(PROOF)
        if c['mode'] == 'execute':
            for p in [Path('/opt/eduk12-backups/current/backup.py'), Path('/opt/eduk12-attachments/current/runner.py')]:
                require('COS_CLEANUP_TRANSACTION_PENDING' in p.read_text(), 'WRITER_TRANSACTION_GUARDS_REQUIRED')
            require(PROOF.exists(), 'JOINT_RECOVERY_PROOF_REQUIRED')
            delete = env_values(private(DELETE_KEY))
            require(delete.get('COS_SECRET_ID') and delete.get('COS_SECRET_KEY') and delete['COS_SECRET_ID'] != credentials.get('COS_SECRET_ID'), 'DEDICATED_DELETE_IDENTITY_REQUIRED')
            payload['deleteCredentials'] = delete
        ident = uuid.uuid4().hex; name = 'eduk12-cos-cleanup-' + ident; payload['runId'] = ident
        if PROOF.exists(): proof_mount = 'type=bind,src=' + str(PROOF) + ',dst=/proof/recovery-proof.json,readonly'
        else:
            empty = STATE / 'empty-proof'; empty.mkdir(mode=0o700, exist_ok=True)
            require(not empty.is_symlink() and not list(empty.iterdir()), 'EMPTY_PROOF_DIRECTORY_REQUIRED')
            proof_mount = 'type=bind,src=' + str(empty) + ',dst=/proof,readonly'
        mounts = ['type=bind,src=' + str(CODE.resolve()) + ',dst=/ops,readonly',
                  'type=bind,src=' + str(CODE.resolve().parent / 'attachment-backup') + ',dst=/attachment-backup,readonly',
                  'type=bind,src=' + str(STATE) + ',dst=/state',
                  'type=bind,src=/var/lib/eduk12-backups,dst=/host' + (',readonly' if c['mode'] == 'plan_only' else ''),
                  'type=bind,src=/var/lib/eduk12-attachments/data,dst=/attachments' + (',readonly' if c['mode'] == 'plan_only' else ''), proof_mount]
        # DAC_OVERRIDE is limited to the mounted catalogs owned by the UID 1000 writer.
        args = ['docker', 'run', '--rm', '-i', '--name', name, '--label', LABEL + '=' + ident,
                '--user', '0:0', '--read-only', '--cap-drop', 'ALL', '--cap-add', 'DAC_OVERRIDE', '--security-opt', 'no-new-privileges',
                '--cpus', '0.3', '--memory', '256m', '--pids-limit', '64', '--tmpfs', '/tmp:size=16m,noexec,nosuid']
        for m in mounts: args.extend(['--mount', m])
        args.extend(['--entrypoint', 'node', backend['Image'], '/ops/cli.mjs'])
        try:
            result = subprocess.run(args, input=json.dumps(payload).encode(), capture_output=True, timeout=2400)
            if result.returncode:
                try: error = json.loads(result.stderr.decode().strip().splitlines()[-1]).get('error')
                except (ValueError, IndexError): error = None
                raise RuntimeError(error if error and re.fullmatch('[A-Z][A-Z0-9_]{2,80}', error) else 'COS_CLEANUP_TASK_FAILED')
            return json.loads(result.stdout)
        finally:
            cleanup_container(name, ident); cleanup_workspace(ident)
            p = Path('/var/lib/eduk12-attachments/data/catalog.json')
            if c['mode'] == 'execute' and p.exists():
                require(not p.is_symlink() and p.is_file(), 'CATALOG_SYMLINK_REFUSED'); os.chown(p, 1000, 1000); os.chmod(p, 0o600)
    finally:
        for lock in reversed(locks): lock.close()

def main():
    os.umask(0o077); signal.signal(signal.SIGTERM, interrupted); signal.signal(signal.SIGINT, interrupted)
    try:
        require(sys.argv[1:] == ['run'], 'COMMAND_REFUSED'); result = run()
        record_status({'status': 'BLOCKED' if result.get('blocked') else 'SKIPPED' if result.get('skipped') else 'SUCCESS', **result})
        print(json.dumps(result)); return 0
    except Exception as e:
        code = str(e) if re.fullmatch('[A-Z][A-Z0-9_]{2,80}', str(e)) else 'COS_CLEANUP_FAILED'
        try: record_status({'status': 'FAILED', 'error': code})
        except (OSError, ValueError, RuntimeError): pass
        print(json.dumps({'failed': True, 'error': code}), file=sys.stderr); return 1

if __name__ == '__main__': raise SystemExit(main())
