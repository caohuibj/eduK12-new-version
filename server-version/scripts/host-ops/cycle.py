"""Authenticated daily backup chain. Reuse only same-day/fresh matching evidence."""
import datetime as dt
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid
from zoneinfo import ZoneInfo
STATE=Path('/var/lib/eduk12-ops')
HOST=Path('/var/lib/eduk12-backups')
ATT=Path('/var/lib/eduk12-attachments/data')
PROOF=Path('/etc/eduk12-cos-cleanup/recovery-proof.json')
def require(ok,code):
    if not ok:raise RuntimeError(code)
def fresh(at,now,hours):
    if not at:return False
    stamp=dt.datetime.fromisoformat(at.replace('Z','+00:00'))
    return stamp.tzinfo is not None and dt.timedelta(0)<=now-stamp<=dt.timedelta(hours=hours)
def day(at):
    return dt.datetime.fromisoformat(at.replace('Z','+00:00')).astimezone(ZoneInfo('Asia/Shanghai')).date()
def database_ready(receipt,now,revision):
    return receipt.get('status')=='VERIFIED' and receipt.get('sourceRevision')==revision and receipt.get('restore',{}).get('status')=='PASS' and fresh(receipt.get('at'),now,24) and day(receipt['at'])==day(now.isoformat()) and len(receipt.get('objects',[]))==2 and all(o.get('downloadVerified') is True and o.get('authenticatedDecryptionVerified') is True for o in receipt['objects'])
def snapshot_ready(catalog,receipt,now):
    latest=catalog.get('snapshots',[])[-1] if catalog.get('snapshots') else {}
    return not catalog.get('pending') and not catalog.get('lastFailure') and latest.get('complete') is True and fresh(latest.get('at'),now,1.5) and dt.datetime.fromisoformat(latest['at'].replace('Z','+00:00'))>=dt.datetime.fromisoformat(receipt['at'].replace('Z','+00:00'))
def verification_ready(catalog,now):
    return not catalog.get('lastFailure') and fresh(catalog.get('lastFullVerificationAt'),now,24) and not (catalog.get('verifyCursor') and not catalog['verifyCursor'].get('complete'))
def recovery_ready(proof,receipt,catalog,verifier,now):
    binding=next((b for b in proof.get('bindings',[]) if b.get('hostPointId')==receipt.get('id')),None)
    return proof.get('status')=='VERIFIED' and fresh(proof.get('at'),now,24) and proof.get('referenceVerifierSha256')==verifier and all(proof.get('checks',{}).get(k) is True for k in ['databaseRestore','attachmentDecrypt','databaseReferences']) and binding is not None and binding.get('databaseVersionId')==receipt['objects'][0]['versionId'] and any(s['id']==binding.get('attachmentSnapshotId') and s.get('remote',{}).get('versionId')==binding.get('snapshotVersionId') for s in catalog.get('snapshots',[]))
def backup_module():
    p=Path('/opt/eduk12-backups/current/backup.py')
    require(Path('/opt/eduk12-backups/releases') in p.resolve().parents,'REVIEWED_BACKUP_CODE_REQUIRED')
    spec=importlib.util.spec_from_file_location('cycle_backup',p);b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b);return b
def run_cycle(b,secret,revision):
    now=lambda:dt.datetime.now(dt.timezone.utc)
    started=time.monotonic();result={'at':now().isoformat(),'status':'RUNNING','stages':{}}
    signed=lambda p:b.unseal(json.loads(p.read_text()),secret) if p.exists() else {}
    def persist():b.atomic(STATE/'cycle-status.json',result)
    def stage(name,unit,ready,limit=1):
        result['stage']=name;result['stages'][name]='RUNNING';persist()
        if ready():result['stages'][name]='REUSED'
        else:
            for _ in range(limit):
                require(time.monotonic()-started<7200,'CYCLE_TIME_BUDGET_EXCEEDED')
                subprocess.run(['systemctl','start',unit],check=True,timeout=2700,capture_output=True)
                if ready():break
                if name!='attachment_verification':raise RuntimeError('CYCLE_STAGE_NOT_COMPLETE')
            require(ready(),'CYCLE_STAGE_NOT_COMPLETE');result['stages'][name]='COMPLETE'
        persist()
    try:
        require(not b.cleanup_pending(secret),'COS_CLEANUP_TRANSACTION_PENDING')
        db=lambda:signed(HOST/'latest.json');cat=lambda:signed(ATT/'catalog.json')
        stage('database','eduk12-database-backup.service',lambda:database_ready(db(),now(),revision))
        stage('attachment_snapshot','eduk12-attachments-backup.service',lambda:snapshot_ready(cat(),db(),now()))
        stage('attachment_verification','eduk12-attachments-verify.service',lambda:verification_ready(cat(),now()),16)
        verifier=b.sha(Path('/opt/eduk12-cos-cleanup/current/recovery.mjs'))
        stage('joint_recovery','eduk12-cos-recovery.service',lambda:recovery_ready(signed(PROOF),db(),cat(),verifier,now()))
        result.update(status='COMPLETE',completedAt=now().isoformat(),databasePointId=db()['id'])
        b.atomic(STATE/'cycle-last-success.json',result)
    except Exception as exc:
        code=str(exc) if re.fullmatch('[A-Z][A-Z0-9_]{2,80}',str(exc)) else 'CYCLE_EXECUTION_FAILED'
        result.update(status='FAILED',error=code)
    finally:
        result['at']=now().isoformat();persist()
        audit=STATE/'cycle-attempts';audit.mkdir(mode=0o700,exist_ok=True);require(not audit.is_symlink(),'AUDIT_ROOT_REFUSED')
        b.atomic(audit/(uuid.uuid4().hex+'.json'),result)
        for p in sorted(audit.glob('*.json'),key=lambda p:p.stat().st_mtime)[:-30]:
            require(not p.is_symlink() and re.fullmatch(r'[a-f0-9]{32}\.json',p.name),'AUDIT_FILE_REFUSED');p.unlink()
    return result
def main():
    os.umask(0o077);require(os.geteuid()==0 and STATE.resolve()==STATE,'ROOT_REQUIRED')
    b=backup_module()
    values=dict(x.split('=',1) for x in b.private_read(b.KEY_FILE).splitlines() if '=' in x and not x.startswith('#'))
    secret=values.get('BACKUP_ENCRYPTION_KEY','');require(len(secret)>=32,'BACKUP_KEY_REQUIRED')
    revision=b.inspect(b.BACKEND)['Config'].get('Labels',{}).get('org.opencontainers.image.revision','')
    require(re.fullmatch('[a-f0-9]{40}',revision) is not None,'CURRENT_RELEASE_REQUIRED')
    with (STATE/'cycle.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return 0
        result=run_cycle(b,secret,revision);print(json.dumps(result));return 0 if result['status']=='COMPLETE' else 1
if __name__=='__main__':raise SystemExit(main())
