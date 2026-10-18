#!/usr/bin/env python3
"""Isolated C03 restore/upgrade/HTTP evidence. Synthetic C02 state only.
Never connects to the source state's live services; copies its fixture keys locally.
Run while holding the shared measurement flock. Every created child is stopped.
"""
import argparse, hashlib, json, os, secrets, signal, socket, subprocess, time, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--tools', type=Path, required=True)
p.add_argument('--source-state', type=Path, required=True)
p.add_argument('--state', type=Path, required=True)
p.add_argument('--dump-sha256', required=True)
a = p.parse_args()
backend = Path(__file__).resolve().parents[2] / 'backend'
node = a.tools.resolve() / 'node_modules/node/bin/node'
pg = a.tools.resolve() / 'postgresql/bin'
source = a.source_state.resolve()
state = a.state.resolve()
dump = source / 'c02-synthetic-upgrade-baseline.dump'
assert hashlib.sha256(dump.read_bytes()).hexdigest() == a.dump_sha256, 'synthetic dump digest mismatch'
state.mkdir(mode=0o700, exist_ok=False)
os.umask(0o077)
children, handles = [], []
result = {'passed': False, 'checks': [], 'sourceDumpSha256': a.dump_sha256}
env = {'PATH': f'{node.parent}:{pg}:/usr/bin:/bin', 'HOME': str(state), 'TMPDIR': str(state), 'LANG': 'C.UTF-8', 'NODE_ENV': 'test'}
def run(cmd, name, extra=None, data=None):
    with (state / (name + '.log')).open('w') as f:
        subprocess.run(list(map(str, cmd)), cwd=backend, env={**env, **(extra or {})}, input=data, text=True, stdout=f, stderr=f, check=True, timeout=240)
def start(cmd, name, extra=None):
    f=(state / (name + '.log')).open('w'); handles.append(f)
    child=subprocess.Popen(list(map(str, cmd)), cwd=backend, env={**env, **(extra or {})}, stdout=f, stderr=f); children.append((name,child)); return child
def port():
    with socket.socket() as s: s.bind(('127.0.0.1',0)); return s.getsockname()[1]
def waitport(n, child):
    until=time.monotonic()+60
    while time.monotonic()<until:
        if child.poll() is not None: raise RuntimeError('service startup failed; private logs retain evidence')
        try:
            with socket.create_connection(('127.0.0.1',n),timeout=1): return
        except OSError: time.sleep(.2)
    raise TimeoutError('service startup')
