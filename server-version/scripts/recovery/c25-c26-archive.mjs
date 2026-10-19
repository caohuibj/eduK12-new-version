/** Current stopped C26 recovery. Explicit later authorization is required;
 * importing is inert. Reuses the exact prior archive mechanics and 600s guard. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {ARCHIVE_PYTHON as inheritedArchivePython} from './c25-analysis-resume-archive.mjs'
import {STAGED_ARCHIVE_PYTHON} from './c25-c26-archive-budget.mjs'
export const pythonProgram=`R={'__name__':'inherited_recovery_library'}\nexec(compile(${JSON.stringify(inheritedArchivePython)},'c25-analysis-resume-archive.mjs','exec'),R)\n`+String.raw`
import argparse, fcntl, json, os, re, shutil, signal, socket, stat, subprocess, sys, time, traceback
from pathlib import Path
sys.dont_write_bytecode=True
A=R['A']
for name in ['sha_file','canonical','private_directory','file_binding','tool_binding','node_tool_bindings','assert_tools_unchanged','inventory','nondata_manifest','frozen_failure_manifest','data_manifests','data_projection','ResourceGuard','recovery_budget','bounded','fsync_directory','fsync_tree','sync_json','sync_bytes','archive_members']:
    globals()[name]=A[name]
ROOT,REPO,BASE,SOURCE,DATA_DIRS=[A[name] for name in ['ROOT','REPO','BASE','SOURCE','DATA_DIRS']]
PRIOR,CORE=R['PRIOR'],R['CORE']
FINAL=ROOT/'eduk12_c25_analysis_02'
OUTPUT=Path('/tmp/c25-c26-recovery-03');PRODUCER=BASE/'c25-c26-archive.mjs'
FAILED_A01=ROOT/'eduk12_c26_a_01'
FAILED_A01_RECEIPT_SHA='719f9e412b591fe1f3c171715f55eb8d4bcc64e3da66b4bd39684454052094c7'
FROZEN_A01=Path('/tmp/c25-c26-a01-diagnostic-01/current-stopped-full-manifest.json')
FROZEN_A01_SHA='988a25ccb76630aec5f61c29e97fef599b3277187e47d73ff8140a45b6b8e1bc'
FAILED_A02=ROOT/'eduk12_c26_a_02'
FAILED_A02_RECEIPT_SHA='89d7cd62403a101fdccfa40a48fb79aa9b3e24d2aaa41bc08c5cde198d22802f'
FROZEN_A02=Path('/tmp/c25-c26-a02-diagnostic-01/current-stopped-full-manifest.json')
FROZEN_A02_SHA='2cd1fdca4a9e6f8b4124c38e674bb6baead88fa1f4edc2fec56c3467a1e6e69f'
SCOPE='C26_STOPPED_PRIMARY_6708_JOINT_RESTORE_6667_NODE_LOCAL_TEMPORARY_RECOVERY'
SNAPSHOTS={
 'eduk12_recovery':{'path':str(FINAL/'c25-analysis-resume-final-db-snapshot.json'),'sha256':'f4e761419f5faf4a84befef265b4edff45d49d5a1d16a89cc09d039b1eed34b4','acceptedRows':6708,'acceptedTables':217,'acceptedCheckpoints':21},
 'eduk12_c25_joint_restore':{'path':str(CORE/'c25-missing-final-db-snapshot.json'),'sha256':'2116f582580ab67d0c5f69330d73300b026a3eaeeacf94a47f268aa16b244e85','acceptedRows':6667,'acceptedTables':217,'acceptedCheckpoints':21}}
RESTORE_RECEIPT=CORE/'c25-missing-restore-result.json'
RESTORE_RECEIPT_SHA='6a57f6ae2d261a58b93fde9d1561282df1c6095bad0e7e9b00a85ae1076d868d'
SEED_FIXTURE=ROOT/'eduk12_c21_http_01/fixture-private.json'
SEED_FIXTURE_SHA='86287a00e4a34810c5e8e71afd70dac2f45c89750b9f04560aad67b4506d9239'
FINAL_RECEIPT_SHA='7605c14677befe44709d66be4177a3e28944a79d49a40aade716073cdf2c27ac'
HISTORICAL_ROOTS=(FAILED_A02,FROZEN_A02.parent,Path('/tmp/c25-source-10'),Path('/tmp/c25-source-issuance-10'),Path('/tmp/c25-c26-recovery-02'),Path('/tmp/c25-c26-archive-launch-02'),Path('/tmp/c25-c26-runtime-launch-02'),FAILED_A01,FROZEN_A01.parent,Path('/tmp/c25-source-09'),Path('/tmp/c25-source-issuance-09'),Path('/tmp/c25-c26-recovery-01'),Path('/tmp/c25-c26-archive-launch-01'),Path('/tmp/c25-c26-runtime-launch-01'),*R['HISTORICAL_ROOTS'],Path('/tmp/c25-source-08'),R['OUTPUT'],Path('/tmp/c25-analysis-resume-runtime-launch-01'),Path('/tmp/c25-analysis-resume-archive-launch-01'),FINAL)
NAMES={**R['NAMES'],'archive':'c25-c26-data.tar.gz','descriptor':'c25-c26-recovery-descriptor.json'}
ENV=R['ENV']
${STAGED_ARCHIVE_PYTHON}
def producer_binding(tools,head):
    old=A['producer_binding'](tools,head)
    code="import {createHash} from 'node:crypto';import {pythonProgram} from "+json.dumps(PRODUCER.as_uri())+";process.stdout.write(createHash('sha256').update(pythonProgram).digest('hex'))"
    inline=subprocess.check_output([Path(tools)/'node_modules/node/bin/node','--input-type=module','-e',code],text=True,timeout=10,env=ENV)
    assert re.fullmatch('[a-f0-9]{64}',inline)
    value={'head':head,'originalArchiveLibrary':old,'entry':file_binding(PRODUCER),'inlinePythonSha256':inline}
    assert A['producer_binding'](tools,head)==old and file_binding(PRODUCER)==value['entry']
    return value

def accepted_current_facts(receipt,snapshots):
    assert receipt['passed'] is True and receipt['executedPhases']==['analysis-resume']
    assert receipt['scope']=='C25_C19_EXISTING_THREE_JOBS_REMAINING_ANALYSIS_CSV_COMPOSITION'
    for key in ['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified','allPriorRowsPreserved','oldMaterialFilesPreserved','recoveryArchiveVerified']:
        assert receipt[key] is True
    assert receipt['finalSnapshotSha256']==SNAPSHOTS['eduk12_recovery']['sha256']
    assert receipt['newDatabaseRestoreExecuted'] is False
    assert receipt['protectedCoreFacts']['oldRows']==6667 and receipt['protectedCoreFacts']['checkpointRows']==21
    assert receipt['protectedCoreFacts']['originalReportsBudgetRestoredExactly'] is True
    assert receipt['processExits'] and all(type(code)is int and code==0 for code in receipt['processExits'].values())
    assert set(snapshots)==set(SNAPSHOTS)
    for name,expected in SNAPSHOTS.items():
        value=snapshots[name]
        assert set(value['columns'])==set(value['projection'])==set(value['columnMetadata']) and len(value['columns'])==expected['acceptedTables']
        assert sum(v['rows'] for v in value['projection'].values())==expected['acceptedRows']
        assert value['projection']['training_attempt_checkpoints']['rows']==expected['acceptedCheckpoints']

def failed_a01_binding():
    binding=file_binding(FAILED_A01/'c25-c26-a-overall-result.json');assert binding['sha256']==FAILED_A01_RECEIPT_SHA
    result=json.loads(Path(binding['path']).read_text())
    assert result['passed'] is False and result['cleanupVerified'] is True and result['finalSnapshotVerified'] is False
    assert result.get('driverExecuted') is not True and result['cleanupErrors']==[]
    assert result['processExits']=={'postgres':0,'c25-c26-readiness-1':0,'c25-c26-audit-baseline':1,'c25-c26-material-audit':0,'c25-c26-final-inputs':0}
    assert file_binding(Path(binding['path']))==binding
    return binding

def failed_a02_binding():
    binding=file_binding(FAILED_A02/'c25-c26-a-overall-result.json');assert binding['sha256']==FAILED_A02_RECEIPT_SHA
    result=json.loads(Path(binding['path']).read_text())
    assert result['passed'] is False and result['cleanupVerified'] is True and result['finalSnapshotVerified'] is False
    assert result.get('driverExecuted') is not True and result['cleanupErrors']==[] and result['audits']=={}
    assert result['processExits']=={'postgres':0,'c25-c26-readiness-1':-9,'c25-c26-material-audit':0,'c25-c26-final-inputs':0}
    assert file_binding(Path(binding['path']))==binding
    return binding

def assert_frozen_a02(full):
    binding=file_binding(FROZEN_A02)
    assert binding['mode']==0o600 and binding['sha256']==FROZEN_A02_SHA,'frozen A02 failed physical manifest identity changed'
    assert json.loads(FROZEN_A02.read_text())==full,'current tree differs from frozen stopped A02 physical state'
    assert file_binding(FROZEN_A02)==binding
    return binding

def stopped_failed_a01():
    before=file_binding(FAILED_A01/'status.json');status=json.loads(Path(before['path']).read_text())
    assert status['state']=='stopped' and status['cleanupVerified'] is True and status['cleanupErrors']==[]
    assert set(status['pids'])=={'postgres'} and set(status['ports'])=={'postgres','redis','api'}
    for pid in status['pids'].values():assert type(pid)is int and pid>1 and not Path('/proc',str(pid)).exists()
    for port in status['ports'].values():
        assert type(port)is int and 0<port<65536
        with socket.socket() as sock:sock.settimeout(.2);assert sock.connect_ex(('127.0.0.1',port))!=0
    assert file_binding(FAILED_A01/'status.json')==before
    return {'status':before,'processesAndPortsStopped':True,'acceptedLogicalBaselineObserved':False}

def stopped_failed_a02():
    before=file_binding(FAILED_A02/'status.json');status=json.loads(Path(before['path']).read_text())
    assert status['state']=='stopped' and status['cleanupVerified'] is True and status['cleanupErrors']==[]
    assert set(status['pids'])=={'postgres'} and set(status['ports'])=={'postgres','redis','api'}
    for pid in status['pids'].values():assert type(pid)is int and pid>1 and not Path('/proc',str(pid)).exists()
    for port in status['ports'].values():
        assert type(port)is int and 0<port<65536
        with socket.socket() as sock:sock.settimeout(.2);assert sock.connect_ex(('127.0.0.1',port))!=0
    assert file_binding(FAILED_A02/'status.json')==before
    return {'status':before,'processesAndPortsStopped':True,'acceptedLogicalBaselineObserved':False}

def validate_current():
    files={name:file_binding(Path(item['path'])) for name,item in SNAPSHOTS.items()}
    assert all(files[name]['sha256']==item['sha256'] for name,item in SNAPSHOTS.items())
    receipt=file_binding(FINAL/'c25-analysis-resume-overall-result.json');assert receipt['sha256']==FINAL_RECEIPT_SHA
    snapshots={name:json.loads(Path(item['path']).read_text()) for name,item in SNAPSHOTS.items()}
    accepted_current_facts(json.loads(Path(receipt['path']).read_text()),snapshots)
    assert files=={name:file_binding(Path(item['path'])) for name,item in SNAPSHOTS.items()}
    restore=file_binding(RESTORE_RECEIPT);seed=file_binding(SEED_FIXTURE)
    assert restore['sha256']==RESTORE_RECEIPT_SHA and seed['sha256']==SEED_FIXTURE_SHA
    proof=json.loads(RESTORE_RECEIPT.read_text());assert proof['passed'] is True and proof['restrictedRoleVerified'] is True and proof['sourceUnchangedDuringRestore'] is True
    assert len(proof['restoreEquivalence']['columnOrdinals'])==73 and len(proof['restoreEquivalence']['constraintReparses'])==3
    assert file_binding(RESTORE_RECEIPT)==restore and file_binding(SEED_FIXTURE)==seed
    return {'snapshots':files,'acceptedFinalReceipt':receipt,'acceptedRestoreReceipt':restore,'seedFixture':seed,'jointSnapshotIdentity':'PRE_RESTORE_SOURCE; EXACT_73_ORDINAL_3_PARSER_ADMISSION_REQUIRED','logicalCountsObservedDuringArchive':False,'precedingFailedA01':failed_a01_binding(),'precedingFailedA02':failed_a02_binding()}

def stopped_current(tools):
    return {**R['stopped_current'](tools),'acceptedFinal':R['stopped_evidence'](FINAL),'failedA01':stopped_failed_a01(),'failedA02':stopped_failed_a02()}
def historical_recovery_manifest():return {str(folder):inventory(folder) for folder in HISTORICAL_ROOTS}
def output_path(path,descriptor):
    path=canonical(path);assert path==OUTPUT and not os.path.lexists(path)
    source,_=A['helpers']();source.destination_path(path,protected=[SOURCE,CORE,PRIOR,FINAL,REPO,ROOT/'eduk12_tools_20261018',ROOT/'eduk12_c21_http_01',ROOT/'eduk12_c23_http_03',ROOT/'c25-build-evidence',Path(descriptor).parent,*HISTORICAL_ROOTS])
    assert path.parent.stat().st_dev!=SOURCE.stat().st_dev
    rows=[line.split() for line in Path('/proc/self/mountinfo').read_text().splitlines()];matches=[r for r in rows if r[4]=='/tmp']
    assert matches and matches[-1][matches[-1].index('-')+1]=='tmpfs'
    return path
def restore_instructions():
    return A['restore_instructions']()+'Current stopped C26 recovery, containing both databases in the same physical cluster.\nAccepted logical snapshots are primary6708 and joint_restore6667; no SQL was run during archiving.\nThe next authorized startup must compare primary exactly and admit joint_restore using the fixed historical 73-ordinal/3-parser proof, then freeze its actual schema before measuring A.\nA01 and A02 stopped before their first logical baseline query; both failed receipts and changed physical states are retained. A02 server readiness did not prove SQL readiness; its SQL probe exited -9. The current physical tree is bound to the frozen A02 manifest.\nNo new full logical backup/restore qualification is claimed. All historical failures and recovery points remain.\n'

def verify_recovery_descriptor(descriptor_path,expected_sha,tools,failure_state,expected_head,check_data=True):
    assert type(check_data)is bool and canonical(failure_state)==SOURCE and re.fullmatch('[a-f0-9]{64}',expected_sha)
    target=canonical(descriptor_path);assert target==OUTPUT/NAMES['descriptor'];private_directory(OUTPUT)
    assert not any(os.path.lexists(OUTPUT/n) for n in ['archive-failure-private.json','archive-failure-private.log','verification-restore','archive.part'])
    binding=file_binding(target);assert binding['sha256']==expected_sha and binding['mode']==0o600
    value=json.loads(target.read_text());assert value['schemaVersion']==1 and value['scope']==SCOPE and value['sourceRoot']==str(SOURCE)
    assert value['head']==expected_head and value['producer']==producer_binding(tools,expected_head)
    assert value['acceptedSnapshotBindings']==SNAPSHOTS and value['logicalCountsObservedDuringArchive'] is False and value['acceptedEvidence']==validate_current()
    assert value['allowedMutableRoots']==list(DATA_DIRS) and file_binding(Path(value['http03Descriptor']['path']))==value['http03Descriptor']
    assert set(value['files'])==set(NAMES)-{'archive','descriptor'}
    for name,item in value['files'].items():assert item==file_binding(OUTPUT/NAMES[name]) and item['mode']==0o600
    assert value['archive']==file_binding(OUTPUT/NAMES['archive']) and value['archive']['bytes']<=A['ARCHIVE_CAP'] and value['archive']['mode']==0o600
    read=lambda key:json.loads((OUTPUT/NAMES[key]).read_text())
    data,full,frozen,prior,core,historical,receipt=[read(k) for k in ['dataManifest','fullSourceManifest','frozenSourceManifest','priorContinuationManifest','coreContinuationManifest','historicalRecoveryManifest','archiveReceipt']]
    assert value['frozenFailedA02Manifest']==assert_frozen_a02(full)
    assert data_projection(full)==data and [row for row in full if not A['mutable_path'](row['path'])]==frozen
    assert nondata_manifest(SOURCE)==frozen and inventory(PRIOR)==prior and inventory(CORE)==core and historical_recovery_manifest()==historical
    assert receipt['frozenFailedA02Manifest']==value['frozenFailedA02Manifest']
    assert receipt['passed'] is True and receipt['scope']==SCOPE and receipt['archive']==value['archive'] and receipt['producer']==value['producer']
    budget=receipt['budget'];assert budget['schemaVersion']==2 and budget['bounds']==staged_bounds(data)
    for phase,key in [('COMPRESS','compressionAdmission'),('EXTRACT','extractionAdmission')]:
        admission=budget[key]
        assert admission==staged_admission(budget['bounds'],admission['observedResources'],phase,admission['metadataAllocatedBytes'],admission['compressedAlreadyOccupiesFreeSpace'])
    compressed=budget['extractionAdmission']['compressedAlreadyOccupiesFreeSpace'];current_compressed=compressed_allocation(OUTPUT/NAMES['archive'])
    assert {k:v for k,v in compressed.items() if k!='path'}=={k:v for k,v in current_compressed.items() if k!='path'}
    assert receipt['evidenceAllocationBeforeFinalReceipts']['capBytes']==METADATA_CAP and receipt['evidenceAllocationBeforeFinalReceipts']['failureReserveBytes']==FAILURE_EVIDENCE_RESERVE
    log_names=['archive.log','gzip-integrity.log','roundtrip-extract.log','restored-controldata.log'];assert len(receipt['steps'])==len(log_names)
    for name,step in zip(log_names,receipt['steps']):
        log=file_binding(OUTPUT/name);assert step['exitCode']==0 and log['bytes']<=LOG_CAP and log['sha256']==step['logSha256']
    assert {p.name for p in OUTPUT.iterdir()}==set(NAMES.values())|set(log_names)
    metadata=[file_binding(p) for p in OUTPUT.iterdir() if p.name!=NAMES['archive']]
    assert DIRECTORY_CHARGE+sum(rounded_file_charge(p['bytes']) for p in metadata)<=METADATA_CAP
    assert receipt['acceptedSnapshotBindings']==SNAPSHOTS and receipt['logicalCountsObservedDuringArchive'] is False and receipt['acceptedEvidence']==value['acceptedEvidence']
    for key in ['roundTripVerified','sourceUnchangedDuringArchive','nonDataEvidencePreserved','priorContinuationEvidencePreserved','coreContinuationEvidencePreserved','historicalRecoveryMaterialsPreserved','rawSourceRetained','restoreMaterialFsynced']:
        assert value[key] is True and receipt[key] is True
    for key in ['servicesStarted','durableBackup']:assert value[key] is False and receipt[key] is False
    assert receipt['symlinkCount']==0 and receipt['hardlinkGroups']==[] and receipt['temporaryVerificationCopyRemoved'] is True
    assert receipt['manifestSha256']==value['files']['dataManifest']['sha256'] and receipt['sourceEvidenceSha256']==value['files']['frozenSourceManifest']['sha256'] and receipt['coreEvidenceSha256']==value['files']['coreContinuationManifest']['sha256']
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
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);guard=ResourceGuard();steps=[];started=time.monotonic();created=False;writer=None
        result={'scope':SCOPE,'passed':False,'servicesStarted':False,'durableBackup':False,'rawSourceRetained':True,'acceptedSnapshotBindings':SNAPSHOTS,'logicalCountsObservedDuringArchive':False}
        def interrupted(signum,_frame):raise TimeoutError(guard.error or ('archive signal '+str(signum)))
        previous={sig:signal.signal(sig,interrupted) for sig in [signal.SIGALRM,signal.SIGTERM,signal.SIGINT,signal.SIGHUP]};signal.setitimer(signal.ITIMER_REAL,600)
        try:
            guard.start();assert guard.check()['workspaceFreeBytes']>=A['FLOOR']+A['RESERVE']
            producer=producer_binding(tools,args.expected_head);assert producer['inlinePythonSha256']==args.expected_inline_sha256
            source,_=A['helpers']();source.validate_descriptor(args.descriptor,args.expected_descriptor_sha256,tools/'postgresql/bin/pg_controldata');http03=file_binding(args.descriptor)
            accepted=validate_current();stopped=stopped_current(tools)
            full,data=frozen_failure_manifest(SOURCE),data_manifests(SOURCE);assert data_projection(full)==data
            lineage=assert_frozen_a02(full)
            frozen=nondata_manifest(SOURCE);assert [r for r in full if not A['mutable_path'](r['path'])]==frozen
            prior,core,historical=inventory(PRIOR),inventory(CORE),historical_recovery_manifest();bounds=staged_bounds(data)
            budget={'schemaVersion':2,'bounds':bounds,'compressionAdmission':staged_admission(bounds,guard.check(),'COMPRESS'),'extractionAdmission':None}
            result['budget']=budget
            output.mkdir(mode=0o700);created=True;fsync_directory(output.parent)
            writer=C26EvidenceWriter(output)
            for name,value in [('fullSourceManifest',full),('dataManifest',data),('frozenSourceManifest',frozen),('priorContinuationManifest',prior),('coreContinuationManifest',core),('historicalRecoveryManifest',historical)]:writer.json(output/NAMES[name],value)
            writer.bytes(output/NAMES['restoreInstructions'],restore_instructions().encode())
            partial=output/'archive.part';archive=output/NAMES['archive'];restore=output/'verification-restore'
            def run(argv,name,seconds):
                try:step=bounded_archive_pipe(argv,output/(name+'.log'),seconds,guard.check,writer,started+600)
                except BaseException as error:
                    if hasattr(error,'archive_step'):steps.append(error.archive_step)
                    raise
                steps.append(step);return step
            run(['/usr/bin/tar','--format=pax','--acls','--xattrs','--xattrs-include=*','--numeric-owner','--atime-preserve=system','-I','/usr/bin/gzip -6 -n','-cf',partial,'-C',SOURCE,*DATA_DIRS],'archive',300)
            assert file_binding(partial)['bytes']<=A['ARCHIVE_CAP']
            fd=os.open(partial,os.O_RDONLY|os.O_NOFOLLOW)
            try:os.fsync(fd)
            finally:os.close(fd)
            compressed_sha=sha_file(partial);run(['/usr/bin/gzip','-t',partial],'gzip-integrity',60);archive_members(partial,data,guard.check)
            compressed_pin,budget['extractionAdmission']=admit_extraction(partial,bounds,writer,guard.check,lambda:restore.mkdir(mode=0o700),compressed_sha,result)
            run(['/usr/bin/tar','--acls','--xattrs','--xattrs-include=*','--same-owner','--same-permissions','-xzf',partial,'-C',restore],'roundtrip-extract',180)
            fsync_tree(restore);assert data_manifests(restore)==data
            run([tools/'postgresql/bin/pg_controldata','-D',restore/'pgdata'],'restored-controldata',10)
            assert sha_file(output/'restored-controldata.log')==stopped['pgControldataSha256']
            assert frozen_failure_manifest(SOURCE)==full and data_manifests(SOURCE)==data
            assert inventory(PRIOR)==prior and inventory(CORE)==core and historical_recovery_manifest()==historical
            assert validate_current()==accepted and stopped_current(tools)==stopped
            source.validate_descriptor(args.descriptor,args.expected_descriptor_sha256,tools/'postgresql/bin/pg_controldata')
            assert file_binding(args.descriptor)==http03 and producer_binding(tools,args.expected_head)==producer and compressed_allocation(partial)==compressed_pin
            guard.check();assert restore.parent==output and restore.name=='verification-restore' and private_directory(output)==output
            shutil.rmtree(restore);fsync_directory(output);assert not os.path.lexists(archive);os.rename(partial,archive);fsync_directory(output)
            archive_binding=file_binding(archive)
            result.update(passed=True,frozenFailedA02Manifest=lineage,acceptedEvidence=accepted,roundTripVerified=True,sourceUnchangedDuringArchive=True,nonDataEvidencePreserved=True,priorContinuationEvidencePreserved=True,coreContinuationEvidencePreserved=True,historicalRecoveryMaterialsPreserved=True,restoreMaterialFsynced=True,temporaryVerificationCopyRemoved=True,archive=archive_binding,manifestSha256=sha_file(output/NAMES['dataManifest']),sourceEvidenceSha256=sha_file(output/NAMES['frozenSourceManifest']),coreEvidenceSha256=sha_file(output/NAMES['coreContinuationManifest']),symlinkCount=0,hardlinkGroups=[],producer=producer,budget=budget,steps=steps,elapsedSeconds=time.monotonic()-started,minimumObserved=guard.minimum,comparedMetadata=['path','type','mode','uid','gid','mtime_ns','size','SHA256','all xattrs and ACLs','zero links'])
            result['evidenceAllocationBeforeFinalReceipts']=writer.summary()
            writer.json(output/NAMES['archiveReceipt'],result);fsync_directory(output)
            value={'schemaVersion':1,'scope':SCOPE,'sourceRoot':str(SOURCE),'allowedMutableRoots':list(DATA_DIRS),'head':args.expected_head,'frozenFailedA02Manifest':lineage,'producer':producer,'acceptedEvidence':accepted,'acceptedSnapshotBindings':SNAPSHOTS,'logicalCountsObservedDuringArchive':False,'http03Descriptor':http03,'stoppedEvidence':stopped,'archive':archive_binding,'files':{name:file_binding(output/NAMES[name]) for name in set(NAMES)-{'archive','descriptor'}},**{name:result[name] for name in ['roundTripVerified','sourceUnchangedDuringArchive','nonDataEvidencePreserved','priorContinuationEvidencePreserved','coreContinuationEvidencePreserved','historicalRecoveryMaterialsPreserved','rawSourceRetained','restoreMaterialFsynced','servicesStarted','durableBackup']}}
            guard.check();writer.json(output/NAMES['descriptor'],value);fsync_directory(output);guard.check();assert time.monotonic()-started<600
            print(json.dumps({'passed':True,'descriptorPath':str(output/NAMES['descriptor']),'descriptorSha256':sha_file(output/NAMES['descriptor']),'archiveSha256':archive_binding['sha256']}),flush=True)
        except BaseException as error:
            for sig in previous:signal.signal(sig,signal.SIG_IGN)
            signal.setitimer(signal.ITIMER_REAL,0);guard.stop()
            if created and os.path.lexists(output/NAMES['descriptor']):os.rename(output/NAMES['descriptor'],output/'descriptor-unpublished.json')
            result.update(passed=False,errorType=type(error).__name__,error=str(error),steps=steps,minimumObserved=guard.minimum,elapsedSeconds=time.monotonic()-started)
            if created:writer.json(output/'archive-failure-private.json',result,failure=True);writer.bytes(output/'archive-failure-private.log',traceback.format_exc().encode(),failure=True);fsync_directory(output)
            raise
        finally:
            for sig in previous:signal.signal(sig,signal.SIG_IGN)
            signal.setitimer(signal.ITIMER_REAL,0);guard.stop()
            for sig,handler in previous.items():signal.signal(sig,handler)
            fcntl.flock(lock,fcntl.LOCK_UN)
if __name__=='__main__':main()
`
export const ARCHIVE_PYTHON=pythonProgram
export function parseArchiveArgs(argv){
 const keys=['python','tools','output','descriptor','expected-head','expected-descriptor-sha256'],values={}
 assert.equal(argv.length,keys.length*2)
 for(let i=0;i<argv.length;i+=2){const k=argv[i].slice(2);assert.ok(argv[i].startsWith('--')&&keys.includes(k)&&!(k in values));assert.ok(argv[i+1]&&!argv[i+1].startsWith('--'));values[k]=argv[i+1]}
 for(const k of ['python','tools','output','descriptor'])assert.ok(path.isAbsolute(values[k])&&path.resolve(values[k])===values[k])
 assert.equal(values.output,'/tmp/c25-c26-recovery-03');assert.match(values['expected-head'],/^[a-f0-9]{40}$/);assert.match(values['expected-descriptor-sha256'],/^[a-f0-9]{64}$/)
 return values
}
export function archivePythonArgv(values,bindings){
 for(const key of ['producerSha256','inlineSha256','pythonSha256'])assert.match(bindings[key],/^[a-f0-9]{64}$/)
 const keys=['tools','output','descriptor','expected-head','expected-descriptor-sha256']
 return ['-B','-c',pythonProgram,...keys.flatMap(k=>['--'+k,values[k]]),'--expected-producer-sha256',bindings.producerSha256,'--expected-inline-sha256',bindings.inlineSha256,'--expected-python-sha256',bindings.pythonSha256]
}
export function invocation(argv){
 const values=parseArchiveArgs(argv)
 const sha=x=>createHash('sha256').update(x).digest('hex'),producer=fileURLToPath(import.meta.url)
 return {python:values.python,args:archivePythonArgv(values,{producerSha256:sha(fs.readFileSync(producer)),inlineSha256:sha(pythonProgram),pythonSha256:sha(fs.readFileSync(fs.realpathSync(values.python)))})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {python,args}=invocation(process.argv.slice(2)),result=spawnSync(python,args,{stdio:'inherit',env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',PYTHONDONTWRITEBYTECODE:'1'}})
 if(result.error)throw result.error;process.exitCode=result.status??1
}
