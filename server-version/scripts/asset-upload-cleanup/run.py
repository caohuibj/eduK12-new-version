"""Bounded pending-upload cleanup using only the current production backend."""
import datetime, fcntl, json, os, pathlib, re, signal, subprocess, sys, uuid
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
STATE = pathlib.Path('/var/lib/eduk12-asset-upload-cleanup')
BACKEND = 'eduk12-prod-backend'

def execute_cleanup(current, peer, run=subprocess.run):
    image = current.get('Image', '')
    if (current.get('Name') != '/' + BACKEND or not current.get('State', {}).get('Running')
        or not re.fullmatch(r'sha256:[a-f0-9]{64}', image) or peer.get('Image') != image):
        return {'status': 'SKIPPED', 'reason': 'BACKEND_NOT_READY_OR_MIXED'}
    # A compatible old-image rollback must pause this maintenance task safely.
    available = run(['docker','exec',BACKEND,'test','-f','/app/dist/scripts/asset-upload-cleanup.js'], capture_output=True, timeout=10)
    if available.returncode: return {'status':'SKIPPED','reason':'COMPATIBLE_ROLLBACK_WITHOUT_CLEANUP_CLI'}
    networks = list(current['NetworkSettings']['Networks'])
    if not networks or not re.fullmatch(r'[A-Za-z0-9_.-]{1,100}', networks[0]): raise ValueError('NETWORK_REFUSED')
    environment = dict(v.split('=',1) for v in current['Config']['Env'] if '=' in v)
    if environment.get('DATABASE_URL'):
        url=urlsplit(environment['DATABASE_URL']);query=dict(parse_qsl(url.query));query.update(connection_limit='1',pool_timeout='2');environment['DATABASE_URL']=urlunsplit(url._replace(query=urlencode(query)))
    name = 'eduk12-upload-cleanup-' + uuid.uuid4().hex[:16]
    args = ['docker','run','--rm','-i','--name',name,'--network',networks[0],'--read-only','--cap-drop=ALL',
        '--security-opt','no-new-privileges','--cpus=0.1','--memory=128m','--pids-limit=64',
        '--tmpfs','/tmp:size=16m,noexec,nosuid','--entrypoint','node',image,'/app/dist/scripts/asset-upload-cleanup.js','--run']
    try:
        result = run(args, input=json.dumps({'environment':environment}), text=True, capture_output=True, timeout=75)
        if result.returncode or len(result.stdout)>8192: raise RuntimeError('CLEANUP_RUN_FAILED')
        result = json.loads(result.stdout.strip().splitlines()[-1])
        if (result.get('status') != 'SUCCESS' or not all(type(result.get(k)) is int and 0<=result[k]<=4 for k in ['selected','cleaned','pending'])
            or result['cleaned']+result['pending'] != result['selected']): raise RuntimeError('CLEANUP_RESULT_REFUSED')
        return result
    finally:
        run(['docker','rm','-f',name], capture_output=True, timeout=10)

def main():
    os.umask(0o077)
    if sys.argv[1:] != ['--run'] or os.geteuid() != 0: raise RuntimeError('ROOT_COMMAND_REQUIRED')
    STATE.mkdir(mode=0o700,parents=True,exist_ok=True)
    if STATE.is_symlink() or STATE.stat().st_uid or STATE.stat().st_mode & 0o077: raise RuntimeError('PRIVATE_STATE_REQUIRED')
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(RuntimeError('CLEANUP_INTERRUPTED')))
    with (STATE/'run.lock').open('a') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: return 0
        try:
            inspected = json.loads(subprocess.check_output(['docker','inspect',BACKEND,'eduk12-prod-backend-2'],text=True,timeout=10))
            result = execute_cleanup(inspected[0],inspected[1])
        except Exception: result = {'status':'FAILED','error':'PENDING_UPLOAD_CLEANUP_FAILED'}
        result['at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        temporary=STATE/'.status.new';temporary.write_text(json.dumps(result)+'\n');temporary.chmod(0o600);temporary.replace(STATE/'status.json')
        print(json.dumps(result));return int(result['status']=='FAILED')
if __name__=='__main__':
    sys.exit(main())
