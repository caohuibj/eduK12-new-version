"""Build/scan consumers: labelled ephemeral containers, never production data."""
import json,os,socket,subprocess,time,uuid,urllib.request
from pathlib import Path

def run(*args,**kw):return subprocess.check_output(args,text=True,timeout=600,**kw)
def port():
    with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def wait(url):
    for _ in range(60):
        try:
            with urllib.request.urlopen(url,timeout=3) as r:
                if r.status==200:return
        except Exception:pass
        time.sleep(1)
    raise RuntimeError('Candidate readiness failed')
def main():
    assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('CI')=='true'
    plan=json.loads(Path('release-plan.json').read_text());assert plan['route'] in ['A','B']
    p='eduk12-release-test-'+uuid.uuid4().hex;containers=[];network=p+'-net';root=Path.cwd();evidence=root/'release-evidence';evidence.mkdir(exist_ok=True)
    run('docker','network','create','--label','eduk12.release-test='+p,network)
    def start(name,image,*args,env=None,command=None):
        name=p+'-'+name;cmd=['docker','run','-d','--label','eduk12.release-test='+p,'--name',name,'--network',network]
        if env:
            for k,v in env.items():cmd+=['-e',k+'='+v]
        cmd+=list(args);cmd+=[image];cmd+=command or [];run(*cmd);containers.append(name);return name
    try:
        if 'backend' in plan['changed']:
            db=start('postgres','postgres:16.15-bookworm','--network-alias','postgres',env={'POSTGRES_USER':'release','POSTGRES_DB':'release','POSTGRES_PASSWORD':'synthetic-release-password'})
            redis=start('redis','redis:7.4.9-alpine','--network-alias','redis')
            for _ in range(60):
                try:run('docker','exec',db,'pg_isready','-h','127.0.0.1','-U','release');break
                except subprocess.CalledProcessError:time.sleep(1)
            hp=port()
            env={'DATABASE_URL':'postgresql://release:synthetic-release-password@postgres:5432/release?schema=public','REDIS_URL':'redis://redis:6379','JWT_SECRET':'synthetic-release-secret-0123456789012345','DATA_ENCRYPTION_KEY':'01'*32,'DATA_PSEUDONYM_KEY':'02'*32,'ASSET_SIGNING_SECRET':'synthetic-release-assets-0123456789012345','ASSET_MIGRATION_COMPLETE':'true','COGNITIVE_MODULE_ENABLED':'true','COOKIE_SECURE':'true','CORS_ORIGIN':f'http://localhost:{hp}','FRONTEND_URL':f'http://localhost:{hp}','TRUST_PROXY':'1'}
            # Existing unchanged migrations only initialize a synthetic database;
            # no migration or seed command enters the production A/B executor.
            ops='eduk12-release-ops:'+plan['head']
            run('docker','run','--rm','--network',network,*sum((['-e',k+'='+v] for k,v in env.items()),[]),ops,'npx','prisma','migrate','deploy')
            seed="const{PrismaClient}=require('@prisma/client'),bcrypt=require('bcrypt');const p=new PrismaClient();(async()=>{for(const role of ['STUDENT','TEACHER'])await p.user.create({data:{username:'release-'+role.toLowerCase(),passwordHash:await bcrypt.hash('Release-synthetic-2026',10),nickname:role,role,isActive:true,teacherApproved:true}})})().finally(()=>p.$disconnect())"
            run('docker','run','--rm','--network',network,*sum((['-e',k+'='+v] for k,v in env.items()),[]),ops,'node','-e',seed)
            start('backend','eduk12-release-backend:'+plan['head'],'--network-alias','backend','-p',f'127.0.0.1:{hp}:3000',env=env);wait(f'http://localhost:{hp}/ready')
            benv=os.environ.copy();benv.update(RELEASE_SYNTHETIC_FIXTURE='1',RELEASE_SYNTHETIC_PASSWORD='Release-synthetic-2026',RELEASE_EVIDENCE=str(evidence))
            run('node','server-version/scripts/release/browser.cjs','--login',f'http://localhost:{hp}',env=benv)
            (evidence/'browser.json').rename(evidence/'login-browser.json')
        else:
            # A has no permission/API change: backend fixture only for Nginx DNS;
            # public browser requests use real frontend bundle, no DB or writes.
            name=start('backend','node:24.21.0-bookworm-slim','--network-alias','backend','-v',str(root/'server-version/scripts/release/fixture-server.cjs')+':/fixture.cjs:ro',command=['node','/fixture.cjs'])
        if 'frontend' in plan['changed']:
            hp=port();start('frontend','eduk12-release-frontend:'+plan['head'],'-p',f'127.0.0.1:{hp}:80');wait(f'http://localhost:{hp}/')
            with urllib.request.urlopen(f'http://localhost:{hp}/',timeout=8) as r:
                import hashlib
                Path('candidate-ready.json').write_text(json.dumps({'html':hashlib.sha256(r.read()).hexdigest(),'csp':r.headers.get('Content-Security-Policy')}))
            env=os.environ.copy();env.update(RELEASE_EVIDENCE=str(evidence),RELEASE_SURFACES=json.dumps(plan['surfaces']))
            run('node','server-version/scripts/release/browser.cjs','--candidate',f'http://training.localhost:{hp}',env=env)
            (evidence/'browser.json').rename(evidence/'frontend-browser.json')
        selected=['login-browser'] if plan['route']=='B' else []
        if 'frontend' in plan['changed']:selected.append('frontend-browser')
        assert selected and all(json.loads((evidence/(k+'.json')).read_text())['status']=='success' for k in selected)
        (evidence/'browser.json').write_text(json.dumps({'status':'success','selected':selected}))
    finally:
        for name in reversed(containers):
            labels=json.loads(run('docker','inspect',name))[0]['Config']['Labels'];assert labels.get('eduk12.release-test')==p
            run('docker','rm','-f','-v',name)
        run('docker','network','rm',network)
if __name__=='__main__':main()
