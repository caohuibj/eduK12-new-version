/** C26-only, explicit logical-equivalence carry-forward of a fully restored
 * historical physical rollback point. Import is inert. No tar, extraction or
 * service is invoked by this module; actual issuance requires separate GO. */
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {pythonProgram as historicalArchivePython} from './c25-c26-archive.mjs'
export const pythonProgram=`_carry_module_name=__name__\n__name__='historical_c26_library'\nexec(compile(${JSON.stringify(historicalArchivePython)},'c25-c26-archive.mjs','exec'),globals())\n__name__=_carry_module_name\n`+String.raw`
# The inherited physical verifier is intentionally NOT called with a forged
# HEAD. Its exact historical receipt/bytes and current carry identity are distinct.
PRODUCER=BASE/'c25-c26-recovery-carry.mjs'
CARRY_OUTPUT=Path('/tmp/c25-c26-carry-06')
CARRY_DESCRIPTOR='c25-c26-carry-descriptor.json'
CURRENT_SOURCE_DESCRIPTOR=Path('/tmp/c25-source-15/c25-source-descriptor.json')
CARRY_KIND='LOGICALLY_EQUIVALENT_OLDER_PHYSICAL_ROLLBACK'
CARRY_SCOPE='C26_A06_EXPLICIT_A05_LOGICAL_EQUIVALENCE_TO_RECOVERY05'
OLD_DESCRIPTOR=OUTPUT/NAMES['descriptor']
A05=ROOT/'eduk12_c26_a_05'
A05_DIAGNOSTIC=Path('/tmp/c25-c26-a05-diagnostic-01')
CURRENT_FULL=A05_DIAGNOSTIC/'current-stopped-full-manifest.json'
PINNED={
  "/tmp/c25-c26-recovery-05/c25-c26-recovery-descriptor.json": "d94f330100cd2f8795f1aabdde9e3e266f646721bb39fbe4aa2ac97d0019f8a0",
  "/tmp/c25-c26-recovery-05/archive-receipt.json": "58198f284441c13cbd9fe7a315faf147c8edd5497e9560f422adb9d1246f8ca8",
  "/tmp/c25-c26-a05-diagnostic-01/current-stopped-full-manifest.json": "7b426055512c0070a3528bdfc5c45b2d6ea82d8172f96b986869dd1154fca785",
  "/tmp/c25-c26-a05-diagnostic-01/receipt.json": "e0da66d9733eb7e6270cb06f048c1a18dac3bcac16548e741c2dd3aff1f4e9c0",
  "/tmp/c25-c26-a05-diagnostic-01/review-index.json": "46a8eef537a6aec7cb87e318fbd327cc2acff5032dce0b5e55c91789e4fc0a8e"
}
EXPECTED_DELTA_SHA='c9c70fde9322fa00ab62222e4cbfc8d42147dfa3fe6dc16aa52b5157472c1ddd'
EXPECTED_DELTA_PATHS=["pgdata", "pgdata/base/107106", "pgdata/base/107106/pg_internal.init", "pgdata/base/16384", "pgdata/base/16384/pg_internal.init", "pgdata/base/5", "pgdata/base/5/pg_internal.init", "pgdata/base/57461", "pgdata/base/57461/pg_internal.init", "pgdata/base/65318", "pgdata/base/65318/pg_internal.init", "pgdata/base/73151", "pgdata/base/73151/pg_internal.init", "pgdata/base/81608", "pgdata/base/81608/pg_internal.init", "pgdata/base/90079", "pgdata/base/90079/pg_internal.init", "pgdata/base/98575", "pgdata/base/98575/pg_internal.init", "pgdata/base/pgsql_tmp", "pgdata/global", "pgdata/global/pg_control", "pgdata/global/pg_internal.init", "pgdata/pg_logical", "pgdata/pg_logical/replorigin_checkpoint", "pgdata/pg_multixact/members/0000", "pgdata/pg_multixact/offsets/0000", "pgdata/pg_stat", "pgdata/pg_stat/pgstat.stat", "pgdata/pg_subtrans/0000", "pgdata/pg_wal/000000010000000000000029", "pgdata/pg_xact/0000", "pgdata/postmaster.opts"]
def logical_digest(value):return __import__('hashlib').sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def pinned_json(file):
    binding=file_binding(file);assert binding['mode']==0o600 and binding['sha256']==PINNED[str(file)],'pinned carry input changed'
    value=json.loads(file.read_text());assert file_binding(file)==binding
    return value,binding

def exact_physical_delta(before,after):
    left={row['path']:row for row in before};right={row['path']:row for row in after}
    assert len(left)==len(before) and len(right)==len(after),'duplicate physical manifest path'
    changes=[{'path':p,'before':left.get(p),'after':right.get(p)} for p in sorted(set(left)|set(right)) if left.get(p)!=right.get(p)]
    assert [c['path'] for c in changes]==EXPECTED_DELTA_PATHS and len(changes)==33,'unclassified physical change'
    assert logical_digest(changes)==EXPECTED_DELTA_SHA,'physical difference objects changed'
    for p in ['pgdata/pg_xact/0000','pgdata/pg_subtrans/0000','pgdata/pg_multixact/members/0000','pgdata/pg_multixact/offsets/0000','pgdata/pg_logical/replorigin_checkpoint']:
        assert left[p]['sha256']==right[p]['sha256']
    # Every numeric relation/catalog/config/material object is unchanged; the
    # only additions are the exact seven already observed pg_internal.init files.
    return {'count':33,'sha256':EXPECTED_DELTA_SHA,'changes':changes,'allOtherObjectsEqual':True}

def logical_facts(baseline,final,overall,driver,diagnostic):
    assert baseline['passed'] is True and baseline['mode']=='baseline' and baseline['currentRows']==6667
    assert baseline['admission']['historicalOrdinalDifferences']==73 and baseline['admission']['historicalParserDifferences']==3 and baseline['admission']['parserDdlExecuted'] is False
    assert final['passed'] is False and final['mode']=='final' and final['driverPassed'] is False and final['currentRows']==6667
    assert final['errorType']=='AssertionError'
    facts=final['protectedCoreFacts']
    for key in ['allColumnsProtected','allCoreRowsRetained','allOldCheckpointRowsExact','liveSchemaExact','noColumnOrTableExemptions','originalReportsSingletonExact','primarySnapshotExact']:assert facts[key] is True
    assert facts['addedRowsByTable']=={} and facts['oldRows']==facts['currentRows']==6667 and facts['oldTables']==217 and facts['oldCheckpointRows']==21
    assert facts['historicalRowsEncompassed']==[6529,6582,6651] and facts['driverPassed'] is False
    assert baseline['currentRowsFile']['sha256']==final['currentRowsFile']['sha256']=='bc89716ecf6d7dbb23ded0ab3fd9833370fa23ddfab6e5a1eb5e60be185cc670'
    assert baseline['currentSnapshotFile']['sha256']==final['currentSnapshotFile']['sha256']=='56ee2f888f599e5b3ce3072f541e336e964cfe68b3572b5bcc4fd274a5a5045c'
    assert baseline['primarySnapshotFile']['sha256']==final['primarySnapshotFile']['sha256']==SNAPSHOTS['eduk12_recovery']['sha256']
    for value in [baseline,final]:assert value['databaseReadOnly'] is True and value['processExits'] and all(type(x)is int and x==0 for x in value['processExits'].values())
    assert overall['passed'] is False and overall['finalSnapshotVerified'] is False and overall['cleanupVerified'] is True
    assert overall['cleanupErrors']==[{'stage':'final-audit','errorType':'AssertionError'}]
    assert overall['materials']['passed'] is True and overall['inputVerification']['passed'] is True
    assert driver['passed'] is False and driver['http']==[] and driver['prismaBusiness'] is None and driver['children']==[] and driver['checks']==[]
    assert diagnostic['passed'] is True and diagnostic['runtimePassed'] is False and diagnostic['baselinePassed'] is True
    assert diagnostic['fixtureCreated'] is False and diagnostic['newAttempts']==diagnostic['newFinalSubmissions']==diagnostic['businessHttpRequests']==0
    assert diagnostic['primaryRows']==6708 and diagnostic['workingRows']==6667 and diagnostic['rawEvidenceUnchanged'] is True
    return {'primaryRows':6708,'workingRows':6667,'oldCheckpointRows':21,'sameWorkingRowsAndSchema':True,'samePrimarySnapshot':True,'businessWritesObserved':0,'originalOverallPassed':False,'originalFinalAuditPassed':False,'oldRowProtectionPassed':True,'nextStartupMustReadmitBothDatabases':True}

def accepted_a05_evidence():
    diagnostic,diag_binding=pinned_json(A05_DIAGNOSTIC/'receipt.json');index,index_binding=pinned_json(A05_DIAGNOSTIC/'review-index.json')
    for file,item in index['files'].items():assert file_binding(Path(file))==item,'A05 diagnostic index drift'
    bindings=diagnostic['rawEvidence']
    for file,item in bindings.items():assert file_binding(Path(file))==item,'A05 evidence drift'
    assert {str(p) for p in A05.rglob('*') if p.is_file()}=={p for p in bindings if Path(p).is_relative_to(A05)},'A05 evidence path set changed'
    for p in A05.rglob('*'):assert not p.is_symlink(),'A05 evidence link'
    load=lambda name:json.loads((A05/name).read_text())
    base,final,overall,driver=[load(n) for n in ['c25-c26-audit-baseline-result.json','c25-c26-audit-final-result.json','c25-c26-a-overall-result.json','c25-c26-a-driver-result-private.json']]
    facts=logical_facts(base,final,overall,driver,diagnostic)
    for receipt in [base,final]:
        for key in ['currentRowsFile','currentSnapshotFile','primarySnapshotFile']:
            ref=receipt[key];assert (A05/ref['name']).parent==A05 and bindings[str(A05/ref['name'])]['sha256']==ref['sha256']
    admitted=load('c25-c26-admitted-baseline-bindings.json')
    for file,digest in admitted.items():assert bindings[file]['sha256']==digest
    assert file_binding(A05_DIAGNOSTIC/'receipt.json')==diag_binding and file_binding(A05_DIAGNOSTIC/'review-index.json')==index_binding
    return {'diagnostic':diag_binding,'index':index_binding,'files':bindings,'facts':facts}

def historical_rollback():
    old,descriptor_binding=pinned_json(OLD_DESCRIPTOR);receipt,receipt_binding=pinned_json(OUTPUT/NAMES['archiveReceipt'])
    assert old['head']=='5506f13f6a4d240d7a6d8cfa1805fc38d34a834b' and old['scope']==SCOPE
    assert old['sourceRoot']==str(SOURCE) and old['allowedMutableRoots']==list(DATA_DIRS)
    assert old['archive']==file_binding(OUTPUT/NAMES['archive']) and old['archive']['sha256']=='056d4e619c30c58a76f396280069a69b2ea00920fc6cd1549d7e809da48fc3fd'
    assert set(old['files'])==set(NAMES)-{'archive','descriptor'}
    for name,binding in old['files'].items():assert binding==file_binding(OUTPUT/NAMES[name]) and binding['mode']==0o600
    assert old['files']['archiveReceipt']==receipt_binding and receipt['passed'] is True and receipt['archive']==old['archive'] and receipt['producer']==old['producer']
    for flag in ['roundTripVerified','sourceUnchangedDuringArchive','nonDataEvidencePreserved','priorContinuationEvidencePreserved','coreContinuationEvidencePreserved','historicalRecoveryMaterialsPreserved','restoreMaterialFsynced','rawSourceRetained']:assert old[flag] is True and receipt[flag] is True
    assert old['servicesStarted'] is False and old['durableBackup'] is False and receipt['temporaryVerificationCopyRemoved'] is True and receipt['watcherClose']['joined'] is True
    logs=['archive.log','gzip-integrity.log','roundtrip-extract.log','restored-controldata.log'];assert len(receipt['steps'])==4
    for name,step in zip(logs,receipt['steps']):assert step['exitCode']==0 and file_binding(OUTPUT/name)['sha256']==step['logSha256']
    assert {p.name for p in OUTPUT.iterdir()}==set(NAMES.values())|set(logs)
    assert file_binding(Path(old['http03Descriptor']['path']))==old['http03Descriptor']
    for key,folder in [('priorContinuationManifest',PRIOR),('coreContinuationManifest',CORE)]:assert inventory(folder)==json.loads((OUTPUT/NAMES[key]).read_text())
    for folder,expected in json.loads((OUTPUT/NAMES['historicalRecoveryManifest']).read_text()).items():assert inventory(Path(folder))==expected
    assert nondata_manifest(SOURCE)==json.loads((OUTPUT/NAMES['frozenSourceManifest']).read_text())
    assert old['acceptedEvidence']==validate_current()
    return old,{'descriptor':descriptor_binding,'receipt':receipt_binding,'archive':old['archive'],'files':old['files'],'rawSteps':{n:file_binding(OUTPUT/n) for n in logs},'historicalHead':old['head'],'historicalValidationOnly':True}

def current_contract(tools,check_data):
    old,history=historical_rollback();current,binding=pinned_json(CURRENT_FULL)
    before=json.loads((OUTPUT/NAMES['fullSourceManifest']).read_text());delta=exact_physical_delta(before,current)
    assert data_projection(before)==json.loads((OUTPUT/NAMES['dataManifest']).read_text())
    assert [r for r in current if not A['mutable_path'](r['path'])]==json.loads((OUTPUT/NAMES['frozenSourceManifest']).read_text())
    accepted=accepted_a05_evidence()
    if check_data:
        assert frozen_failure_manifest(SOURCE)==current,'current stopped tree differs from frozen A05'
        stopped_current(tools);stopped_a05(tools)
    return {'historicalRollback':history,'currentFull':binding,'exactDelta':delta,'acceptedA05':accepted,'files':old['files']}

def stopped_a05(tools):
    status=json.loads((A05/'status.json').read_text());assert status['state']=='stopped' and status['cleanupVerified'] is True
    assert status['cleanupErrors']==[{'stage':'final-audit','errorType':'AssertionError'}]
    pids=list(status['pids'].values())
    for sub,file in [('api','api-lifecycle-private.json'),('pg-observer','observer-session-private.json')]:
        value=json.loads((A05/sub/file).read_text());assert value['closeObserved'] is True and value['groupQuiescent'] is True;pids.append(value['identity']['pid'])
    assert not (SOURCE/'pgdata/postmaster.pid').exists()
    for pid in pids:assert type(pid)is int and pid>1 and not Path('/proc',str(pid)).exists()
    for port in status['ports'].values():
        with socket.socket() as sock:sock.settimeout(.2);assert sock.connect_ex(('127.0.0.1',port))!=0
    return {'status':file_binding(A05/'status.json'),'pids':pids,'ports':status['ports'],'allStopped':True}

def validate_carry_envelope(value,head,producer,contract):
    assert value['schemaVersion']==1 and value['kind']==CARRY_KIND and value['scope']==CARRY_SCOPE
    assert value['head']==head and value['producer']==producer and value['contract']==contract
    assert value['files']==contract['files'] and value['sourceRoot']==str(SOURCE)
    assert value['archiveBytesEqualCurrentPhysicalState'] is False and value['logicalRollbackEquivalent'] is True
    assert value['newArchiveCreated'] is False and value['newRoundTripExecuted'] is False and value['durableBackup'] is False and value['servicesStarted'] is False
    assert value['restorePolicy']=='RESTORE_WHOLE_RECOVERY05_PGDATA_UPLOADS_EXPORTS; NEVER_MIX_CURRENT_WAL'
    assert value['passed'] is True

def verify_recovery_descriptor(descriptor_path,expected_sha,tools,failure_state,expected_head,check_data=True):
    assert type(check_data)is bool and canonical(failure_state)==SOURCE
    assert canonical(descriptor_path)==CARRY_OUTPUT/CARRY_DESCRIPTOR;private_directory(CARRY_OUTPUT)
    assert {p.name for p in CARRY_OUTPUT.iterdir()}=={CARRY_DESCRIPTOR,'carry-receipt.json'}
    binding=file_binding(descriptor_path);assert binding['sha256']==expected_sha and binding['mode']==0o600
    value=json.loads(Path(descriptor_path).read_text());producer=producer_binding(tools,expected_head);contract=current_contract(tools,check_data)
    validate_carry_envelope(value,expected_head,producer,contract)
    source,_=A['helpers']()
    assert canonical(value['http03Descriptor']['path'])==CURRENT_SOURCE_DESCRIPTOR
    assert value['http03Descriptor']==file_binding(Path(value['http03Descriptor']['path']))
    source.validate_descriptor(Path(value['http03Descriptor']['path']),value['http03Descriptor']['sha256'],Path(tools)/'postgresql/bin/pg_controldata')
    receipt=json.loads((CARRY_OUTPUT/'carry-receipt.json').read_text());assert file_binding(CARRY_OUTPUT/'carry-receipt.json')==value['issuanceReceipt']
    assert receipt['passed'] is True and receipt['head']==expected_head and receipt['producer']==producer and receipt['contract']==contract and receipt['watcherClose']['joined'] is True and receipt['elapsedSeconds']<600
    assert file_binding(descriptor_path)==binding
    return value

def carry_main():
    parser=argparse.ArgumentParser()
    for name in ['tools','output','descriptor']:parser.add_argument('--'+name,type=Path,required=True)
    for name in ['expected-head','expected-descriptor-sha256','expected-producer-sha256','expected-inline-sha256','expected-python-sha256']:parser.add_argument('--'+name,required=True)
    args=parser.parse_args();os.umask(0o077);tools=canonical(args.tools)
    assert tools==ROOT/'eduk12_tools_20261018' and sha_file(Path(sys.executable).resolve())==args.expected_python_sha256
    assert sha_file(PRODUCER)==args.expected_producer_sha256 and canonical(args.output)==CARRY_OUTPUT and not os.path.lexists(CARRY_OUTPUT)
    assert canonical(args.descriptor)==CURRENT_SOURCE_DESCRIPTOR
    source,_=A['helpers']();source.destination_path(CARRY_OUTPUT,protected=[SOURCE,CORE,PRIOR,FINAL,REPO,tools,ROOT/'eduk12_c21_http_01',ROOT/'eduk12_c23_http_03',ROOT/'c25-build-evidence',A05,A05_DIAGNOSTIC,OUTPUT,Path(args.descriptor).parent,*HISTORICAL_ROOTS])
    assert CARRY_OUTPUT.parent.stat().st_dev!=SOURCE.stat().st_dev
    with (tools/'.measurement.lock').open('rb') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);started=time.monotonic();guard=ResourceGuard();created=False;joined=False
        def interrupted(signum,_frame):raise TimeoutError(guard.error or 'carry aggregate/signal')
        previous={sig:signal.signal(sig,interrupted) for sig in [signal.SIGALRM,signal.SIGTERM,signal.SIGINT,signal.SIGHUP]};signal.setitimer(signal.ITIMER_REAL,600)
        try:
            guard.start();assert guard.check()['workspaceFreeBytes']>=A['FLOOR']+A['RESERVE']
            producer=producer_binding(tools,args.expected_head);assert producer['inlinePythonSha256']==args.expected_inline_sha256
            source.validate_descriptor(args.descriptor,args.expected_descriptor_sha256,tools/'postgresql/bin/pg_controldata');http03=file_binding(args.descriptor)
            contract=current_contract(tools,True);stopped=stopped_a05(tools)
            assert producer_binding(tools,args.expected_head)==producer and current_contract(tools,True)==contract
            source.validate_descriptor(args.descriptor,args.expected_descriptor_sha256,tools/'postgresql/bin/pg_controldata');assert file_binding(args.descriptor)==http03
            close=stop_archive_guard_before_publication(guard,started+600);joined=True
            result={'passed':True,'head':args.expected_head,'producer':producer,'contract':contract,'stoppedEvidence':stopped,'watcherClose':close,'minimumObserved':guard.minimum,'elapsedSeconds':time.monotonic()-started,'servicesStarted':False,'newArchiveCreated':False,'newRoundTripExecuted':False}
            value={'schemaVersion':1,'kind':CARRY_KIND,'scope':CARRY_SCOPE,'sourceRoot':str(SOURCE),'head':args.expected_head,'producer':producer,'contract':contract,'files':contract['files'],'http03Descriptor':http03,'archiveBytesEqualCurrentPhysicalState':False,'logicalRollbackEquivalent':True,'newArchiveCreated':False,'newRoundTripExecuted':False,'durableBackup':False,'servicesStarted':False,'restorePolicy':'RESTORE_WHOLE_RECOVERY05_PGDATA_UPLOADS_EXPORTS; NEVER_MIX_CURRENT_WAL','passed':True}
            assert len(json.dumps(result).encode())+len(json.dumps(value).encode())<2*1024**2,'carry evidence hard size bound'
            CARRY_OUTPUT.mkdir(mode=0o700);created=True;sync_json(CARRY_OUTPUT/'carry-receipt.json',result)
            value['issuanceReceipt']=file_binding(CARRY_OUTPUT/'carry-receipt.json');sync_json(CARRY_OUTPUT/CARRY_DESCRIPTOR,value);fsync_directory(CARRY_OUTPUT);fsync_directory(CARRY_OUTPUT.parent)
            guard.check();assert time.monotonic()<started+600,'carry late publication'
            print(json.dumps({'passed':True,'kind':CARRY_KIND,'descriptorSha256':sha_file(CARRY_OUTPUT/CARRY_DESCRIPTOR),'newArchiveCreated':False}))
        except BaseException as error:
            if created:
                descriptor=CARRY_OUTPUT/CARRY_DESCRIPTOR
                if descriptor.exists():descriptor.unlink();fsync_directory(CARRY_OUTPUT)
                sync_json(CARRY_OUTPUT/'carry-failure-private.json',{'passed':False,'errorType':type(error).__name__,'elapsedSeconds':time.monotonic()-started})
            raise
        finally:
            for sig in previous:signal.signal(sig,signal.SIG_IGN)
            signal.setitimer(signal.ITIMER_REAL,0)
            if not joined:guard.stop()
            for sig,handler in previous.items():signal.signal(sig,handler)
            fcntl.flock(lock,fcntl.LOCK_UN)
if __name__=='__main__':carry_main()
`
export const ARCHIVE_PYTHON=pythonProgram
export function invocation(argv){
 const names=['python','tools','output','descriptor','expected-head','expected-descriptor-sha256'],values={}
 assert.equal(argv.length,names.length*2)
 for(let i=0;i<argv.length;i+=2){const key=argv[i].slice(2);assert.ok(argv[i].startsWith('--')&&names.includes(key)&&!Object.hasOwn(values,key));values[key]=argv[i+1]}
 for(const key of ['python','tools','output','descriptor'])assert.ok(path.isAbsolute(values[key])&&path.resolve(values[key])===values[key])
 assert.equal(values.output,'/tmp/c25-c26-carry-06');assert.equal(values.descriptor,'/tmp/c25-source-15/c25-source-descriptor.json');assert.match(values['expected-head'],/^[a-f0-9]{40}$/);assert.match(values['expected-descriptor-sha256'],/^[a-f0-9]{64}$/)
 const hash=b=>createHash('sha256').update(b).digest('hex')
 return {python:values.python,input:pythonProgram,args:['-B','-',...names.filter(n=>n!=='python').flatMap(n=>['--'+n,values[n]]),'--expected-producer-sha256',hash(fs.readFileSync(fileURLToPath(import.meta.url))),'--expected-inline-sha256',hash(pythonProgram),'--expected-python-sha256',hash(fs.readFileSync(fs.realpathSync(values.python)))]}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const command=invocation(process.argv.slice(2)),result=spawnSync(command.python,command.args,{input:command.input,stdio:['pipe','inherit','inherit'],env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',PYTHONDONTWRITEBYTECODE:'1'}})
 if(result.error)throw result.error;process.exitCode=result.status??1
}
