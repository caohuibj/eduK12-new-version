#!/usr/bin/env python3
"""Same-user host admission, before Actions creates service containers.

Installed outside checkout; shared only by lanes on the same physical host.
No credentials, business ports, database state, or production process discovery.
"""
import argparse, contextlib, fcntl, json, os, pathlib, signal, stat, subprocess, sys, time

BUDGET_MIB={'mac-light':2048,'mac-heavy':4096,'win-light':4096,'win-heavy':6144}
RESERVE_MIB={'mac':1536,'win':1024}

def process_stamp(pid):
    try:
        os.kill(pid,0)
        value=subprocess.run(['ps','-p',str(pid),'-o','lstart='],capture_output=True,text=True,check=True).stdout.strip()
        return value or None
    except (ProcessLookupError, subprocess.CalledProcessError): return None

def alive(item):
    return isinstance(item.get('pid'),int) and item.get('stamp') and process_stamp(item['pid'])==item['stamp']

def assert_root(root):
    root=pathlib.Path(root)
    if not root.is_absolute():raise ValueError('Absolute host root required')
    for p in [root,*root.parents]:
        if p.is_symlink():raise ValueError('Host root cannot contain symlinks')
    root.mkdir(mode=0o700,parents=True,exist_ok=True)
    s=root.stat()
    if s.st_uid!=os.getuid() or stat.S_IMODE(s.st_mode)&0o077:raise ValueError('Host root must be owned by this CI user and private')
    return root

