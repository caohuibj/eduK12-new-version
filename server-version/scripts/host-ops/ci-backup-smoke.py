"""Actual encrypted backup/restoration against a labelled, disposable CI database."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid
import backup


def main():
    if os.geteuid() != 0 or any(os.environ.get(k) != v for k, v in {'CI':'true','GITHUB_ACTIONS':'true','NODE_ENV':'test'}.items()):
        raise RuntimeError('ISOLATED_HOSTED_CI_ONLY')
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
        try:
            docker('run','-d','--name',name,'--label','eduk12.ci.fixture='+ident,'--network','none','--memory','384m','--cpus','0.5','--env-file',str(envfile),image)
            import time
            for _ in range(90):
                if docker('exec',name,'pg_isready','-U','fixture','-d','fixture',check=False).returncode==0:break
                time.sleep(1)
            else:raise RuntimeError('CI_DATABASE_NOT_READY')
            sql='CREATE TABLE "_prisma_migrations" (id text, finished_at timestamp, rolled_back_at timestamp); INSERT INTO "_prisma_migrations" VALUES (\'synthetic\',now(),NULL); CREATE TABLE users(id text); INSERT INTO users VALUES (\'synthetic-user\');'
            docker('exec',name,'psql','-v','ON_ERROR_STOP=1','-U','fixture','-d','fixture','-c',sql)
            source=Path(__file__).resolve().parent.parent/'backup'
            env={**os.environ,'BACKUP_ENCRYPTION_KEY':secret,'POSTGRES_CONTAINER':name,'DB_USER':'fixture','DB_NAME':'fixture','ENCRYPTED_DIR':str(work)}
            subprocess.run([backup.NODE,str(source/'backup-db.mjs'),'full'],env=env,capture_output=True,check=True,timeout=120)
            encrypted=list(work.glob('*.edubackup.enc'));assert len(encrypted)==1
            restored=backup.restore_check(encrypted[0],source,secret,work,ident)
            assert restored['users']==1 and restored['appliedMigrations']==1 and restored['status']=='PASS'
            assert docker('inspect','eduk12-restore-'+ident[:12],check=False).returncode!=0
            # A corrupt checksum must fail and still reclaim the labelled anonymous volume.
            Path(str(encrypted[0])+'.sha256').write_text('0'*64+'  corrupted\n')
            try:backup.restore_check(encrypted[0],source,secret,work,uuid.uuid4().hex);raise AssertionError('bad checksum accepted')
            except RuntimeError as error:assert str(error)=='BACKUP_COMMAND_FAILED'
        finally:
            found=docker('inspect',name,check=False)
            if found.returncode==0:
                item=json.loads(found.stdout)[0];assert item['Config']['Labels']['eduk12.ci.fixture']==ident
                docker('rm','-f','-v',name)
    assert set(docker('ps','-aq').stdout.split())==containers
    assert set(docker('volume','ls','-q').stdout.split())==volumes
    print(json.dumps({'encryptedBackup':'PASS','actualIsolatedRestore':'PASS','checksumFailureCleanup':'PASS','foreignContainersAndVolumesPreserved':True}))


if __name__=='__main__':main()
