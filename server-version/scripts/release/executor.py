"""Compose-entry adapter. No SSH, automatic production enablement, DB or DR commands.
A/B only. C retains the existing full data/infra runbook. Every attempt is durable.
"""
import argparse, copy, fcntl, hashlib, json, os, re, subprocess, time, uuid
import urllib.error, urllib.request
from pathlib import Path
from urllib.parse import urljoin, urlparse
from evidence import compatibility, require, validate, record, digest

def atomic(path, data):
    tmp=path.with_name('.'+path.name+'.'+uuid.uuid4().hex)
    with tmp.open('x') as f:
        os.chmod(tmp,0o600);json.dump(data,f,indent=2);f.flush();os.fsync(f.fileno())
    os.replace(tmp,path)

def configuration_fingerprint(config, changed):
    stable=copy.deepcopy(config)
    selected=set(changed)|({'worker'} if 'backend' in changed else set())
    # Component images are bound separately. Their planned switch must not
    # invalidate unchanged Compose configuration or a safe rollback retry.
    for component in selected:
        stable['services'][component].pop('image',None)
        stable['services'][component].pop('pull_policy',None)
    return digest(stable)

def attempt(root):
    # Never reuse a fixed backup/output name or overwrite a prior attempt.
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    p=root/(time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+uuid.uuid4().hex)
    p.mkdir(mode=0o700);return p

def wait_ready(probe, expected, timeout=60, interval=2, clock=time.monotonic, sleep=time.sleep):
    deadline=clock()+timeout; history=[]
    while True:
        try:
            value=probe();ok=value==expected
            history.append({'at':clock(),'result':'match' if ok else 'version/content mismatch'})
            if ok:return history
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            history.append({'at':clock(),'result':type(e).__name__})
        if clock()>=deadline:raise TimeoutError('Readiness deadline exceeded; '+json.dumps(history))
        sleep(min(interval,max(0,deadline-clock())))

class Compose:
    def __init__(self, config, directory):
        self.config=config;self.directory=directory;self.overlay=directory/'images.json'
        require(Path(config['entry']).is_absolute() and Path(config['entry']).is_file(), 'Actual Compose entry required')
        require(config['project'] == 'eduk12-prod' if config['environment']=='production' else config['project'].startswith('eduk12-release-test-'), 'Wrong project')
    def run(self,*args):
        env=os.environ.copy();env['EDUK12_RELEASE_OVERLAY']=str(self.overlay)
        # The existing entry is the only supported ingress to the live project.
        # It must support this reviewed opt-in overlay; old entry refuses preflight.
        return subprocess.check_output([self.config['entry'],*args],env=env,timeout=180,text=True)
    def info(self):
        return json.loads(self.run('ps','--format','json'))
    def current(self):
        config=json.loads(self.run('config','--format','json'))
        require(config.get('name')==self.config['project'],'Compose project mismatch')
        for c in ['frontend','backend','worker']:
            if c in config['services']:
                image=config['services'][c]['image']
                config['services'][c]['image']=subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',image],text=True).strip()
        return config
    def switch(self,images):
        overlay=json.loads(self.overlay.read_text()) if self.overlay.exists() else {'services':{}}
        require(set(overlay)=={'services'} and all(set(v)<= {'image','pull_policy'} for v in overlay['services'].values()),'Unexpected overlay configuration')
        overlay['services'].update({c:{'image':v,'pull_policy':'never'} for c,v in images.items()})
        atomic(self.overlay,overlay)
        self.run('up','-d','--no-build','--no-deps',*images)
    def verify_images(self,expected):
        config=self.current()
        for c,i in expected.items():
            cid=self.run('ps','-q',c).strip();require(bool(cid),'Missing '+c)
            actual=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]
            require(actual['Image']==i and actual['State']['Running'] and not actual['State'].get('OOMKilled'),'Wrong running '+c)
            require(config['services'][c]['image']==i,'Wrong configured '+c)

