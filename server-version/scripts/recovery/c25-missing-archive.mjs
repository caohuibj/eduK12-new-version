/** New stopped 6651-row recovery point; original archives and false receipts stay. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {ARCHIVE_PYTHON as originalArchivePython} from './c25-continuation-archive.mjs'
export const pythonProgram=`A={'__name__':'c25_original_archive_library'}\nexec(compile(${JSON.stringify(originalArchivePython)},'c25-continuation-archive.mjs','exec'),A)\n`+String.raw`
import argparse, fcntl, hashlib, importlib.util, json, os, re, shutil, signal, socket, stat, subprocess, sys, time, traceback
from pathlib import Path
sys.dont_write_bytecode=True
for name in ['sha_file','canonical','private_directory','file_binding','inventory','nondata_manifest','frozen_failure_manifest','data_manifests','data_projection','ResourceGuard','recovery_budget','bounded','fsync_directory','fsync_tree','sync_json','sync_bytes','archive_members']:
    globals()[name]=A[name]
ROOT=A['ROOT'];REPO=A['REPO'];BASE=A['BASE'];SOURCE=A['SOURCE'];DATA_DIRS=A['DATA_DIRS']
PRIOR=ROOT/'eduk12_c25_continuation_01';OUTPUT=Path('/tmp/c25-missing-recovery-01');PRODUCER=BASE/'c25-missing-archive.mjs'
PRIOR_RECEIPT='16293c2c79b377c36fe665e260d8f45c43941df89d003e7be993925905a50f08'
PRIOR_SNAPSHOT='cae493b8a6d6c62a34a9d181822d22cd927fa5c1081666cd8fb049cefa91d1cf'
SCOPE='C25_MISSING_ONLY_6651_ROW_NODE_LOCAL_TEMPORARY_RECOVERY_NOT_DURABLE_BACKUP'
NAMES={'archive':'c25-missing-data.tar.gz','dataManifest':'data-manifest.json','fullFailureManifest':'http01-full-manifest.json','frozenFailureManifest':'http01-nondata-manifest.json','priorContinuationManifest':'continuation01-manifest.json','historicalRecoveryManifest':'historical-recovery-manifest.json','archiveReceipt':'archive-receipt.json','restoreInstructions':'RESTORE.txt','descriptor':'c25-missing-recovery-descriptor.json'}
ENV={'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC','PYTHONDONTWRITEBYTECODE':'1'}
def producer_binding(tools,head):
    original=A['producer_binding'](tools,head)
    node=Path(tools)/'node_modules/node/bin/node'
    code="import {createHash} from 'node:crypto';import {pythonProgram} from "+json.dumps(PRODUCER.as_uri())+";process.stdout.write(createHash('sha256').update(pythonProgram).digest('hex'))"
    inline=subprocess.check_output([node,'--input-type=module','-e',code],text=True,timeout=10,env=ENV)
    assert re.fullmatch('[a-f0-9]{64}',inline)
    result={'head':head,'originalArchiveLibrary':original,'entry':file_binding(PRODUCER),'inlinePythonSha256':inline}
    assert A['producer_binding'](tools,head)==original and file_binding(PRODUCER)==result['entry']
    return result

def validate_prior_facts(receipt,snapshot,audit):
    assert receipt['passed'] is False and receipt['scope']=='C25_EXPLICIT_CONTINUATION_INHERITED_UPGRADE_A_NOT_A_FRESH_RUN_OR_CAPACITY'
    assert receipt['executedPhases']==['continuation-prepare'] and set(receipt['phases'])=={'continuation-prepare'}
    assert receipt['phases']['continuation-prepare']['passed'] is True
    for key in ['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified','failureEvidenceUnchanged','recoveryArchiveVerified','failedRowsPreserved']:assert receipt[key] is True
    assert receipt['finalSnapshotSha256']==PRIOR_SNAPSHOT
    assert len(snapshot['columns'])==217 and sum(v['rows'] for v in snapshot['projection'].values())==6651
    assert snapshot['projection']['training_attempt_checkpoints']['rows']==20
    assert audit['passed'] is True and audit['mode']=='final' and audit['snapshotSha256']==PRIOR_SNAPSHOT
    assert audit['continuationRetainedFacts']['allFailedRowsRetained'] is True and audit['continuationRetainedFacts']['oldRows']==6582
    assert audit['retainedFacts']['allOriginalRowsRetained'] is True and audit['retainedFacts']['oldRows']==6529
    assert receipt['processExits']['c25-scheduled']==1
    assert all(code==0 for name,code in receipt['processExits'].items() if name!='c25-scheduled')

def validate_failure():
    original=A['validate_failure'](SOURCE)
    private_directory(PRIOR)
    names=['c25-continuation-result.json','c25-continuation-final-db-snapshot.json','c25-continuation-audit-final-result.json','status.json','frozen-inputs.json','runtime-private.json','c25-fixture-private.json','c25-scheduled-result.json','c25-continuation-protected-rows-private.json']
    files={name:file_binding(PRIOR/name) for name in names}
    assert files[names[0]]['sha256']==PRIOR_RECEIPT and files[names[1]]['sha256']==PRIOR_SNAPSHOT
    values=[json.loads((PRIOR/name).read_text()) for name in names[:3]];validate_prior_facts(*values)
    receipt=values[0]
    assert files['runtime-private.json']['sha256']==receipt['privateRuntimeFileSha256']
    assert files['frozen-inputs.json']['sha256']==receipt['frozenInputsSha256']
    assert receipt['auditProducers']['c25-continuation-audit-final']['resultSha256']==files[names[2]]['sha256']
    assert json.loads((PRIOR/'c25-scheduled-result.json').read_text())['passed'] is False
    return {'http01':original,'continuation01':files}

def stopped_current(tools):
    original=A['stopped_failure'](SOURCE,tools)
    status=json.loads((PRIOR/'status.json').read_text())
    assert status['state']=='stopped' and status['cleanupVerified'] is True and status['cleanupErrors']==[]
    assert set(status['pids'])==set(status['ports'])=={'postgres','redis','api'}
    for pid in status['pids'].values():assert type(pid) is int and pid>1 and not Path('/proc',str(pid)).exists()
    for port in status['ports'].values():
        assert type(port) is int and 0<port<65536
        with socket.socket() as sock:sock.settimeout(.2);assert sock.connect_ex(('127.0.0.1',port))!=0
    return {**original,'priorStatusSha256':sha_file(PRIOR/'status.json'),'priorProcessesAndPortsStopped':True}

def historical_recovery_manifest():
    return {str(folder):inventory(folder) for folder in [Path('/tmp/c25-source-05'),Path('/tmp/c25-continuation-recovery-01')]}

def output_path(path,descriptor):
    path=canonical(path);assert path==OUTPUT and not os.path.lexists(path)
    source,_=A['helpers']();source.destination_path(path,protected=[PRIOR,ROOT/'eduk12_tools_20261018',ROOT/'eduk12_c21_http_01',ROOT/'eduk12_c23_http_03',ROOT/'c25-build-evidence',Path(descriptor).parent,Path('/tmp/c25-source-05'),Path('/tmp/c25-continuation-recovery-01')])
    assert path.parent.stat().st_dev!=SOURCE.stat().st_dev
    mounts=[line.split() for line in Path('/proc/self/mountinfo').read_text().splitlines()];matches=[row for row in mounts if row[4]=='/tmp']
    assert matches and matches[-1][matches[-1].index('-')+1]=='tmpfs'
    return path

def restore_instructions():
    return A['restore_instructions']()+'This archive contains the stopped 6651-row/20-checkpoint state after continuation01.\nBoth original false receipts and continuation01 evidence are immutable and must remain in place.\n'

def verify_recovery_descriptor(descriptor_path,expected_sha,tools,failure_state,expected_head,check_data=True):
    assert type(check_data) is bool and canonical(failure_state)==SOURCE
    target=canonical(descriptor_path);assert target==OUTPUT/NAMES['descriptor'];private_directory(OUTPUT)
    assert not (OUTPUT/'archive-failure-private.json').exists() and not (OUTPUT/'archive-failure-private.log').exists()
    binding=file_binding(target);assert binding['sha256']==expected_sha and binding['mode']==0o600
    value=json.loads(target.read_text())
    assert value['schemaVersion']==2 and value['scope']==SCOPE and value['sourceRoot']==str(SOURCE)
    assert value['priorContinuationRoot']==str(PRIOR) and value['sourceOverallPassed'] is False
    assert value['observedTables']==217 and value['observedRows']==6651 and value['observedCheckpoints']==20
    assert value['allowedMutableRoots']==list(DATA_DIRS) and value['priorReceiptSha256']==PRIOR_RECEIPT and value['priorSnapshotSha256']==PRIOR_SNAPSHOT
    assert value['head']==expected_head and value['producer']==producer_binding(tools,expected_head)
    assert value['failureFiles']==validate_failure()
    assert file_binding(Path(value['http03Descriptor']['path']))==value['http03Descriptor']
    names=set(NAMES)-{'archive','descriptor'};assert set(value['files'])==names
    for name,item in value['files'].items():assert item==file_binding(OUTPUT/NAMES[name]) and item['mode']==0o600
    assert value['archive']==file_binding(OUTPUT/NAMES['archive']) and value['archive']['bytes']<=A['ARCHIVE_CAP'] and value['archive']['mode']==0o600
    read=lambda name:json.loads((OUTPUT/NAMES[name]).read_text())
    data,full,frozen,prior,historical,receipt=[read(n) for n in ['dataManifest','fullFailureManifest','frozenFailureManifest','priorContinuationManifest','historicalRecoveryManifest','archiveReceipt']]
    assert data_projection(full)==data and [row for row in full if not A['mutable_path'](row['path'])]==frozen
    assert nondata_manifest(SOURCE)==frozen and inventory(PRIOR)==prior and historical_recovery_manifest()==historical
    assert receipt['passed'] is True and receipt['scope']==SCOPE and receipt['archive']==value['archive'] and receipt['producer']==value['producer']
    for key in ['roundTripVerified','sourceUnchangedDuringArchive','nonDataEvidencePreserved','rawSourceRetained','restoreMaterialFsynced']:assert value[key] is True and receipt[key] is True
    for key in ['servicesStarted','durableBackup']:assert value[key] is False and receipt[key] is False
    assert receipt['symlinkCount']==0 and receipt['hardlinkGroups']==[]
    assert receipt['manifestSha256']==value['files']['dataManifest']['sha256']
    assert (OUTPUT/NAMES['restoreInstructions']).read_text()==restore_instructions()
    if check_data:assert data_manifests(SOURCE)==data and stopped_current(tools)==value['stoppedEvidence']
    assert file_binding(target)==binding
    return value

def main():
    parser=argparse.ArgumentParser()
    for name in ['tools','output','descriptor']:parser.add_argument('--'+name,type=Path,required=True)
    for name in ['expected-head','expected-descriptor-sha256','expected-producer-sha256','expected-inline-sha256','expected-python-sha256']:parser.add_argument('--'+name,required=True)
    args=parser.parse_args();os.umask(0o077);tools=canonical(args.tools)
    assert tools==ROOT/'eduk12_tools_20261018' and sha_file(Path(sys.executable).resolve())==args.expected_python_sha256
    assert file_binding(PRODUCER)['sha256']==args.expected_producer_sha256
    output=output_path(args.output,args.descriptor)
    with (tools/'.measurement.lock').open('rb') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);guard=ResourceGuard();steps=[];started=time.monotonic();created=False
        result={'scope':SCOPE,'passed':False,'servicesStarted':False,'durableBackup':False,'rawSourceRetained':True}
        def interrupted(signum,_frame):raise TimeoutError(guard.error or ('archive signal '+str(signum)))
        previous={sig:signal.signal(sig,interrupted) for sig in [signal.SIGALRM,signal.SIGTERM,signal.SIGINT,signal.SIGHUP]};signal.setitimer(signal.ITIMER_REAL,600)
        try:
            guard.start();assert guard.check()['workspaceFreeBytes']>=A['FLOOR']+A['RESERVE']
            producer=producer_binding(tools,args.expected_head);assert producer['inlinePythonSha256']==args.expected_inline_sha256
            source,_=A['helpers']();source.validate_descriptor(args.descriptor,args.expected_descriptor_sha256,tools/'postgresql/bin/pg_controldata');http03=file_binding(args.descriptor)
            failures=validate_failure();stopped=stopped_current(tools)
            full,data=frozen_failure_manifest(SOURCE),data_manifests(SOURCE);assert data_projection(full)==data
            frozen=nondata_manifest(SOURCE);assert [r for r in full if not A['mutable_path'](r['path'])]==frozen
            prior,historical=inventory(PRIOR),historical_recovery_manifest();budget=recovery_budget(data,guard.check())
            output.mkdir(mode=0o700);created=True;fsync_directory(output.parent)
            for name,value in [('fullFailureManifest',full),('dataManifest',data),('frozenFailureManifest',frozen),('priorContinuationManifest',prior),('historicalRecoveryManifest',historical)]:sync_json(output/NAMES[name],value)
            sync_bytes(output/NAMES['restoreInstructions'],restore_instructions().encode())
            partial=output/'archive.part';archive=output/NAMES['archive'];restore=output/'verification-restore'
            def run(argv,name,seconds):
                step=bounded(argv,output/(name+'.log'),seconds,guard.check);steps.append(step);return step
            run(['/usr/bin/tar','--format=pax','--acls','--xattrs','--xattrs-include=*','--numeric-owner','--atime-preserve=system','-I','/usr/bin/gzip -6 -n','-cf',partial,'-C',SOURCE,*DATA_DIRS],'archive',300)
            assert file_binding(partial)['bytes']<=A['ARCHIVE_CAP']
            fd=os.open(partial,os.O_RDONLY|os.O_NOFOLLOW)
            try:os.fsync(fd)
            finally:os.close(fd)
            compressed_sha=sha_file(partial);run(['/usr/bin/gzip','-t',partial],'gzip-integrity',60);archive_members(partial,data,guard.check)
            restore.mkdir(mode=0o700);run(['/usr/bin/tar','--acls','--xattrs','--xattrs-include=*','--same-owner','--same-permissions','-xzf',partial,'-C',restore],'roundtrip-extract',180)
            fsync_tree(restore);assert data_manifests(restore)==data
            run([tools/'postgresql/bin/pg_controldata','-D',restore/'pgdata'],'restored-controldata',10)
            assert sha_file(output/'restored-controldata.log')==stopped['pgControldataSha256']
            assert frozen_failure_manifest(SOURCE)==full and data_manifests(SOURCE)==data
            assert inventory(PRIOR)==prior and historical_recovery_manifest()==historical
            assert validate_failure()==failures and stopped_current(tools)==stopped
            source.validate_descriptor(args.descriptor,args.expected_descriptor_sha256,tools/'postgresql/bin/pg_controldata')
            assert file_binding(args.descriptor)==http03 and producer_binding(tools,args.expected_head)==producer and sha_file(partial)==compressed_sha
            guard.check();assert restore.parent==output and restore.name=='verification-restore' and private_directory(output)==output
            shutil.rmtree(restore);fsync_directory(output);assert not archive.exists();os.rename(partial,archive);fsync_directory(output)
            archive_binding=file_binding(archive)
            result.update(passed=True,roundTripVerified=True,sourceUnchangedDuringArchive=True,nonDataEvidencePreserved=True,restoreMaterialFsynced=True,temporaryVerificationCopyRemoved=True,archive=archive_binding,manifestSha256=sha_file(output/NAMES['dataManifest']),symlinkCount=0,hardlinkGroups=[],producer=producer,budget=budget,steps=steps,elapsedSeconds=time.monotonic()-started,minimumObserved=guard.minimum,comparedMetadata=['path','type','mode','uid','gid','mtime_ns','size','SHA256','all xattrs and ACLs','zero links'])
            sync_json(output/NAMES['archiveReceipt'],result);fsync_directory(output)
            value={'schemaVersion':2,'scope':SCOPE,'sourceRoot':str(SOURCE),'priorContinuationRoot':str(PRIOR),'sourceOverallPassed':False,'observedTables':217,'observedRows':6651,'observedCheckpoints':20,'allowedMutableRoots':list(DATA_DIRS),'priorReceiptSha256':PRIOR_RECEIPT,'priorSnapshotSha256':PRIOR_SNAPSHOT,'head':args.expected_head,'producer':producer,'failureFiles':failures,'http03Descriptor':http03,'stoppedEvidence':stopped,'archive':archive_binding,'files':{name:file_binding(output/NAMES[name]) for name in set(NAMES)-{'archive','descriptor'}},**{name:result[name] for name in ['roundTripVerified','sourceUnchangedDuringArchive','nonDataEvidencePreserved','rawSourceRetained','restoreMaterialFsynced','servicesStarted','durableBackup']}}
            guard.check();sync_json(output/NAMES['descriptor'],value);fsync_directory(output)
            print(json.dumps({'passed':True,'descriptorPath':str(output/NAMES['descriptor']),'descriptorSha256':sha_file(output/NAMES['descriptor']),'archiveSha256':archive_binding['sha256']}),flush=True)
        except BaseException as error:
            for sig in previous:signal.signal(sig,signal.SIG_IGN)
            signal.setitimer(signal.ITIMER_REAL,0);guard.stop()
            if created and (output/NAMES['descriptor']).exists():os.rename(output/NAMES['descriptor'],output/'descriptor-unpublished.json')
            result.update(passed=False,errorType=type(error).__name__,error=str(error),steps=steps,minimumObserved=guard.minimum,elapsedSeconds=time.monotonic()-started)
            if created:sync_json(output/'archive-failure-private.json',result);sync_bytes(output/'archive-failure-private.log',traceback.format_exc().encode());fsync_directory(output)
            raise
        finally:
            for sig in previous:signal.signal(sig,signal.SIG_IGN)
            signal.setitimer(signal.ITIMER_REAL,0);guard.stop()
            for sig,handler in previous.items():signal.signal(sig,handler)
            fcntl.flock(lock,fcntl.LOCK_UN)
if __name__=='__main__':main()
`
export const ARCHIVE_PYTHON=pythonProgram
export function invocation(argv){
 const keys=['python','tools','output','descriptor','expected-head','expected-descriptor-sha256'],values={}
 assert.equal(argv.length,keys.length*2)
 for(let i=0;i<argv.length;i+=2){const k=argv[i].slice(2);assert.ok(argv[i].startsWith('--')&&keys.includes(k)&&!(k in values));assert.ok(argv[i+1]&&!argv[i+1].startsWith('--'));values[k]=argv[i+1]}
 for(const k of ['python','tools','output','descriptor'])assert.ok(path.isAbsolute(values[k])&&path.resolve(values[k])===values[k])
 assert.equal(values.output,'/tmp/c25-missing-recovery-01');assert.match(values['expected-head'],/^[a-f0-9]{40}$/);assert.match(values['expected-descriptor-sha256'],/^[a-f0-9]{64}$/)
 const sha=x=>createHash('sha256').update(x).digest('hex'),producer=fileURLToPath(import.meta.url)
 return {python:values.python,args:['-B','-c',pythonProgram,...keys.filter(k=>k!=='python').flatMap(k=>['--'+k,values[k]]),'--expected-producer-sha256',sha(fs.readFileSync(producer)),'--expected-inline-sha256',sha(pythonProgram),'--expected-python-sha256',sha(fs.readFileSync(fs.realpathSync(values.python)))]}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {python,args}=invocation(process.argv.slice(2)),result=spawnSync(python,args,{stdio:'inherit',env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',PYTHONDONTWRITEBYTECODE:'1'}})
 if(result.error)throw result.error;process.exitCode=result.status??1
}
