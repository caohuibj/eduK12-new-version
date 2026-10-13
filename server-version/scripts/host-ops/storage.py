"""Bounded labelled project-image and cache maintenance; live/rollback references are protected."""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import time
import uuid

DEPLOY=Path('/opt/eduk12-new/deploy')
STATE=Path('/var/lib/eduk12-ops')
CONFIG=Path('/etc/eduk12-ops/storage.json')
CACHE_FILES={'fanal/fanal.db','db/trivy.db','db/metadata.json','java-db/trivy-java.db','java-db/metadata.json'}
ROLES=('frontend','backend','ops')

def require(ok,code):
    if not ok: raise RuntimeError(code)

def command(args,timeout=60):
    result=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    require(result.returncode==0,'STORAGE_COMMAND_FAILED')
    return result.stdout

def atomic(path,value):
    require(not path.is_symlink(),'STATE_SYMLINK_REFUSED')
    temp=path.with_name('.storage-'+uuid.uuid4().hex)
    try:
        with temp.open('x') as f:
            os.chmod(temp,0o600);json.dump(value,f);f.write('\n');f.flush();os.fsync(f.fileno())
        temp.replace(path)
    finally:temp.unlink(missing_ok=True)

def validate(c):
    require(c.get('schema')==1 and c.get('deployRoot')==str(DEPLOY),'STORAGE_ROOT_REFUSED')
    require(2<=len(c.get('protectedRevisions',[]))<=8 and all(re.fullmatch('[a-f0-9]{8}',x) for x in c['protectedRevisions']),'PROTECTED_RELEASES_REQUIRED')
    require(c.get('builder') in {'eduk12-release243','default'} and c.get('buildCacheLimit')=='2gb'
            and c.get('cacheMinAgeHours',0)>=48,'CACHE_POLICY_REFUSED')
    revisions=c.get('oldImageRevisions',[])
    require(len(revisions)<=6 and all(re.fullmatch('[a-f0-9]{8}',x) for x in revisions)
            and not set(revisions)&set(c['protectedRevisions']),'IMAGE_POLICY_REFUSED')
    return c

def cache_plan(c,now=None):
    now=time.time() if now is None else now
    require(DEPLOY.resolve()==DEPLOY and DEPLOY.is_dir(),'DEPLOY_ROOT_SYMLINK_REFUSED')
    result=[]
    for release in sorted(DEPLOY.iterdir()):
        if not re.fullmatch(r'release-(?:[0-9]+|[0-9]{8}-[a-f0-9]{8})',release.name):continue
        p=release/'trivy-cache'
        if not p.exists():continue
        require(not release.is_symlink() and not p.is_symlink(),'CACHE_SYMLINK_REFUSED')
        if release.name.endswith(c.get('observedCurrentRevision',c['protectedRevisions'][0])):continue
        allocated=0;newest=0;count=0
        for directory,dirs,files in os.walk(p,followlinks=False):
            for name in dirs+files:
                x=Path(directory,name);v=x.lstat();count+=1
                require(count<=32 and not x.is_symlink() and v.st_dev==p.stat().st_dev,'CACHE_CONTENT_REFUSED')
                if stat.S_ISDIR(v.st_mode):continue
                require(stat.S_ISREG(v.st_mode) and str(x.relative_to(p)) in CACHE_FILES,'CACHE_CONTENT_REFUSED')
                allocated+=v.st_blocks*512;newest=max(newest,v.st_mtime)
        if newest and now-newest>=c['cacheMinAgeHours']*3600:
            result.append({'path':str(p),'allocatedBytes':allocated,'mtime':newest})
    return result

