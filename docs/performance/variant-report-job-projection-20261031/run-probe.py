"""Single-use local PostgreSQL query replay; no production or saved dev DB."""
import os,pathlib,secrets,subprocess,socket,json,time
root=pathlib.Path(__file__).resolve().parents[3];back=root/'server-version/backend'
out=pathlib.Path('/workspace/eduk12-b-handoff/variant-job-projection');private=pathlib.Path('/tmp/b-variant-projection-20261031');private.mkdir(mode=0o700,exist_ok=False)
secret=secrets.token_hex(24);envfile=private/'postgres.env';envfile.write_text('POSTGRES_USER=b_variant_owner\nPOSTGRES_DB=b_variant_projection_test\nPOSTGRES_PASSWORD='+secret+'\n');envfile.chmod(0o600)
node='/workspace/eduk12-cloud/tools/node_modules/node/bin/node';env={**os.environ,'PATH':str(pathlib.Path(node).parent)+':'+os.environ['PATH']}
for key in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:env.pop(key,None)
docker=['docker','--host=unix:///var/run/docker.sock'];container='b-variant-projection-20261031';commands=[]
def run(label,args,extra=None):
 t=time.monotonic()
 with (out/(label+'.log')).open('w')as log:p=subprocess.run(args,cwd=back,env={**env,**(extra or {})},stdout=log,stderr=log,timeout=180)
 commands.append({'label':label,'exitCode':p.returncode,'seconds':time.monotonic()-t})
 (out/'pg-execution.json').write_text(json.dumps(commands,indent=2)+'\n')
 if p.returncode:raise RuntimeError(label+' failed; original task log retained')
started=False
try:
 with socket.socket()as sock:sock.bind(('127.0.0.1',55435))
 run('pg-start',docker+['run','-d','--rm','--name',container,'--label','eduk12.task=variant-projection-20261031','--cpus','1','--memory','512m','--pids-limit','128','--tmpfs','/var/lib/postgresql/data:rw,size=256m','--env-file',str(envfile),'-p','127.0.0.1:55435:5432','postgres:16.15-bookworm','-c','shared_buffers=64MB','-c','max_connections=20'])
 started=True
 for _ in range(80):
  if subprocess.run(docker+['exec',container,'pg_isready','-U','b_variant_owner'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('PG readiness deadline')
 url='postgresql://b_variant_owner:'+secret+'@127.0.0.1:55435/b_variant_projection_test?connection_limit=1'
 run('pg-migrate',[node,'node_modules/prisma/build/index.js','migrate','deploy'],{'DATABASE_URL':url})
 # Owner is used only inside this task's disposable fixture/query replay. This
 # does not claim full current runtime-policy provisioning (tracked by PR448).
 run('pg-probe',[node,'--import','tsx',str(pathlib.Path(__file__).with_name('probe.mts'))],{'DATABASE_URL':url,'NODE_ENV':'test','DATA_ENCRYPTION_KEY':secrets.token_hex(32),'PROBE_BACKEND_ROOT':str(back),'PROBE_OUTPUT':str(out/'pg-result.json'),'BASELINE_QUERY':str(out/'baseline-query.json'),'CANDIDATE_QUERY':str(out/'candidate-query.json')})
finally:
 if started:run('pg-stop',docker+['stop','--time','10',container])
