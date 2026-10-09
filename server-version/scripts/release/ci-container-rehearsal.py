"""Actual Compose adapter rehearsal; only generated containers/loopback data."""
import hashlib,json,os,socket,subprocess,tempfile,time,uuid,urllib.request
from pathlib import Path
from evidence import digest,record
from executor import Compose,Release,configuration_fingerprint

def run(*args):return subprocess.check_output(args,text=True,timeout=180)
def main():
    assert os.environ.get('CI')=='true' and os.environ.get('GITHUB_ACTIONS')=='true'
    started=time.monotonic();project='eduk12-release-test-'+uuid.uuid4().hex
    with tempfile.TemporaryDirectory(prefix=project) as temp:
        root=Path(temp);(root/'state').mkdir()
        with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
        images={}
        for version in ['old','new']:
            context=root/version;context.mkdir()
            (context/'server.cjs').write_text("require('http').createServer((q,r)=>{r.end('"+version+"')}).listen(8080,'0.0.0.0')")
            (context/'Dockerfile').write_text('FROM node:24.21.0-bookworm-slim\nCOPY server.cjs /server.cjs\nCMD ["node","/server.cjs"]\n')
            tag=project+':'+version;run('docker','build','-q','-t',tag,str(context));images[version]=run('docker','image','inspect','--format','{{.Id}}',tag).strip()
        base=root/'compose.json';base.write_text(json.dumps({'services':{'frontend':{'image':images['old'],'ports':[f'127.0.0.1:{port}:8080'],'labels':{'eduk12.release-test':project}},'backend':{'image':images['old'],'labels':{'eduk12.release-test':project}}}}))
        entry=root/'entry.sh';entry.write_text('#!/bin/sh\nset -eu\nif [ -f "$EDUK12_RELEASE_OVERLAY" ]; then\n exec docker compose -p '+project+' -f '+str(base)+' -f "$EDUK12_RELEASE_OVERLAY" "$@"\nelse\n exec docker compose -p '+project+' -f '+str(base)+' "$@"\nfi\n');entry.chmod(0o700)
        cfg={'entry':str(entry),'project':project,'environment':'isolated','baseHead':'0'*40,'baseImages':{'frontend':images['old'],'backend':images['old']},'oldReady':'old','samples':3,'sampleInterval':.1};adapter=Compose(cfg,root/'state')
        run('docker','compose','-p',project,'-f',str(base),'up','-d','--no-build')
        def probe():
            with urllib.request.urlopen(f'http://127.0.0.1:{port}',timeout=2) as r:return r.read().decode()
        for _ in range(30):
            try:
                if probe()=='old':break
            except Exception:pass
            time.sleep(.1)
        backend=run('docker','compose','-p',project,'-f',str(base),'ps','-q','backend').strip();configuration=configuration_fingerprint(adapter.current(),['frontend'])
        p={'schema':1,'route':'A','base':'0'*40,'head':'1'*40,'changed':['frontend'],'components':{c:{'base':'a'*64,'candidate':'b'*64 if c=='frontend' else 'a'*64} for c in ['frontend','backend']},'tools':{k:'c'*64 for k in ['policy','browser','executor','scan','build','frontendChecks','backendChecks']},'surfaces':['home'],'changes':[{'file':'server-version/frontend/src/training/training-workspace-refresh.css'}],'required':['policy','frontend-checks','frontend-scan','frontend-browser','compatibility','rollback','readiness']}
        receipt={'head':p['head'],'environment':'candidate','images':{'frontend':images['new']},'ready':'new'};receipt['records']=[record(p,k,receipt['images'],configuration,'compose-rehearsal') for k in p['required']]
        results=[]
        try:
            a=Release(adapter,probe,lambda:True).apply(root/'attempts',p,receipt,cfg);results.append(json.loads((a/'result.json').read_text())['status'])
            adapter.switch({'frontend':images['old']})
            # Image overlays do not change unrelated configuration; retain the
            # original applicable receipt across a failed attempt and retry.
            assert configuration==configuration_fingerprint(adapter.current(),['frontend'])
            try:Release(adapter,probe,lambda:False).apply(root/'attempts',p,receipt,cfg)
            except ValueError:pass
            assert probe()=='old'
            statuses=[json.loads(f.read_text())['status'] for f in (root/'attempts').glob('*/result.json')];assert 'ROLLED_BACK' in statuses
            a=Release(adapter,probe,lambda:True).apply(root/'attempts',p,receipt,cfg);results.append(json.loads((a/'result.json').read_text())['status'])
            assert run('docker','compose','-p',project,'-f',str(base),'ps','-q','backend').strip()==backend
            assert len(list((root/'attempts').glob('*/configuration-checkpoint.json')))==3
            print(json.dumps({'status':'PASS','actualCompose':True,'applicationSuccess':len(results),'rollback':True,'retry':True,'unchangedBackendContainer':True,'attempts':3,'seconds':round(time.monotonic()-started,3)}))
        finally:
            for cid in run('docker','compose','-p',project,'-f',str(base),'ps','-q').split():
                info=json.loads(run('docker','inspect',cid))[0];assert info['Config']['Labels']['eduk12.release-test']==project
            run('docker','compose','-p',project,'-f',str(base),'down','--volumes')
            for i in images.values():run('docker','image','rm',i)
if __name__=='__main__':main()