def stop_signal(signum, frame): raise KeyboardInterrupt
for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]: signal.signal(sig, stop_signal)
try:
    fingerprint_script = Path(__file__).with_name('runtime-fingerprint.cjs')
    def fingerprint(): return json.loads(subprocess.check_output([str(node), str(fingerprint_script), str(backend)], text=True))
    result['runtimeFingerprint'] = fingerprint()
    result['harnessSha256'] = {f.name: hashlib.sha256(f.read_bytes()).hexdigest() for f in [Path(__file__), Path(__file__).with_name('c03-typed-smoke.mjs')]}
    dbport, redisport, apiport = port(), port(), port()
    owner, runtimepass = secrets.token_hex(24), secrets.token_hex(24)
    (state/'pg-password').write_text(owner)
    run([pg/'initdb','-D',state/'pgdata','-U','eduk12_owner','--auth-local=trust','--auth-host=scram-sha-256',f'--pwfile={state / "pg-password"}','--encoding=UTF8','--locale=C.UTF-8'],'initdb')
    db=start([pg/'postgres','-D',state/'pgdata','-h','127.0.0.1','-p',dbport,'-k','', '-c','shared_buffers=128MB','-c','max_connections=40'],'postgres'); waitport(dbport,db)
    psql=[pg/'psql','-X','-q','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',dbport,'-U','eduk12_owner']
    auth={'PGPASSWORD':owner}
    run([*psql,'-d','postgres'],'create',auth,"CREATE DATABASE eduk12_c03;\nCREATE ROLE eduk12_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '"+runtimepass+"';")
    ownerurl=f'postgresql://eduk12_owner:{owner}@127.0.0.1:{dbport}/eduk12_c03'
    runtimeurl=f'postgresql://eduk12_runtime:{runtimepass}@127.0.0.1:{dbport}/eduk12_c03?connection_limit=6'
    run([pg/'pg_restore','--exit-on-error','--no-owner','--no-acl','-h','127.0.0.1','-p',dbport,'-U','eduk12_owner','-d','eduk12_c03',dump],'restore',auth)
    def sql(query):
        return subprocess.check_output(list(map(str,[*psql,'-A','-t','-d','eduk12_c03','-c',query])),env={**env,**auth},text=True).strip()
    assert sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')=='166'
    tables=sql("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename").splitlines()
    def projection():
        out={}
        for table in tables:
            # Subtract only the new nullable column; accepted values, ciphertexts,
            # timestamps, hashes and every other existing column must be identical.
            value="to_jsonb(t) - 'form_definition'" if table=='composite_assessment_items' else 'to_jsonb(t)'
            data=sql(f'SELECT coalesce(jsonb_agg(v ORDER BY v::text), \'[]\'::jsonb)::text FROM (SELECT {value} AS v FROM "{table}" t) x')
            out[table]=hashlib.sha256(data.encode()).hexdigest()
        return out
    before=projection()
    run([node,'node_modules/prisma/build/index.js','migrate','deploy'],'migrate',{'DATABASE_URL':ownerurl})
    assert sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')=='167'
    assert sql('SELECT count(*) FROM composite_assessment_items WHERE form_definition IS NOT NULL')=='0'
    assert projection()==before, 'historical table bytes changed during additive migration'
    result['checks'].append('166→167: all 203 pre-existing table projections unchanged; new column all NULL')
    result['historicalProjectionSha256']=hashlib.sha256(json.dumps(before,sort_keys=True).encode()).hexdigest()
    run([*psql,'-d','eduk12_c03'],'acl-base',auth,'REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO eduk12_runtime;')
    run([*psql,'-d','eduk12_c03','-v','target_database=eduk12_c03','-v','migration_owner=eduk12_owner','-v','runtime_role=eduk12_runtime','-v',f'table_policy={(backend / "scripts/runtime-table-policy.json").read_text()}','-f','scripts/runtime-role-defaults.sql'],'acl',auth)
    keys=['JWT_SECRET','ASSET_SIGNING_SECRET','DATA_ENCRYPTION_KEY','DATA_PSEUDONYM_KEY']
    old=json.loads((source/'runtime-private.json').read_text())
    runtime={k:old[k] for k in keys}
    runtime.update({'DATABASE_URL':runtimeurl,'DATABASE_URL_RUNTIME':runtimeurl,'REDIS_URL':f'redis://127.0.0.1:{redisport}','PORT':str(apiport),'CORS_ORIGIN':'http://127.0.0.1:5173','COOKIE_SECURE':'false','COGNITIVE_MODULE_ENABLED':'true','BACKGROUND_WORKERS_ENABLED':'false','HEAVY_PROCESSING_ENABLED':'false','VIDEO_PROCESSING_ENABLED':'false','ASSESSMENT_REPORT_ASYNC_ENABLED':'true','ASSESSMENT_WHOLE_SUBMIT_ENABLED':'true','UPLOAD_DIR':str(state/'uploads')})
    (state/'runtime-private.json').write_text(json.dumps(runtime)); (state/'fixture-private.json').write_bytes((source/'fixture-private.json').read_bytes())
    run([node,'scripts/runtime-role-contract.mjs','verify-current'],'runtime-role',runtime)
    red=start([a.tools/'redis/bin/redis-server','--bind','127.0.0.1','--port',redisport,'--dir',state,'--save','','--appendonly','no','--maxmemory','128mb','--maxmemory-policy','noeviction'],'redis');waitport(redisport,red)
    api=start([node,'--require',Path(__file__).with_name('loopback-only.cjs'),'dist/index.js'],'api',runtime);waitport(apiport,api)
    worker=start([node,'dist/workers/main.js'],'report-worker',runtime)
    for endpoint in ['health','ready']:
        with urllib.request.urlopen(f'http://127.0.0.1:{apiport}/{endpoint}',timeout=8) as response: assert response.status==200
    (state/'status.json').write_text(json.dumps({'state':'running','apiUrl':f'http://127.0.0.1:{apiport}'}))
    run([node,Path(__file__).with_name('c03-typed-smoke.mjs'),state],'typed-http',runtime)
    result['http']=json.loads((state/'typed-http-result.json').read_text())
    assert fingerprint() == result['runtimeFingerprint'], 'runtime changed during test'
    assert result['harnessSha256'] == {f.name: hashlib.sha256(f.read_bytes()).hexdigest() for f in [Path(__file__), Path(__file__).with_name('c03-typed-smoke.mjs')]}, 'harness changed during test'
    result['passed']=result['http']['passed']
    result['head']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=backend,text=True).strip()
    result['schemaSha256']=hashlib.sha256((backend/'prisma/schema.prisma').read_bytes()).hexdigest()
except BaseException as e:
    result['errorType']=type(e).__name__
    raise
finally:
    for sig in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]: signal.signal(sig,signal.SIG_IGN)
    cleanup=[]
    for name,child in reversed(children):
        if child.poll() is None:
            child.send_signal(signal.SIGINT if name=='postgres' else signal.SIGTERM)
            try: child.wait(timeout=20)
            except subprocess.TimeoutExpired: child.kill(); child.wait(timeout=5)
        cleanup.append({'service':name,'stopped':child.poll() is not None})
    for f in handles: f.close()
    result['cleanup']=cleanup
    (state/'c03-upgrade-result.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result),flush=True)
