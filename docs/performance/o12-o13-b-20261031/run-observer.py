"""Own disposable PostgreSQL only; no saved dev DB or production connection."""
import os,pathlib,secrets,socket,subprocess,json,time,hashlib

root=pathlib.Path(__file__).resolve().parents[3]
back=root/'server-version/backend'
run_id=os.environ.get('B_OBSERVER_RUN','authority-r2')
assert run_id in ['authority-r2']
out=pathlib.Path('/workspace/eduk12-b-handoff')/run_id;out.mkdir(parents=True,exist_ok=False)
private=pathlib.Path('/tmp/eduk12-b-authority-20261031-'+run_id);private.mkdir(mode=0o700,exist_ok=False)
password=secrets.token_hex(24)
secretfile=private/'postgres.env'
secretfile.write_text('POSTGRES_PASSWORD='+password+'\nPOSTGRES_USER=b_o13_owner\nPOSTGRES_DB=b_o13_authority_test\n');secretfile.chmod(0o600)
node='/workspace/eduk12-cloud/tools/node_modules/node/bin/node'
env={**os.environ,'PATH':str(pathlib.Path(node).parent)+':'+os.environ['PATH']}
for selector in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:env.pop(selector,None)
docker=['docker','--host=unix:///var/run/docker.sock']
container='eduk12-b-o13-authority-20261031'
result={'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'scope':'Bounded synthetic diagnostic only','commands':[],'completed':False}
def run(label,args,extra=None,stdin=None,timeout=180):
 start=time.monotonic()
 with (out/(label+'.log')).open('w')as f:
  p=subprocess.run(args,cwd=back,env={**env,**(extra or {})},input=stdin,text=True,stdout=f,stderr=f,timeout=timeout)
 result['commands'].append({'label':label,'exitCode':p.returncode,'wallSeconds':time.monotonic()-start})
 (out/'execution.json').write_text(json.dumps(result,indent=2)+'\n')
 if p.returncode:raise RuntimeError('Task command failed: '+label+' (private/task log retained)')
def sql(label,text):
 run(label,docker+['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','b_o13_owner','-d','b_o13_authority_test'],stdin=text)
started=False
try:
 with socket.socket()as s:s.bind(('127.0.0.1',55434))
 run('postgres-start',docker+['run','-d','--rm','--name',container,'--label','eduk12.task=b-o13-20261031','--cpus','1','--memory','512m','--pids-limit','128','--tmpfs','/var/lib/postgresql/data:rw,size=256m','--env-file',str(secretfile),'-p','127.0.0.1:55434:5432','sha256:345c8087a592','-c','shared_buffers=64MB','-c','max_connections=20','-c','jit=off'])
 started=True
 for _ in range(80):
  if subprocess.run(docker+['exec',container,'pg_isready','-U','b_o13_owner'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('Local isolated PostgreSQL did not become ready')
 owner='postgresql://b_o13_owner:'+password+'@127.0.0.1:55434/b_o13_authority_test'
 result['prismaGenerate']='Reused successful R1 generation; schema and tool unchanged'
 run('migrate',[node,'node_modules/prisma/build/index.js','migrate','deploy'],{'DATABASE_URL':owner})
 sql('catalog',"SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname;")
 sql('runtime-role',"CREATE ROLE b_o13_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '"+password+"'; REVOKE CREATE ON DATABASE b_o13_authority_test FROM PUBLIC; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT CONNECT ON DATABASE b_o13_authority_test TO b_o13_runtime; GRANT USAGE ON SCHEMA public TO b_o13_runtime;")
 # Standard existing role provisioning, applied only inside this disposable DB.
 text="\\set target_database b_o13_authority_test\n\\set migration_owner b_o13_owner\n\\set runtime_role b_o13_runtime\n\\set table_policy '"+(back/'scripts/runtime-table-policy.json').read_text().replace("'","''").replace('\n','')+"'\n"+(back/'scripts/runtime-role-defaults.sql').read_text()
 sql('runtime-acl',text)
 runtime='postgresql://b_o13_runtime:'+password+'@127.0.0.1:55434/b_o13_authority_test?connection_limit=1&pool_timeout=10'
 base={'DATABASE_URL':runtime,'NODE_ENV':'test','TZ':'UTC','JWT_SECRET':secrets.token_hex(32),'DATA_ENCRYPTION_KEY':secrets.token_hex(32),'DATA_PSEUDONYM_KEY':secrets.token_hex(32),'CAMPUS_ELIGIBILITY_HMAC_KEY':secrets.token_hex(32),'BACKGROUND_WORKERS_ENABLED':'false','ASSESSMENT_COMPACT_FACTS_ENABLED':'false','ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED':'false','ASSESSMENT_SHARED_CONTROL_ENABLED':'false','PROBE_BACKEND_ROOT':str(back),'PERF_ISOLATED_TEST_MODE':'1'}
 script=root/'docs/performance/o12-o13-b-20261031/observe-authority.mts'
 run('artifact-policy',[node,'--import','tsx',str(script.parent/'probe-runtime-artifact.mts')],{**base,'OBSERVER_OUTPUT':str(out/'artifact-policy.json')})
 run('seed',[node,'--import','tsx',str(script)],{**base,'OBSERVER_MODE':'seed','OBSERVER_OUTPUT':str(out/'seed.json')})
 run('read',[node,'--import','tsx',str(script)],{**base,'OBSERVER_MODE':'read','OBSERVER_OUTPUT':str(out/'read.json'),'FIXTURE_INPUT':str(out/'seed.json')})
 result['completed']=True
finally:
 if started:
  run('postgres-stop',docker+['stop','--time','10',container],timeout=30)
 result['cleanup']='Task-only disposable container stopped' if started else 'Container start not confirmed'
 (out/'execution.json').write_text(json.dumps(result,indent=2)+'\n')