@contextlib.contextmanager
def state_lock(root):
    root=assert_root(root)
    path=root/'admission.lock'
    fd=os.open(path,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        if os.fstat(fd).st_uid!=os.getuid():raise ValueError('Foreign host lock owner')
        fcntl.flock(fd,fcntl.LOCK_EX)
        state_path=root/'admission.json'
        if state_path.is_symlink():raise ValueError('Admission state cannot be a symlink')
        state=json.loads(state_path.read_text()) if state_path.exists() else {'version':1,'active':[],'waiting':[]}
        if state.get('version')!=1 or not all(isinstance(state.get(k),list) for k in ['active','waiting']):raise ValueError('Malformed admission state')
        for k in ['active','waiting']:state[k]=[x for x in state[k] if alive(x)]
        yield state
        tmp=root/('admission.'+str(os.getpid())+'.tmp')
        out=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        try:
            with os.fdopen(out,'w')as stream:
                json.dump(state,stream);stream.flush();os.fsync(stream.fileno())
            os.replace(tmp,state_path)
        finally:
            if tmp.exists():tmp.unlink()
    finally:os.close(fd)

def may_start(state,request,capacity_mib,reserve_mib):
    active=state['active']; waiting=state['waiting']
    if any(x['exclusive'] for x in active):return False
    pending=[x for x in waiting if x['exclusive']]
    # Exclusive intent prevents starvation by new PRs, probes, and maintenance.
    if pending:
        return request['id']==pending[0]['id'] and not active
    if request['exclusive']:return not active
    if sum(x['memory_mib'] for x in active)+request['memory_mib']+reserve_mib>capacity_mib:return False
    # At most one heavy lane even if a second listener was registered by mistake.
    if request['lane'].endswith('-heavy') and any(x['lane'].endswith('-heavy') for x in active):return False
    # FIFO among requests that need the same lane; light work may use safe spare capacity.
    return not any(x['lane']==request['lane'] and x['order']<request['order'] for x in waiting)

def acquire(root,request,capacity_mib,reserve_mib,timeout=3000,poll=0.25):
    if request['memory_mib']+reserve_mib>capacity_mib:raise ValueError('Task budget exceeds effective host capacity')
    deadline=time.monotonic()+timeout
    try:
        while True:
            with state_lock(root)as state:
                if any(x['id']==request['id'] for x in state['active']):raise ValueError('Duplicate active job lease')
                if not any(x['id']==request['id'] for x in state['waiting']):state['waiting'].append(request)
                if may_start(state,request,capacity_mib,reserve_mib):
                    state['waiting']=[x for x in state['waiting'] if x['id']!=request['id']]
                    state['active'].append(request);return
            if time.monotonic()>=deadline:raise TimeoutError('Host admission timed out; no service containers were started')
            time.sleep(poll)
    except BaseException:
        with state_lock(root)as state:
            state['waiting']=[x for x in state['waiting'] if x['id']!=request['id']]
        raise

def release(root,job_id):
    with state_lock(root)as state:
        for k in ['active','waiting']:state[k]=[x for x in state[k] if x['id']!=job_id]

def worker_pid():
    pid=os.getppid()
    for _ in range(20):
        fields=subprocess.run(['ps','-p',str(pid),'-o','ppid=','-o','comm='],check=True,capture_output=True,text=True).stdout.strip().split(maxsplit=1)
        if len(fields)!=2:break
        if pathlib.Path(fields[1]).name=='Runner.Worker':return pid
        pid=int(fields[0])
        if pid<=1:break
    raise ValueError('Admission hook requires its actual Runner.Worker ancestor')

def effective_capacity_mib():
    if sys.platform=='darwin':return int(subprocess.check_output(['sysctl','-n','hw.memsize']))//1048576
    total=os.sysconf('SC_PAGE_SIZE')*os.sysconf('SC_PHYS_PAGES')
    for record in pathlib.Path('/proc/self/cgroup').read_text().splitlines():
        ident,controllers,group=record.split(':',2)
        if ident!='0' and 'memory' not in controllers.split(','):continue
        if '..' in group.split('/'):raise ValueError('Invalid cgroup membership')
        base=pathlib.Path('/sys/fs/cgroup') if ident=='0' else pathlib.Path('/sys/fs/cgroup/memory')
        current=base/group.lstrip('/')
        while True:
            limit=current/('memory.max' if ident=='0' else 'memory.limit_in_bytes')
            if limit.exists():
                value=limit.read_text().strip()
                if value!='max':total=min(total,int(value))
            if current==base:break
            current=current.parent
    return total//1048576

def job_identity(lane):
    parts=[os.environ.get(k,'') for k in ['GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_JOB']]
    if not parts[0].isdigit() or not parts[1].isdigit() or not parts[2]:raise ValueError('Exact Actions job identity required')
    # Include runner name because matrix jobs share GITHUB_JOB.
    name=os.environ.get('RUNNER_NAME','')
    if not name:raise ValueError('Runner identity required')
    return '|'.join(parts+[lane,name])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('command',choices=['acquire','release','status']);parser.add_argument('--root',required=True);parser.add_argument('--lane',choices=BUDGET_MIB,required=True);args=parser.parse_args()
    root=assert_root(args.root)
    if args.command=='status':
        with state_lock(root)as state:print(json.dumps(state));return
    key=job_identity(args.lane)
    if args.command=='release':release(root,key);return
    pid=worker_pid();memory=BUDGET_MIB[args.lane]
    resource=os.environ.get('CI_RESOURCE_CLASS','')
    if args.lane=='win-light' and resource=='static':memory=768
    exclusive=resource=='performance'
    if exclusive and args.lane!='win-heavy':raise ValueError('Performance requires Windows heavy lane')
    request={'id':key,'lane':args.lane,'memory_mib':memory,'exclusive':exclusive,'pid':pid,'stamp':process_stamp(pid),'order':time.time_ns()}
    def interrupted(signum,frame):raise InterruptedError('Admission interrupted')
    for signum in [signal.SIGTERM,signal.SIGINT]:signal.signal(signum,interrupted)
    start=time.monotonic();acquire(root,request,effective_capacity_mib(),RESERVE_MIB[args.lane.split('-')[0]])
    print(json.dumps({'admission':'acquired','lane':args.lane,'budget_mib':memory,'exclusive':exclusive,'wait_seconds':round(time.monotonic()-start,3)}))

if __name__=='__main__':main()
