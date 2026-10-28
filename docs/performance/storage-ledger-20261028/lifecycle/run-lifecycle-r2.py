import os,pathlib,subprocess,time,json,hashlib,secrets,socket,sys
mode=sys.argv[1];assert mode in ['legacy','shared-compact'];tag=mode+'-r2'
root=pathlib.Path.cwd();out=root.parent/'storage-ledger-evidence';runtime=root.parent/'four-entry-v2-evidence/tooling/root';B=runtime/'usr/lib/postgresql/17/bin';back=root/'server-version/backend';env={**os.environ,'LD_LIBRARY_PATH':str(runtime/'usr/lib/x86_64-linux-gnu'),'PGHOST':'127.0.0.1','PGPORT':'55433','PGUSER':'v2_synthetic_owner','TZ':'UTC'}
for port in [55433,56380]:
 s=socket.socket();s.bind(('127.0.0.1',port));s.close()
data=out/('pgdata-'+tag);assert not data.exists(),'Do not overwrite earlier data';log=open(out/(tag+'-services.log'),'w');processes=[]
try:
 subprocess.run([str(B/'initdb'),'-D',str(data),'-A','trust','-U',env['PGUSER'],'--no-locale','-E','UTF8','-L',str(runtime/'usr/share/postgresql/17')],env=env,stdout=log,stderr=log,check=True)
 processes.append(subprocess.Popen([str(B/'postgres'),'-D',str(data),'-h','127.0.0.1','-p','55433','-k','','-c','shared_buffers=64MB','-c','max_connections=20','-c','jit=off'],env=env,stdout=log,stderr=log))
 processes.append(subprocess.Popen([str(runtime/'usr/bin/redis-server'),'--bind','127.0.0.1','--port','56380','--save','','--appendonly','no','--maxmemory','64mb'],env=env,stdout=log,stderr=log))
 for i in range(100):
  if subprocess.run([str(B/'pg_isready')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
  time.sleep(.1)
 name='storage_lifecycle_'+mode.replace('-','_')+'_test';subprocess.run([str(B/'createdb'),name],env=env,check=True)
 url='postgresql://v2_synthetic_owner@127.0.0.1:55433/'+name
 with open(out/(tag+'-migrate.log'),'w')as f:subprocess.run(['./node_modules/.bin/prisma','migrate','deploy'],cwd=back,env={**env,'DATABASE_URL':url},stdout=f,stderr=f,check=True,timeout=180)
 def sql(text):subprocess.run([str(B/'psql'),'-X','-v','ON_ERROR_STOP=1','-d',name],input=text,text=True,env=env,stdout=log,stderr=log,check=True)
 sql(f"CREATE ROLE v2_synthetic_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; REVOKE CREATE ON DATABASE {name} FROM PUBLIC; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT CONNECT ON DATABASE {name} TO v2_synthetic_runtime; GRANT USAGE ON SCHEMA public TO v2_synthetic_runtime;")
 subprocess.run([str(B/'psql'),'-X','-v','ON_ERROR_STOP=1','-d',name,'-v','target_database='+name,'-v','migration_owner=v2_synthetic_owner','-v','runtime_role=v2_synthetic_runtime','-v','table_policy='+(back/'scripts/runtime-table-policy.json').read_text(),'-f',str(back/'scripts/runtime-role-defaults.sql')],env=env,stdout=log,stderr=log,check=True)
 runenv={**env,'DATABASE_URL':'postgresql://v2_synthetic_runtime@127.0.0.1:55433/'+name,'REDIS_URL':'redis://127.0.0.1:56380/2','NODE_ENV':'test','SURVEY_GOVERNANCE_PROBE_ACK':'owned-local-synthetic-only','PROBE_BACKEND_ROOT':str(back),'TRAINING_PROBE_OUTPUT':str(out/'training-whole-probe.json'),'JWT_SECRET':secrets.token_hex(32),'DATA_ENCRYPTION_KEY':secrets.token_hex(32),'DATA_PSEUDONYM_KEY':secrets.token_hex(32),'BACKGROUND_WORKERS_ENABLED':'false','ASSESSMENT_REPORT_ASYNC_ENABLED':'true','ASSESSMENT_WHOLE_SUBMIT_ENABLED':'true','ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED':'true','ASSESSMENT_WHOLE_ATOMIC_RECEIPT_ENABLED':'true','ASSESSMENT_REPORT_MAX_ATTEMPTS':'1','ASSESSMENT_REPORT_ASYNC_COURSE_IDS':'','ASSESSMENT_REPORT_LEASE_MS':'30000','PERF_ISOLATED_TEST_MODE':'1','PERF_SQL_EVENT_COUNT':'1'}
 runenv['RELEASE_INTEGRATION_DATABASE_URL']=runenv['DATABASE_URL'];runenv['RELEASE_VERIFY_LOCAL']='true'
 runenv.update({'LEDGER_MODE':mode,'LEDGER_OUTPUT':str(out/(tag+'.json'))})
 for key in ['ASSESSMENT_COMPACT_FACTS_ENABLED','ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED','ASSESSMENT_SHARED_CONTROL_ENABLED']:runenv[key]='true' if mode=='shared-compact' else 'false'
 runenv['CAMPUS_ELIGIBILITY_HMAC_KEY']=secrets.token_hex(32)
 t=time.monotonic()
 with open(out/(tag+'.log'),'w')as f:r=subprocess.run(['node','--import',str(back/'node_modules/tsx/dist/loader.mjs'),str(out/'measure-lifecycle.mts')],cwd=back,env=runenv,stdout=f,stderr=f,timeout=420)
 (out/(tag+'-execution.json')).write_text(json.dumps({'exitCode':r.returncode,'seconds':time.monotonic()-t,'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'postgres':'17.11','redis':'8.0.2','node':subprocess.check_output(['node','--version'],text=True).strip(),'scope':'Actual synthetic Teacher SELF START/FINAL/report storage lifecycle; sequential mode comparison, not CI or browser','mode':mode,'probeSHA256':hashlib.sha256((out/'measure-lifecycle.mts').read_bytes()).hexdigest()},indent=2));print('probe exit',r.returncode)
finally:
 for p in reversed(processes):
  p.terminate()
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:p.kill();p.wait()
 log.close()
