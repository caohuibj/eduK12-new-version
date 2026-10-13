"""Root launcher for a read-only inventory; credentials only travel through stdin."""
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import uuid
STATE=Path('/var/lib/eduk12-ops')
CODE=Path('/opt/eduk12-ops/current')
def atomic(path,value):
    if path.is_symlink():raise RuntimeError('STATE_SYMLINK_REFUSED')
    temp=path.with_name('.inventory-'+uuid.uuid4().hex)
    try:
        with temp.open('x') as f:
            os.chmod(temp,0o600);json.dump(value,f);f.write('\n');f.flush();os.fsync(f.fileno())
        temp.replace(path)
    finally:temp.unlink(missing_ok=True)
def main():
    if os.geteuid()!=0 or STATE.resolve()!=STATE:raise RuntimeError('ROOT_PRIVATE_STATE_REQUIRED')
    os.umask(0o077)
    with (STATE/'cos-inventory.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        item=json.loads(subprocess.run(['docker','inspect','eduk12-prod-backend'],capture_output=True,check=True,timeout=30).stdout)[0]
        env=dict(v.split('=',1) for v in item['Config']['Env'] if '=' in v)
        if env.get('COS_BUCKET')!='ptool-videos-edu-1393949445' or env.get('COS_REGION')!='ap-beijing':raise RuntimeError('BUCKET_BINDING_CHANGED')
        credentials={k:env[k] for k in ['COS_SECRET_ID','COS_SECRET_KEY','COS_SECURITY_TOKEN'] if env.get(k)}
        ident=uuid.uuid4().hex;name='eduk12-cos-inventory-'+ident
        args=['docker','run','--rm','-i','--name',name,'--label','eduk12.cos-inventory-task='+ident,
              '--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
              '--memory','192m','--cpus','0.2','--pids-limit','32','--tmpfs','/tmp:size=16m,noexec,nosuid',
              '--mount','type=bind,src='+str(CODE.resolve())+',dst=/ops,readonly',
              '--entrypoint','node',item['Image'],'/ops/cos-inventory.cjs']
        try:
            result=subprocess.run(args,input=json.dumps({'credentials':credentials}),text=True,capture_output=True,timeout=900)
            if result.returncode:raise RuntimeError('COS_INVENTORY_FAILED')
            output=json.loads(result.stdout)
            if output.get('mode')!='read_only' or output.get('status')!='COMPLETE':raise RuntimeError('INVENTORY_RESULT_INVALID')
            previous=STATE/'cos-capacity.json'
            old=json.loads(previous.read_text()) if previous.exists() else None
            if old:
                prior={b['bucket']:b['currentBytes'] for b in old['buckets']}
                output['previousAt']=old['at']
                for b in output['buckets']:b['growthBytes']=b['currentBytes']-prior[b['bucket']]
            atomic(previous,output)
            atomic(STATE/'cos-inventory-status.json',{'at':output['at'],'status':'COMPLETE'})
            print(json.dumps({k:v for k,v in output.items() if k!='buckets'}))
        finally:
            found=subprocess.run(['docker','inspect','--format','{{json .Config.Labels}}',name],capture_output=True,text=True,timeout=30)
            if not found.returncode:
                if json.loads(found.stdout).get('eduk12.cos-inventory-task')!=ident:raise RuntimeError('TASK_OWNERSHIP_MISMATCH')
                subprocess.run(['docker','rm','--force',name],capture_output=True,check=True,timeout=30)
if __name__=='__main__':
    try:main()
    except BlockingIOError:pass
    except Exception as e:
        code=str(e) if re.fullmatch('[A-Z][A-Z0-9_]{2,80}',str(e)) else 'COS_INVENTORY_FAILED'
        if STATE.is_dir():atomic(STATE/'cos-inventory-status.json',{'at':dt.datetime.now(dt.timezone.utc).isoformat(),'status':'FAILED','error':code})
        raise SystemExit(code)