class Release:
    def __init__(self,adapter,probe,flow,clock=time.monotonic,sleep=time.sleep):
        self.adapter=adapter;self.probe=probe;self.flow=flow;self.clock=clock;self.sleep=sleep
    def apply(self,root,plan,receipt,config):
        compatibility(plan)
        require(config['baseHead']==plan['base'],'Live base moved')
        require(receipt['head']==plan['head'],'Candidate moved')
        require(receipt['environment']=='candidate','CI/candidate evidence required')
        before=self.adapter.current();changed=plan['changed']
        configuration=configuration_fingerprint(before,changed)
        images=receipt['images'];initial=[x for x in plan['required'] if x != 'readiness']
        validate(plan,receipt['records'],images,configuration,required=initial)
        require(changed and set(changed)<=set(images),'Missing component image')
        target={c:images[c] for c in changed}
        if 'backend' in target:target['worker']=target['backend']
        # Repeating an already completed immutable target makes no new switch.
        for result_file in sorted(root.glob('*/result.json'),reverse=True):
            result=json.loads(result_file.read_text())
            if result.get('status')=='APPLICATION_COMPLETE' and result.get('head')==plan['head'] and result.get('images')==target and all(before['services'][c]['image']==v for c,v in target.items()):
                self.adapter.verify_images(target);require(self.probe()==receipt['ready'],'Completed target is no longer ready')
                return result_file.parent
        require(all(before['services'][c]['image']==v for c,v in config['baseImages'].items()),'Live rollback base images changed')
        old={c:before['services'][c]['image'] for c in changed}
        require(all(v.startswith('sha256:') for v in old.values()),'Immutable rollback image required')
        if 'backend' in changed:old['worker']=before['services']['worker']['image']
        require(all(v.startswith('sha256:') for v in old.values()),'Immutable worker rollback image required')
        self.adapter.verify_images(old)
        a=attempt(root);events=[]
        def event(stage,**kw):
            events.append({'stage':stage,'at':time.time(),**kw});atomic(a/'events.json',events)
        atomic(a/'rollback.json',old);atomic(a/'input.json',{'head':plan['head'],'configuration':configuration,'target':target})
        # A/B need no new DB backup. Existing timers and verified retention remain
        # independent. This exclusive diagnostic checkpoint never claims DR.
        with (a/'configuration-checkpoint.json').open('x') as f:json.dump({'hash':configuration},f)
        event('start',route=plan['route'])
        try:
            event('switch');self.adapter.switch(target)
            history=wait_ready(self.probe,receipt['ready'],clock=self.clock,sleep=self.sleep)
            self.adapter.verify_images(target);require(self.flow(),'Affected flow failed')
            # Short observation is bounded and checks version and critical flow.
            for _ in range(config.get('samples',3)):
                self.sleep(config.get('sampleInterval',2));require(self.probe()==receipt['ready'],'Readiness regressed');self.adapter.verify_images(target)
            event('application-complete',readinessAttempts=len(history))
            atomic(a/'result.json',{'status':'APPLICATION_COMPLETE','head':plan['head'],'images':target,'drStatus':'INDEPENDENT_NOT_CLAIMED','attempt':a.name})
            return a
        except Exception as error:
            event('rollback-start',reason=type(error).__name__)
            try:
                self.adapter.switch(old);wait_ready(self.probe,config['oldReady'],clock=self.clock,sleep=self.sleep);self.adapter.verify_images(old)
                event('rolled-back');atomic(a/'result.json',{'status':'ROLLED_BACK','head':plan['head'],'reason':str(error),'attempt':a.name})
            except Exception as rollback_error:
                event('rollback-failed');atomic(a/'result.json',{'status':'NEEDS_INTERVENTION','reason':str(rollback_error),'attempt':a.name})
                raise RuntimeError('Rollback failed; intervention required') from rollback_error
            raise

def main():
    p=argparse.ArgumentParser();p.add_argument('--config',required=True);p.add_argument('--plan',required=True);p.add_argument('--receipt',required=True);p.add_argument('--apply',action='store_true');p.add_argument('--archive');args=p.parse_args()
    cfg=json.loads(Path(args.config).read_text());plan=json.loads(Path(args.plan).read_text());receipt=json.loads(Path(args.receipt).read_text())
    compatibility(plan)
    require(cfg['environment'] in ['isolated','production'],'Explicit environment required')
    require(cfg.get('overlayProtocol')==1,'Compose entry must adopt reviewed overlay protocol first')
    if not args.apply:print(json.dumps({'route':plan['route'],'components':plan['changed'],'requires':plan['required'],'mutated':False}));return
    require(cfg['environment']=='isolated' or cfg.get('productionApproval') is True,'Separate production enablement required')
    require(args.archive is not None,'Official immutable Actions archive required')
    require(set(cfg['baseImages'])>={'frontend','backend','worker'},'Verified base component IDs required')
    from qualify import qualify
    origin=receipt['origin']
    expected=qualify(plan,cfg,Path(args.archive),origin['artifactId'],origin['runId'])
    require(expected==receipt,'Caller evidence differs from authenticated CI package')
    actual=json.loads(subprocess.check_output(['node',str(Path(__file__).with_name('policy.mjs')),plan['base'],plan['head']],text=True))
    require(actual==plan,'Plan differs from complete actual Git diff')
    # Hash-pinned entry prevents stale/mismatched wrapper adoption.
    require(hashlib.sha256(Path(cfg['entry']).read_bytes()).hexdigest()==cfg['entrySha256'],'Entry changed')
    root=Path(cfg['state']);root.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (root/'release.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        adapter=Compose(cfg,root)
        def get(url):
            require(urlparse(url).scheme=='https' or (cfg['environment']=='isolated' and urlparse(url).hostname in ['localhost','127.0.0.1','training.localhost']) or urlparse(url).hostname in ['localhost','127.0.0.1'],'TLS required for public production probes')
            return urllib.request.urlopen(url,timeout=8)
        def probe():
            if 'backend' in plan['changed']:
                with get(cfg['backendReadyUrl']) as r:require(r.status==200,'Backend not ready')
            with get(cfg['url']) as r:return {'html':hashlib.sha256(r.read()).hexdigest(),'csp':r.headers.get('Content-Security-Policy')}
        def flow():
            # Deploy-time confirmation consumes the qualified artifact. It does
            # not rerun browser/WCAG/responsive or authenticated lifecycles.
            if 'frontend' in plan['changed']:
                with get(cfg['url']) as r:html=r.read().decode()
                assets=re.findall(r'(?:src|href)="(/assets/[^"?]+\.(?:js|css))"',html)
                require(assets,'Qualified assets missing')
                with get(urljoin(cfg['url'],assets[0])) as r:require(r.status==200 and len(r.read())>0,'Static asset unavailable')
            if 'backend' in plan['changed']:
                try:
                    with get(cfg['authProbeUrl']) as r:return False
                except urllib.error.HTTPError as e:require(e.code==401,'Anonymous identity boundary changed')
            return True
        print(Release(adapter,probe,flow).apply(root,plan,receipt,cfg))
if __name__=='__main__':main()