def protected_refs(c):
    protected={f'eduk12-{role}:{rev}' for rev in [*c['protectedRevisions'],c.get('observedCurrentRevision',c['protectedRevisions'][0])] for role in ROLES}
    current=DEPLOY/'current-release.json'
    if current.exists():
        require(not current.is_symlink(),'RELEASE_RECEIPT_SYMLINK_REFUSED')
        receipt=json.loads(current.read_text());rollback=receipt.get('rollbackSha','')
        require(re.fullmatch('[a-f0-9]{40}',rollback) is not None,'ROLLBACK_RECEIPT_REQUIRED')
        protected.update(f'eduk12-{role}:{rollback[:8]}' for role in ROLES)
        protected.update(receipt.get('images',{}).values())
    roots=['/etc/eduk12-ops','/etc/eduk12-backups','/etc/eduk12-attachments','/etc/eduk12-cos-cleanup',
           '/etc/systemd/system',str(DEPLOY)]
    roots += [str(Path('/opt',name,'current').resolve()) for name in
              ['eduk12-ops','eduk12-backups','eduk12-attachments','eduk12-cos-cleanup']]
    files=[]
    for root in roots:files.extend(Path(root).glob('*'))
    for pattern in ['*/*.json','*/*/*.json']:
        files.extend(p for p in DEPLOY.glob(pattern) if time.time()-p.stat().st_mtime<48*3600)
    for p in files:
        if p.name.startswith(('test_','ci-')) or p.name.endswith(('.test.mjs','.example.json')):continue
        if p.is_file() and not p.is_symlink() and p.suffix in {'.py','.mjs','.cjs','.json','.sh','.env','.service','.yml'} and p.stat().st_size<1024**2:
            value=p.read_text(errors='ignore')
            protected.update(re.findall(r'eduk12-(?:frontend|backend|ops):[a-zA-Z0-9_.-]+',value))
            protected.update(re.findall(r'sha256:[a-f0-9]{64}',value))
    return protected

def eligible_project_image(item,c,now):
    labels=item.get('Config',{}).get('Labels') or {};revision=labels.get('org.opencontainers.image.revision','')
    if labels.get('org.opencontainers.image.source')!='https://github.com/caohuibj/eduK12-new-version' or not re.fullmatch('[a-f0-9]{40}',revision):return False
    tags=item.get('RepoTags') or [];allowed={f'eduk12-{role}:{revision[:8]}' for role in ROLES}
    if not tags or not set(tags)<=allowed:return False
    created=dt.datetime.fromisoformat(re.sub(r'(\.\d{6})\d+',r'\1',item['Created']).replace('Z','+00:00')).timestamp()
    return created<=now-c['cacheMinAgeHours']*3600

def image_plan(c):
    container_ids=command(['docker','ps','-aq']).split();used=set()
    if container_ids:used.update(command(['docker','inspect','--format','{{.Image}}',*container_ids]).split())
    protected=protected_refs(c);candidates=[];seen=set()
    for row in command(['docker','image','ls','--no-trunc','--format','{{.Repository}}:{{.Tag}}|{{.ID}}']).splitlines():
        tag,ident=row.split('|')
        if not re.fullmatch(r'eduk12-(?:frontend|backend|ops):[a-f0-9]{8}',tag) or ident in seen:continue
        seen.add(ident)
        if tag in protected or ident in used or ident in protected:continue
        item=json.loads(command(['docker','image','inspect',ident]))[0]
        if not eligible_project_image(item,c,time.time()) or set(item['RepoTags'])&protected:continue
        for alias in item['RepoTags']:candidates.append({'tag':alias,'id':ident})
    return candidates

