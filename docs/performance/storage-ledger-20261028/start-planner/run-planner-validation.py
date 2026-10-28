import os,pathlib,subprocess,time,json,socket,hashlib
root=pathlib.Path.cwd();out=root.parent/'storage-ledger-evidence';runtime=root.parent/'four-entry-v2-evidence/tooling/root';B=runtime/'usr/lib/postgresql/17/bin';back=root/'server-version/backend';data=out/'pgdata-shared-compact-r2';assert data.exists() and not(data/'postmaster.pid').exists()
env={**os.environ,'LD_LIBRARY_PATH':str(runtime/'usr/lib/x86_64-linux-gnu'),'PGHOST':'127.0.0.1','PGPORT':'55435','PGUSER':'v2_synthetic_owner','TZ':'UTC'}
s=socket.socket();s.bind(('127.0.0.1',55435));s.close();log=open(out/'planner-validation-services.log','w');p=None
try:
 p=subprocess.Popen([str(B/'postgres'),'-D',str(data),'-h','127.0.0.1','-p','55435','-k','','-c','shared_buffers=64MB','-c','max_connections=10','-c','default_transaction_read_only=off'],env=env,stdout=log,stderr=log)
 for i in range(100):
  if subprocess.run([str(B/'pg_isready')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
  time.sleep(.1)
 runenv={**env,'DATABASE_URL':'postgresql://v2_synthetic_runtime@127.0.0.1:55435/storage_lifecycle_shared_compact_test?connection_limit=1','NODE_ENV':'test','PROBE_BACKEND_ROOT':str(back),'AUTHORITY_OUTPUT':str(out/'planner-validation-r1.json')}
 with open(out/'planner-validation-r1.log','w')as f:r=subprocess.run(['node','--import',str(back/'node_modules/tsx/dist/loader.mjs'),str(out/'validate-start-planner.mts')],env=runenv,cwd=back,stdout=f,stderr=f,timeout=90)
 (out/'planner-validation-r1-execution.json').write_text(json.dumps({'exitCode':r.returncode,'source':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'probeSHA256':hashlib.sha256((out/'validate-start-planner.mts').read_bytes()).hexdigest(),'writes':'Only synthetic negative branches, rolled back; no START/FINAL'},indent=2));print('read-only profile exit',r.returncode)
finally:
 if p:
  p.terminate()
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:p.kill();p.wait()
 log.close()
