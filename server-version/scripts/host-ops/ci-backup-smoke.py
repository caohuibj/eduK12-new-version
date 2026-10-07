"""Actual encrypted backup/restoration against a labelled, disposable CI database."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import backup


def require_fixture_environment(local, env, uid, home):
    if local:
        # Explicitly opt in to the dedicated local socket; reject remote hosts,
        # context overrides and impersonation of the hosted CI environment.
        if env.get('NODE_ENV') != 'test' or env.get('CI') == 'true' or env.get('GITHUB_ACTIONS') == 'true' \
                or env.get('DOCKER_CONTEXT') or env.get('DOCKER_HOST') != 'unix://' + str(home / '.colima/r5-validation/docker.sock'):
            raise RuntimeError('ISOLATED_LOCAL_DOCKER_ONLY')
    elif uid != 0 or any(env.get(k) != v for k, v in {'CI':'true','GITHUB_ACTIONS':'true','NODE_ENV':'test'}.items()):
        raise RuntimeError('ISOLATED_HOSTED_CI_ONLY')


def main():
    if sys.argv[1:] not in [[], ['--local']]:
        raise RuntimeError('BACKUP_FIXTURE_ARGUMENTS_INVALID')
    local = sys.argv[1:] == ['--local']
    require_fixture_environment(local, os.environ, os.geteuid(), Path.home())
    ident = uuid.uuid4().hex
    name = 'eduk12-ci-host-backup-' + ident
    def docker(*args, check=True):
        return subprocess.run(['docker', *args], capture_output=True, check=check, timeout=120)
    containers = set(docker('ps','-aq').stdout.split())
    volumes = set(docker('volume','ls','-q').stdout.split())
    image = 'postgres:16.15-bookworm'
    with tempfile.TemporaryDirectory(prefix='eduk12-host-backup-ci-') as temp:
        work = Path(temp); backup.STATE = work; backup.NODE = shutil.which('node')
        secret = 'synthetic-host-backup-ci-key-0123456789'
        envfile = work/'fixture.env';envfile.write_text('POSTGRES_USER=fixture\nPOSTGRES_DB=fixture\nPOSTGRES_PASSWORD=synthetic-ci-only\n');envfile.chmod(0o600)
        bootstrap = work/'pause-bootstrap.sh'
        bootstrap.write_text('#!/bin/sh\nset -eu\ntouch /tmp/bootstrap-paused\nwhile [ ! -e /tmp/release-startup ]; do sleep 0.1; done\n')
        bootstrap.chmod(0o755)
        try:
            docker('run','-d','--name',name,'--label','eduk12.ci.fixture='+ident,'--network','none','--memory','384m','--cpus','0.5','--env-file',str(envfile),'--mount','type=bind,src='+str(bootstrap)+',dst=/docker-entrypoint-initdb.d/00-pause.sh,readonly',image)
            deadline = time.monotonic() + 60
            while docker('exec',name,'test','-f','/tmp/bootstrap-paused',check=False).returncode:
                assert time.monotonic() < deadline, 'bootstrap fixture did not start'
                time.sleep(0.2)
            # PostgreSQL's bootstrap server accepts Unix sockets, but is stopped
            # before the real TCP service starts. It must not permit a restore.
            assert docker('exec',name,'pg_isready','-U','fixture','-d','fixture').returncode == 0
            assert docker('exec',name,'pg_isready','-h','127.0.0.1','-U','fixture','-d','fixture',check=False).returncode != 0
            ready = threading.Event(); errors = []
            def probe():
                try: backup.wait_for_database(name, 'fixture', 'fixture')
                except Exception as error: errors.append(error)
                finally: ready.set()
            waiter = threading.Thread(target=probe, daemon=True); waiter.start()
            try:
                assert not ready.wait(1), 'temporary Unix-socket bootstrap server accepted as ready'
            finally:
                docker('exec',name,'touch','/tmp/release-startup')
                waiter.join(95)
            assert ready.is_set() and not errors, 'final database did not become ready'
            expected=[{'name':'synthetic','checksum':'a'*64}]
            sql='CREATE TABLE "_prisma_migrations" (id text, migration_name text, checksum text, finished_at timestamp, rolled_back_at timestamp); INSERT INTO "_prisma_migrations" VALUES (\'synthetic\',\'synthetic\',\''+'a'*64+'\',now(),NULL); CREATE TABLE users(id text); INSERT INTO users VALUES (\'synthetic-user\');'
            docker('exec',name,'psql','-v','ON_ERROR_STOP=1','-U','fixture','-d','fixture','-c',sql)
            source=Path(__file__).resolve().parent.parent/'backup'
            env={**os.environ,'BACKUP_ENCRYPTION_KEY':secret,'POSTGRES_CONTAINER':name,'DB_USER':'fixture','DB_NAME':'fixture','ENCRYPTED_DIR':str(work)}
            subprocess.run([backup.NODE,str(source/'backup-db.mjs'),'full'],env=env,capture_output=True,check=True,timeout=120)
            encrypted=list(work.glob('*.edubackup.enc'));assert len(encrypted)==1
            restored=backup.restore_check(encrypted[0],source,secret,work,ident,expected)
            assert restored['users']==1 and restored['appliedMigrations']==1 and restored['status']=='PASS'
            assert restored['migrationFingerprint']==backup.migration_fingerprint(expected)
            assert not restored['runtimeRoleRestored'] and not restored['applicationReleaseReady']
            assert docker('inspect','eduk12-restore-'+ident[:12],check=False).returncode!=0
            mismatch_id=uuid.uuid4().hex
            try:
                backup.restore_check(encrypted[0],source,secret,work,mismatch_id,[{'name':'synthetic','checksum':'b'*64}])
                raise AssertionError('wrong release identity accepted')
            except RuntimeError as error:assert str(error)=='RESTORE_RELEASE_SCHEMA_MISMATCH'
            assert docker('inspect','eduk12-restore-'+mismatch_id[:12],check=False).returncode!=0
            # A corrupt checksum must fail and still reclaim the labelled anonymous volume.
            Path(str(encrypted[0])+'.sha256').write_text('0'*64+'  corrupted\n')
            try:backup.restore_check(encrypted[0],source,secret,work,uuid.uuid4().hex,expected);raise AssertionError('bad checksum accepted')
            except RuntimeError as error:assert str(error)=='BACKUP_COMMAND_FAILED'
        finally:
            found=docker('inspect',name,check=False)
            if found.returncode==0:
                item=json.loads(found.stdout)[0];assert item['Config']['Labels']['eduk12.ci.fixture']==ident
                docker('rm','-f','-v',name)
    assert set(docker('ps','-aq').stdout.split())==containers
    assert set(docker('volume','ls','-q').stdout.split())==volumes
    print(json.dumps({'execution':'local' if local else 'hosted-ci','bootstrapReadinessIsolation':'PASS','encryptedBackup':'PASS','actualIsolatedRestore':'PASS','wrongReleaseFailureCleanup':'PASS','checksumFailureCleanup':'PASS','foreignContainersAndVolumesPreserved':True}))


if __name__=='__main__':main()