def execute(c,images=False):
    before=shutil.disk_usage('/').free
    caches=cache_plan(c);old=image_plan(c)
    plan={'caches':caches,'images':old,'builder':c['builder'],'buildCacheLimit':c['buildCacheLimit']}
    atomic(STATE/'storage-plan.json',{'at':dt.datetime.now(dt.timezone.utc).isoformat(),**plan})
    # Never remove a path mounted by an existing container, including a stopped task.
    ids=command(['docker','ps','-aq']).split()
    mounts=[]
    if ids:
        for line in command(['docker','inspect','--format','{{json .Mounts}}',*ids]).splitlines():
            mounts.extend(m['Source'] for m in json.loads(line) if m.get('Source'))
    for item in caches:
        p=Path(item['path'])
        require(not any(Path(m)==p or p in Path(m).parents or Path(m) in p.parents for m in mounts),'CACHE_MOUNT_IN_USE')
        fresh={x['path']:x for x in cache_plan(c)}
        require(fresh.get(str(p))==item,'CACHE_CHANGED_AFTER_PLAN')
        shutil.rmtree(p)
    # BuildKit excludes in-use records; no volumes or container data are pruned.
    command(['docker','buildx','prune','--builder',c['builder'],'--filter','until=72h',
             '--max-used-space='+c['buildCacheLimit'],'--force'],timeout=300)
    removed=[]
    if images:
        for item in old:
            fresh=image_plan(c)
            require(item in fresh,'IMAGE_CHANGED_AFTER_PLAN')
            command(['docker','image','rm',item['tag']])
            removed.append(item['tag'])
    return {'status':'COMPLETE','removedCaches':[x['path'] for x in caches],'removedImageTags':removed,
            'imageDeletionAutomatic':images,'buildCacheLimit':c['buildCacheLimit'],
            'beforeFreeBytes':before,'afterFreeBytes':shutil.disk_usage('/').free}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');parser.add_argument('--images',action='store_true')
    args=parser.parse_args();os.umask(0o077)
    require(os.geteuid()==0,'ROOT_REQUIRED')
    require(not CONFIG.is_symlink() and CONFIG.stat().st_uid==0 and not CONFIG.stat().st_mode&0o077,'PRIVATE_CONFIG_REQUIRED')
    c=validate(json.loads(CONFIG.read_text()))
    image=command(['docker','inspect','--format','{{.Config.Image}}','eduk12-prod-frontend']).strip()
    require(re.fullmatch('eduk12-frontend:[a-f0-9]{8}',image) is not None,'CURRENT_RELEASE_ID_REQUIRED')
    c['observedCurrentRevision']=image.split(':')[1]
    require(STATE.resolve()==STATE and STATE.is_dir(),'STATE_ROOT_REFUSED')
    with (STATE/'storage.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        locks=[]
        try:
            release_locks=sorted(DEPLOY.glob('*/release.lock'))
            require(len(release_locks)<=32,'RELEASE_LOCK_INVENTORY_LIMIT')
            require(DEPLOY/'scoped-release/release.lock' in release_locks,'ACTIVE_RELEASE_LOCK_REQUIRED')
            for p in [STATE/'deploy.lock',*release_locks,Path('/var/lib/eduk12-backups/backup.lock'),Path('/var/lib/eduk12-attachments/host.lock')]:
                require(not p.is_symlink(),'LOCK_SYMLINK_REFUSED');f=p.open('a');locks.append(f);fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
            result=execute(c,args.images) if args.apply else {'status':'PLAN_ONLY','caches':cache_plan(c),'images':image_plan(c)}
            record={'at':dt.datetime.now(dt.timezone.utc).isoformat(),**result}
            atomic(STATE/'storage-status.json',record)
            audit=STATE/'storage-attempts';audit.mkdir(mode=0o700,exist_ok=True)
            require(not audit.is_symlink(),'AUDIT_ROOT_REFUSED')
            atomic(audit/(uuid.uuid4().hex+'.json'),record)
            for old in sorted(audit.glob('*.json'),key=lambda p:p.stat().st_mtime)[:-30]:
                require(not old.is_symlink() and re.fullmatch('[a-f0-9]{32}\\.json',old.name),'AUDIT_FILE_REFUSED');old.unlink()
            print(json.dumps(result))
        finally:
            for f in locks:f.close()

if __name__=='__main__':
    try:main()
    except BlockingIOError:
        atomic(STATE/'storage-status.json',{'at':dt.datetime.now(dt.timezone.utc).isoformat(),'status':'SKIPPED','reason':'maintenance_lock_held'})
    except Exception as e:
        code=str(e) if re.fullmatch('[A-Z][A-Z0-9_]{2,80}',str(e)) else 'STORAGE_FAILED'
        if STATE.is_dir():atomic(STATE/'storage-status.json',{'at':dt.datetime.now(dt.timezone.utc).isoformat(),'status':'FAILED','error':code})
        raise SystemExit(code)
