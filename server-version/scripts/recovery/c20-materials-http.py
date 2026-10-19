#!/usr/bin/env python3
"""C20 staged, production-dist, real PostgreSQL qualification launcher.

One persistent execution owns every service/client and the measurement lock.
Never wrap this launcher in flock. Only complete matching prior phases may be
reused; failed partial phases require a separately reviewed continuation script.
"""
import argparse
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlparse
sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent; BACKEND = BASE.parents[1] / 'backend'; REPO = BACKEND.parents[1]
def module(name, file):
    spec=importlib.util.spec_from_file_location(name, BASE / file); result=importlib.util.module_from_spec(spec); spec.loader.exec_module(result); return result
m = module('c20_db', 'c20-materials-db.py'); support = module('c20_support', 'c18-study-http.py')
receipts = module('c20_receipts', 'c20-materials-receipts.py')
sha_file, digest, manifest, stopped = m.sha_file, m.digest, support.manifest, support.stopped
FLOOR = 8 * 1024 ** 3
PHASES = ['upgrade', 'main', 'anonymous', 'linked', 'race', 'rollback', 'branches', 'revocation', 'consumers', 'consumer-cost', 'cost', 'guards', 'restore']
COMMON_DB = {'c20-materials-db.py','c19-flow-db.py','c18-study-db.py','c16-analysis-db.py'}
COMMON_HTTP = {'c20-materials-client.mjs','c20-materials-fixture.mjs','loopback-only.cjs'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--source-state', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--expected-head', required=True, help='Explicit frozen full commit; business source must be clean')
    parser.add_argument('--phase', choices=[*PHASES, 'all'], default='main')
    parser.add_argument('--from-state', type=Path, help='Read-only stopped C20 state with complete matching earlier phases')
    parser.add_argument('--continuation-script', help='Reviewed c20-*.mjs phase continuation, never automatic replay')
    parser.add_argument('--continuation-sha256')
    parser.add_argument('--continuation-phase', choices=[p for p in PHASES if p not in ['upgrade','restore']], help='Explicit failed phase filled before proceeding with remaining requested phases')
    parser.add_argument('--expected-prior-runtime-sha256')
    parser.add_argument('--functional-tail', action='store_true', help='Preserve failed efficiency qualification and run only remaining functional assertions and tail phases')
    parser.add_argument('--functional-tail-sha256')
    parser.add_argument('--expected-failed-cost-sha256')
    parser.add_argument('--storage-tail-sha256', help='Exact read-only storage-functional producer SHA after a retained cost-phase failure')
    parser.add_argument('--expected-failed-storage-sha256')
    args = parser.parse_args()
    if args.from_state:
        assert args.expected_prior_runtime_sha256, 'all from-state imports require exact prior receipt SHA'
        assert sha_file(args.from_state/'c20-runtime-result.json') == args.expected_prior_runtime_sha256
    if args.functional_tail:
        assert args.from_state and args.phase=='all' and not args.continuation_script
        assert sha_file(BASE/'c20-materials-consumer-functional-continuation.mjs')==args.functional_tail_sha256
        assert sha_file(args.from_state/'c20-consumer-cost-result.json')==args.expected_failed_cost_sha256
    if args.storage_tail_sha256:
        assert args.functional_tail
        assert sha_file(BASE/'c20-materials-storage-functional-continuation.mjs')==args.storage_tail_sha256
        assert sha_file(args.from_state/'c20-cost-result.json')==args.expected_failed_storage_sha256
    continuation_phase=args.continuation_phase or args.phase
    if args.continuation_phase: assert args.continuation_script
    if args.continuation_script:
        assert args.from_state and continuation_phase not in ['all','upgrade','restore']
        assert args.phase=='all' or PHASES.index(continuation_phase)<=PHASES.index(args.phase)
        assert re.fullmatch(r'c20-[a-z0-9-]+[.]mjs',args.continuation_script)
        assert sha_file(BASE/args.continuation_script)==args.continuation_sha256
        assert sha_file(args.from_state/'c20-runtime-result.json')==args.expected_prior_runtime_sha256
        prior_receipt=json.loads((args.from_state/'c20-runtime-result.json').read_text())
        assert sha_file(args.from_state/'c20-final-db-snapshot.json')==prior_receipt['finalSnapshotSha256']
    requested=PHASES if args.phase=='all' else PHASES[:PHASES.index(args.phase)+1]
    if args.functional_tail: requested=[p if p!='consumer-cost' else 'consumer-functional' for p in requested]
    if args.storage_tail_sha256: requested=[p if p!='cost' else 'storage-functional' for p in requested]
    def phase_file(phase): return 'c20-materials-storage-functional-continuation.mjs' if phase=='storage-functional' else 'c20-materials-consumer-functional-continuation.mjs' if phase=='consumer-functional' else 'c20-materials-'+phase+('.py' if phase in ['upgrade','restore'] else '.mjs')
    consumed_c20={'c20-materials-http.py','c20-materials-db.py','c20-materials-receipts.py'} | {phase_file(phase) for phase in requested}
    if args.continuation_script: consumed_c20.add(args.continuation_script)
    if any(phase not in ['upgrade','restore'] for phase in requested): consumed_c20 |= COMMON_HTTP
    tools, source, state = [p.resolve() for p in [args.tools, args.source_state, args.state]]
    prior = args.from_state.resolve() if args.from_state else None
    assert re.fullmatch(r'[0-9a-f]{40}', args.expected_head)
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip() == args.expected_head
    runtime_needed=any(phase not in ['upgrade','restore'] for phase in requested)
    business = [*(['server-version/backend/src'] if runtime_needed else []),'server-version/backend/prisma','server-version/backend/scripts','server-version/backend/package.json','server-version/backend/package-lock.json','server-version/backend/tsconfig.json']
    assert subprocess.run(['git','diff','--quiet','HEAD','--',*business,':(exclude)**/__tests__/**',':(exclude)**/*.test.ts',':(exclude)**/*.spec.ts'],cwd=REPO).returncode == 0, 'freeze committed business input before running'
    assert not subprocess.check_output(['git','ls-files','--others','--exclude-standard','--',*business,':(exclude)**/__tests__/**',':(exclude)**/*.test.ts',':(exclude)**/*.spec.ts'],cwd=REPO).strip(), 'untracked business input must be frozen'
    assert not state.exists() and state != REPO and REPO not in state.parents
    for root in [source] + ([prior] if prior else []):
        assert root != state and root not in state.parents and state not in root.parents
    assert source != prior
    node, pg, redis = tools/'node_modules/node/bin/node', tools/'postgresql/bin', tools/'redis/bin/redis-server'
    assert subprocess.check_output([node,'--version'],text=True).strip() == 'v24.21.0'
    assert '16.15' in subprocess.check_output([pg/'postgres','--version'],text=True)
    assert 'v=7.4.11 ' in subprocess.check_output([redis,'--version'],text=True)
    if runtime_needed: assert (BACKEND/'dist/index.js').is_file()
    fresh = m.fresh_prisma(BACKEND)
    source_status = stopped(source)
    assert sha_file(source/'c19-runtime-result.json') == m.PINNED_RESULT_SHA256
    source_result = json.loads((source/'c19-runtime-result.json').read_text())
    assert all(source_result.get(k) is True for k in ['passed','cleanupVerified','sourceUnchanged','inputsUnchanged'])
    assert source_result['phases']['restore']['passed'] is True
    dump = source/'c19-new-format-restore/c19-http-new-format.dump'; assert sha_file(dump) == m.PINNED_DUMP_SHA256
    prior_result = None
    if prior:
        stopped(prior); prior_result, prior_producers = receipts.import_receipt(prior, args.expected_prior_runtime_sha256)
        assert all(prior_result.get(k) is True for k in ['cleanupVerified','sourceUnchanged','inputsUnchanged'])
        assert prior_result.get('priorSourceUnchanged',True)
        assert prior_result['pinnedC19DumpSha256'] == m.PINNED_DUMP_SHA256
        if args.functional_tail:
            failed_cost=json.loads((prior/'c20-consumer-cost-result.json').read_text())
            assert failed_cost.get('passed') is False and failed_cost.get('phase')=='consumer-cost'
            assert prior_result.get('failedPhaseResultsSha256',{}).get('consumer-cost')==args.expected_failed_cost_sha256
            assert not prior_result['phases'].get('consumer-cost',{}).get('passed')
            assert all(prior_result['phases'].get(p,{}).get('passed') is True for p in PHASES[:PHASES.index('consumer-cost')])
            assert sha_file(prior/'c20-final-db-snapshot.json')==prior_result['finalSnapshotSha256']
            if args.storage_tail_sha256:
                assert prior_result['phases'].get('consumer-functional',{}).get('passed') is True
                assert prior_result.get('functionalTail',{}).get('failedResultSha256')==args.expected_failed_cost_sha256
                storage_failure=json.loads((prior/'c20-cost-result.json').read_text())
                assert storage_failure.get('phase')=='cost' and storage_failure.get('passed') is False
                assert prior_result.get('failedPhaseResultsSha256',{}).get('cost')==args.expected_failed_storage_sha256
                assert not prior_result['phases'].get('cost',{}).get('passed')
        if args.continuation_script:
            failed_path=prior/f'c20-{continuation_phase}-result.json'
            assert failed_path.is_file(), 'explicit continuation phase has no failed result'
            failed_receipt=json.loads(failed_path.read_text())
            assert failed_receipt.get('phase')==continuation_phase and failed_receipt.get('passed') is False
            assert not prior_result['phases'].get(continuation_phase,{}).get('passed'), 'cannot relabel an accepted phase as failed'
    copy_source = prior or source
    source_runtime = json.loads((copy_source/'runtime-private.json').read_text())
    copy_status = json.loads((copy_source/'status.json').read_text())
    for key, role in [('DATABASE_URL_OWNER','eduk12_owner'),('DATABASE_URL','eduk12_runtime'),('DATABASE_URL_RUNTIME','eduk12_runtime')]:
        u=urlparse(source_runtime[key]); assert u.hostname=='127.0.0.1' and u.username==role and u.path=='/eduk12_recovery' and u.port==copy_status['ports']['postgres'] and u.password
    runtime = {**source_runtime,'BACKGROUND_WORKERS_ENABLED':'false','HEAVY_PROCESSING_ENABLED':'false','VIDEO_PROCESSING_ENABLED':'false','PERF_ISOLATED_TEST_MODE':'1','PERF_SQL_EVENT_COUNT':'1'}
    effective = {**runtime,'REDIS_URL':'redis://127.0.0.1:0','PORT':'0','UPLOAD_DIR':'<private-state>/uploads','EXPORT_DIR':'<private-state>/exports'}
    for key in ['DATABASE_URL_OWNER','DATABASE_URL','DATABASE_URL_RUNTIME']:
        u=urlparse(effective[key]); effective[key]=u._replace(netloc=f'{u.username}:{u.password}@127.0.0.1:0').geturl()
    configuration_hash=digest(effective)
    lock=(tools/'.measurement.lock').open('a'); fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    copy_bytes=sum(p.stat().st_size for directory in ['pgdata','uploads','exports'] for p in (copy_source/directory).rglob('*') if p.is_file())+dump.stat().st_size
    assert shutil.disk_usage(state.parent).free-copy_bytes-512*1024**2>=FLOOR, 'clone reserve crosses 8GiB stop line; no history is deleted'
    os.umask(0o077); state.mkdir(mode=0o700)
    env={'PATH':f'{node.parent}:{pg}:/usr/bin:/bin','HOME':str(state),'TMPDIR':str(state),'TZ':'UTC','LANG':'C.UTF-8','NODE_ENV':'test','PYTHONDONTWRITEBYTECODE':'1'}
    result={'passed':False,'qualificationScope':'C20_FLOW_'+args.phase.upper(),'phases':{},'phaseProducers':{},'reusedPhases':[],'pinnedC19DumpSha256':m.PINNED_DUMP_SHA256,'pinnedC19ResultSha256':m.PINNED_RESULT_SHA256,'sourceHead':source_status['head'],'freshPrisma':fresh,'cloneBytes':copy_bytes}
    if args.functional_tail:
        result['qualificationScope']='C20_FUNCTIONAL_CHECKPOINT_WITH_PRESERVED_EFFICIENCY_FAILURE'
        result['functionalCheckpointPassed']=False
        result['efficiencyQualificationPassed']=False
        result['functionalTail']={'phase':'consumer-functional','file':phase_file('consumer-functional'),'sha256':args.functional_tail_sha256,'priorRuntimeSha256':args.expected_prior_runtime_sha256,'failedPhase':'consumer-cost','failedResultSha256':args.expected_failed_cost_sha256}
    if args.storage_tail_sha256:
        result['functionalTail']={**prior_result['functionalTail'],'reused':True,'evidenceReceiptSha256':args.expected_prior_runtime_sha256}
        result['storageTail']={'phase':'storage-functional','file':phase_file('storage-functional'),'sha256':args.storage_tail_sha256,'priorRuntimeSha256':args.expected_prior_runtime_sha256,'failedPhase':'cost','failedResultSha256':args.expected_failed_storage_sha256}
    if prior: result['acceptedPriorRuntimeSha256']=args.expected_prior_runtime_sha256
    status={'state':'preparing','ports':{},'pids':{},'startedAt':time.time()}
    children, logs=[],[]; pinned=source_manifest=prior_manifest=None
    def record():
        tmp=state/'status.tmp'; tmp.write_text(json.dumps(status,indent=2)); tmp.replace(state/'status.json')
    def binding():
        paths=[*business,'server-version/scripts/recovery']
        tracked=subprocess.check_output(['git','ls-files','-z','--',*paths],cwd=REPO).split(b'\0')
        untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z','--',*paths],cwd=REPO).split(b'\0')
        entries=[]
        for relative in sorted(set(tracked+untracked)-{b''}):
            path=REPO/os.fsdecode(relative)
            if '/__tests__/' in str(path) or path.name.endswith(('.test.ts','.spec.ts')): continue
            if path.name.startswith('c20-') and path.name not in consumed_c20: continue
            assert path.is_file() and not path.is_symlink()
            entries.append({'path':os.fsdecode(relative),'mode':path.stat().st_mode&0o777,'sha256':sha_file(path)})
        fingerprint=json.loads(subprocess.check_output([node,BASE/'runtime-fingerprint.cjs',BACKEND],text=True)) if runtime_needed else {'schemaVersion':1,'scope':'DATABASE_ONLY; PRODUCTION_DIST_NOT_CONSUMED','nodeVersion':'v24.21.0','nodeSha256':sha_file(node)}
        binaries={str(p.relative_to(tools)):sha_file(p) for p in [node,pg/'postgres',pg/'psql',pg/'pg_dump',pg/'pg_restore',redis]}
        db_source=[e for e in entries if '/backend/prisma/' in e['path'] or '/backend/scripts/' in e['path'] or e['path'].endswith(('backend/package.json','backend/package-lock.json')) or Path(e['path']).name in COMMON_DB]
        http_source=[e for e in entries if '/backend/' in e['path'] or Path(e['path']).name in COMMON_DB|COMMON_HTTP]
        client_manifest=digest(manifest(BACKEND/'node_modules/.prisma/client'))
        hashes={}
        for phase in requested:
            script=BASE/phase_file(phase)
            if not script.exists(): continue
            if phase in ['upgrade','restore']:
                inputs={'source':db_source,'client':client_manifest,'tools':{k:v for k,v in binaries.items() if 'redis' not in k}}
            else:
                inputs={'source':http_source,'runtime':fingerprint,'tools':binaries,'config':configuration_hash}
            hashes[phase]=digest({**inputs,'script':sha_file(script)})
        return {'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip(),'sourceInputs':entries,'sourceInputsSha256':digest(entries),'runtimeFingerprint':fingerprint,'toolExecutables':binaries,'generatedClientManifestSha256':digest(manifest(BACKEND/'node_modules/.prisma/client')),'runtimeConfigurationSha256':configuration_hash,'phaseInputHashes':hashes}
    def guard():
        assert shutil.disk_usage(state).free>=FLOOR, 'disk below 8GiB stop line'
        assert next(int(line.split()[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))>=2*1024**3
        for name,p,service in children:
            if service: assert p.poll() is None, f'{name} exited unexpectedly'
        for name,p,service in children:
            if name=='api' and p.poll() is None:
                rss=next(int(line.split()[1])*1024 for line in Path(f'/proc/{p.pid}/status').read_text().splitlines() if line.startswith('VmRSS:'))
                assert rss<1024**3, 'API RSS reached 1GiB stop line'
        if (state/'stop').exists(): raise KeyboardInterrupt
    def start(command,name,extra=None,service=True):
        log=(state/(name+'.log')).open('w'); logs.append(log)
        p=subprocess.Popen(list(map(str,command)),cwd=BACKEND,env={**env,**(extra or {})},stdout=log,stderr=log,start_new_session=True)
        children.append((name,p,service))
        if service: status['pids'][name]=p.pid
        record(); return p
    def run(command,name,extra=None,timeout=600):
        p=start(command,name,extra,False); deadline=time.monotonic()+timeout
        while p.poll() is None:
            guard()
            if time.monotonic()>deadline: raise TimeoutError(name+' exceeded budget; private output retained')
            time.sleep(.2)
        (state/(name+'.exit')).write_text(str(p.returncode)+'\n'); assert p.returncode==0, name+' failed; private log retained'; guard()
    def ready(port,p):
        deadline=time.monotonic()+60
        while time.monotonic()<deadline:
            guard()
            try:
                with socket.create_connection(('127.0.0.1',port),timeout=.3):
                    actual=Path(f'/proc/{p.pid}/exe').resolve(); assert actual in [node.resolve(),(pg/'postgres').resolve(),redis.resolve()]
                    result.setdefault('actualServiceExecutables',{})[str(p.pid)]={'path':str(actual),'sha256':sha_file(actual)}; return
            except OSError: time.sleep(.2)
        raise TimeoutError('60-second readiness budget exceeded')
    def verify():
        assert binding()==pinned, 'frozen source/runtime/tool input changed'
        if 'privateRuntimeFileSha256' in result: assert sha_file(state/'runtime-private.json')==result['privateRuntimeFileSha256']
    def interrupt(_sig,_frame): raise KeyboardInterrupt
    for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]: signal.signal(sig,interrupt)
    try:
        record(); pinned=binding(); result.update({k:v for k,v in pinned.items() if k!='sourceInputs'})
        assert pinned['head']==args.expected_head
        (state/'frozen-inputs.json').write_text(json.dumps(pinned,indent=2))
        source_manifest=manifest(source); result['sourceManifestSha256']=digest(source_manifest)
        (state/'source-byte-manifest-before.json').write_text(json.dumps(source_manifest,indent=2))
        assert all(phase in pinned['phaseInputHashes'] for phase in requested), 'requested phase implementation is not ready'
        if prior:
            prior_manifest=manifest(prior); result['priorManifestSha256']=digest(prior_manifest)
            (state/'prior-byte-manifest-before.json').write_text(json.dumps(prior_manifest,indent=2))
            assert prior_result['sourceManifestSha256']==result['sourceManifestSha256']
            for phase in [*PHASES,'consumer-functional','storage-functional']:
                if phase in requested and prior_result['phases'].get(phase,{}).get('passed'):
                    assert prior_result['phaseInputHashes'][phase]==pinned['phaseInputHashes'][phase], f'accepted {phase} inputs changed; no automatic replay'
                    result['phases'][phase]=prior_result['phases'][phase]; result['reusedPhases'].append(phase)
                    result['phaseProducers'][phase]=prior_producers[phase]
                elif (prior/f'c20-{phase}-result.json').exists() and prior_result['phases'].get(phase,{}).get('passed') is not True:
                    failed=json.loads((prior/f'c20-{phase}-result.json').read_text())
                    assert not failed.get('checks') or (args.continuation_script and phase==continuation_phase) or (args.functional_tail and phase=='consumer-cost') or (args.storage_tail_sha256 and phase=='cost'), 'partial successful phase needs exact reviewed continuation, never rerun'
            assert any(p not in result['reusedPhases'] for p in requested)
            for file in prior.glob('c20-*.json'):
                if file.name not in ['c20-runtime-result.json'] and ('private' in file.name or any(file.name.startswith(f'c20-{phase}-') for phase in result['reusedPhases'])): shutil.copy2(file,state/file.name)
            for journal in prior.glob('c20-*-private.jsonl'): shutil.copy2(journal,state/journal.name)
            if args.functional_tail:
                shutil.copy2(prior/'c20-consumer-cost-result.json',state/'c20-consumer-cost-result.json')
                if args.storage_tail_sha256: shutil.copy2(prior/'c20-cost-result.json',state/'c20-cost-result.json')
                if not args.storage_tail_sha256:
                    shutil.copy2(prior/'frozen-inputs.json',state/'c20-functional-prior-frozen-inputs-private.json')
                    shutil.copy2(prior/'c20-runtime-result.json',state/'c20-functional-prior-runtime-result-private.json')
                else:
                    for name in ['c20-functional-prior-frozen-inputs-private.json','c20-functional-prior-runtime-result-private.json']:
                        assert sha_file(state/name)==sha_file(prior/name), 'preserve original accepted functional producer dependencies'
            if args.continuation_script:
                failed=prior/f'c20-{continuation_phase}-result.json'
                assert failed.is_file();shutil.copy2(failed,state/f'c20-prior-{continuation_phase}-failed-result.json')
        for directory in ['pgdata','uploads','exports']:
            before=manifest(copy_source/directory); shutil.copytree(copy_source/directory,state/directory,copy_function=shutil.copy2)
            assert manifest(state/directory)==before; guard()
        shutil.copy2(dump,state/'c19-pinned.dump')
        for name in ['fixture-private.json','source-c14-http-result.json']:
            shutil.copy2(source/name,state/name)
        reservations=[]
        try:
            for name in ['postgres','redis','api']:
                sock=socket.socket(); sock.bind(('127.0.0.1',0)); reservations.append(sock); status['ports'][name]=sock.getsockname()[1]
        finally:
            for sock in reservations: sock.close()
        dbport,redisport,apiport=[status['ports'][k] for k in ['postgres','redis','api']]
        for key in ['DATABASE_URL_OWNER','DATABASE_URL','DATABASE_URL_RUNTIME']:
            u=urlparse(runtime[key]); runtime[key]=u._replace(netloc=f'{u.username}:{u.password}@127.0.0.1:{dbport}').geturl()
        runtime.update(REDIS_URL=f'redis://127.0.0.1:{redisport}',PORT=str(apiport),UPLOAD_DIR=str(state/'uploads'),EXPORT_DIR=str(state/'exports'))
        assert not any(str(root) in str(v) for root in [source]+([prior] if prior else []) for v in runtime.values())
        (state/'runtime-private.json').write_text(json.dumps(runtime)); result['privateRuntimeFileSha256']=sha_file(state/'runtime-private.json')
        public_runtime={k:v for k,v in runtime.items() if k!='DATABASE_URL_OWNER'}
        pg_process=start([pg/'postgres','-D',state/'pgdata','-h','127.0.0.1','-p',dbport,'-k','','-c','timezone=UTC','-c','shared_buffers=128MB','-c','max_connections=40'],'postgres'); ready(dbport,pg_process)
        status.update(head=pinned['head'],node='v24.21.0',runtimeFingerprint=pinned['runtimeFingerprint']); record()
        db=m.Database(tools,state)
        if prior:
            assert result['reusedPhases']; latest=result['reusedPhases'][-1]
            checkpoint=prior/'c20-final-db-snapshot.json' if args.continuation_script or args.functional_tail else prior/f'c20-{latest}-post-state.json'
            assert db.snapshot()==json.loads(checkpoint.read_text()), 'prior clone differs from frozen stopped checkpoint'
            if args.continuation_script:
                assert continuation_phase not in result['reusedPhases'], 'cannot continue an already accepted phase'
                assert all(p in result['reusedPhases'] for p in requested if PHASES.index(p)<PHASES.index(continuation_phase)), 'continuation requires accepted predecessor phases'
                result['continuation']={'phase':continuation_phase,'file':args.continuation_script,'sha256':args.continuation_sha256,'priorRuntimeSha256':args.expected_prior_runtime_sha256,'priorFailedResultSha256':sha_file(prior/f'c20-{continuation_phase}-result.json')}
        http_started=False
        for phase in requested:
            if phase in result['reusedPhases']: continue
            verify()
            producer_file = args.continuation_script if args.continuation_script and phase==continuation_phase else phase_file(phase)
            producer_argv = ['python3',BASE/producer_file,'--tools',tools,'--state',state] if phase in ['upgrade','restore'] else [node,'--require',BASE/'loopback-only.cjs',BASE/producer_file,state]
            if phase in ['upgrade','restore']:
                status['state']='upgrading' if phase=='upgrade' else 'restoring'; record()
                run(producer_argv,'c20-'+phase,timeout=300)
            else:
                if not http_started:
                    redis_process=start([redis,'--bind','127.0.0.1','--port',redisport,'--dir',state,'--save','','--appendonly','no','--maxmemory','128mb','--maxmemory-policy','noeviction'],'redis'); ready(redisport,redis_process)
                    api=start([node,'--require',BASE/'loopback-only.cjs','dist/index.js'],'api',public_runtime); ready(apiport,api)
                    status['apiUrl']=f'http://127.0.0.1:{apiport}'
                    for endpoint in ['health','ready']:
                        with urllib.request.urlopen(status['apiUrl']+'/'+endpoint,timeout=8) as response: assert response.status==200
                    http_started=True
                status['state']='running'; record()
                run(producer_argv,'c20-'+phase,public_runtime)
                db.original_rows_unchanged(json.loads((state/'c20-original-rows-private.json').read_text()))
                (state/f'c20-{phase}-post-state.json').write_text(json.dumps(db.snapshot(),indent=2))
            result['phases'][phase]=json.loads((state/f'c20-{phase}-result.json').read_text()); assert result['phases'][phase]['passed'] is True
            result['phaseProducers'][phase]=receipts.executed_producer(phase,producer_file,producer_argv,pinned,result['phases'][phase])
            verify(); guard()
        complete=all(result['phases'].get(p,{}).get('passed') is True for p in requested)
        if args.functional_tail:
            assert sha_file(state/'c20-consumer-cost-result.json')==args.expected_failed_cost_sha256
            if args.storage_tail_sha256: assert sha_file(state/'c20-cost-result.json')==args.expected_failed_storage_sha256
            result['functionalCheckpointPassed']=complete
            result['efficiencyQualificationPassed']=False
        result['passed']=complete and not args.functional_tail
    except BaseException as error:
        result['errorType']=type(error).__name__; raise
    finally:
        for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]: signal.signal(sig,signal.SIG_IGN)
        cleanup=[]
        if 'db' in locals():
            try:
                (state/'c20-final-db-snapshot.json').write_text(json.dumps(db.snapshot(),indent=2))
                result['finalSnapshotSha256']=sha_file(state/'c20-final-db-snapshot.json')
            except Exception as error: result['finalSnapshotError']=type(error).__name__
        for name,p,service in reversed(children):
            try:
                if p.poll() is None:
                    os.killpg(p.pid,signal.SIGINT if name=='postgres' else signal.SIGTERM)
                    try: p.wait(timeout=25)
                    except subprocess.TimeoutExpired: os.killpg(p.pid,signal.SIGKILL); p.wait(timeout=5)
            except ProcessLookupError: p.poll()
            except Exception as error: cleanup.append({'service':name,'errorType':type(error).__name__})
        for log in logs: log.close()
        for name,port in status['ports'].items():
            try:
                with socket.create_connection(('127.0.0.1',port),timeout=.2): cleanup.append({'service':name,'errorType':'PortStillOpen'})
            except OSError: pass
        if (state/'pgdata/postmaster.pid').exists(): cleanup.append({'service':'postgres','errorType':'PostmasterPidStillPresent'})
        result['cleanupVerified']=not cleanup and all(p.poll() is not None for _,p,_ in children)
        result['processExits']={name:p.returncode for name,p,_ in children}
        for key,root,expected,prefix in [('sourceUnchanged',source,source_manifest,'source')]+([('priorSourceUnchanged',prior,prior_manifest,'prior')] if prior else []):
            try:
                after=manifest(root); (state/(prefix+'-byte-manifest-after.json')).write_text(json.dumps(after,indent=2))
                result[key]=expected is not None and after==expected and not (root/'pgdata/postmaster.pid').exists()
            except Exception: result[key]=False
        try: result['inputsUnchanged']=pinned is not None and binding()==pinned
        except Exception: result['inputsUnchanged']=False
        isolation=all(result.get(k) is True for k in ['cleanupVerified','sourceUnchanged','inputsUnchanged']) and result.get('priorSourceUnchanged',True)
        result['passed']=result['passed'] and isolation
        if args.functional_tail: result['functionalCheckpointPassed']=result.get('functionalCheckpointPassed',False) and isolation
        status.update(state='stopped',cleanupVerified=result['cleanupVerified'],cleanupErrors=cleanup,endedAt=time.time()); record()
        result['failedPhaseResultsSha256']={}
        for phase in set(requested)|({'consumer-cost'} if args.functional_tail else set())|({'cost'} if args.storage_tail_sha256 else set()):
            failed_file=state/f'c20-{phase}-result.json'
            if failed_file.is_file() and json.loads(failed_file.read_text()).get('passed') is False:
                result['failedPhaseResultsSha256'][phase]=sha_file(failed_file)
        (state/'c20-runtime-result.json').write_text(json.dumps(result,indent=2))
        print(json.dumps({k:result[k] for k in ['passed','cleanupVerified','sourceUnchanged','inputsUnchanged']}),flush=True); lock.close()
        if not isolation: raise RuntimeError('C20 isolation/cleanup/input validation failed')
if __name__=='__main__': main()
