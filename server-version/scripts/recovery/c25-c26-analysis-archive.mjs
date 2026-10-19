/** Current A07 repaired cluster: separate overlay archive and tmpfs round-trip.
 * Inert on import. Actual archive issuance needs separate authorization. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {pythonProgram as priorProgram} from './c25-c26-archive.mjs'
export const pythonProgram=`_analysis_main=__name__=='__main__'\n__name__='analysis_recovery_library'\nexec(compile(${JSON.stringify(priorProgram)},'c25-c26-archive.mjs','exec'),globals())\n`+String.raw`
import tarfile
from pathlib import PurePosixPath
PRODUCER=BASE/'c25-c26-analysis-archive.mjs'
OUTPUT=ROOT/'c25-build-evidence/c26-analysis-recovery-01'
RESTORE=Path('/tmp/c25-c26-analysis-restore-01')
A07=ROOT/'eduk12_c26_a_07'
DIAG=Path('/tmp/c25-c26-a07-diagnostic-02');REPAIR=Path('/tmp/c25-c26-a07-material-repair-01')
A_ANCHOR=Path('/tmp/c25-c26-analysis-b-prepare-01/a-immutable-binding.json')
A_HEAD='c41cabef47b2f933800d638e5bad3fa3ab5e110d'
B_SOURCE_HEAD='1d35dd5f1e4fd4246807b3a2fea0383e4f5923ff'
SCOPE='C26_ANALYSIS_REPAIRED_PRIMARY_6708_JOINT_6719_PHYSICAL_RECOVERY'
A['ARCHIVE_CAP']=128*1024**2
METADATA_CAP=32*1024**2
A['METADATA_RESERVE']=METADATA_CAP
XZ_MEMORY=128*1024**2
NAMES={'archive':'current-cluster.tar.xz','descriptor':'recovery-descriptor.json','archiveReceipt':'archive-receipt.json','fullSourceManifest':'source-full.json','dataManifest':'source-data.json','frozenSourceManifest':'source-nondata.json','historicalRecoveryManifest':'historical-evidence.json','restoreInstructions':'RESTORE.txt'}
PINS={
 DIAG/'review-index.json':'2334b2ef5b457860190d0ea8ba404a6dde5fec27b3785c276d3706d07ba0c9d2',
 DIAG/'current-stopped-full-manifest.json':'7905059d3a49a8041ac13c0f053f0fd02cee3ab602d1aeae4d80805da5542e12',
 REPAIR/'repair-receipt.json':'e670b201579f1f08d9cc457b0eb6a9fcddbdd310e8e6152f8794138d20d2b95c',
 REPAIR/'review-index.json':'ee898350b3ace3cb92a6ffe1db60196f8f0a59a804da4da0352d4ea29973e7a1',
 A07/'c25-c26-a-overall-result.json':'f5a7bcd2364fbb89d3d01bf8e3ab1579a86283fd97b094c1330c1a62666f68a0',
 A07/'c25-c26-audit-final-result.json':'029bc8640ad7f823d97eee78954d1a5dfc483ced717e0a19a179875e704a2887',
 A_ANCHOR:'673e59f74323ec1041e0eaecf0c4a30de07a15efdd1f14bae6d9ddbee258554e'}
SNAPSHOTS={
 'eduk12_recovery':{'path':str(A07/'c25-c26-audit-final-primary-db-snapshot.json'),'sha256':'f4e761419f5faf4a84befef265b4edff45d49d5a1d16a89cc09d039b1eed34b4','rows':6708},
 'eduk12_c25_joint_restore':{'path':str(A07/'c25-c26-final-db-snapshot.json'),'sha256':'f3b2837a0d6079899405f917a6231151d74536061809e171c09e7b5cf35b1728','rows':6719}}
HISTORICAL_ROOTS=tuple(dict.fromkeys([*HISTORICAL_ROOTS,*[ROOT/('eduk12_c26_a_%02d'%n) for n in range(1,8)],DIAG,REPAIR,
 *[Path('/tmp/c25-c26-recovery-%02d'%n) for n in range(1,6)],*[Path('/tmp/c25-c26-carry-%02d'%n) for n in [6,7]],
 *[Path('/tmp/c25-source-%02d'%n) for n in range(13,17)],*[Path('/tmp/c25-source-issuance-%02d'%n) for n in range(13,17)]]))
def check_pin(p,expected):
    value=file_binding(p);assert value['mode']==0o600 and value['sha256']==expected,'fixed evidence changed'
    return value

def expected_repaired_full():
    for p,h in PINS.items():check_pin(p,h)
    full=json.loads((DIAG/'current-stopped-full-manifest.json').read_text());repair=json.loads((REPAIR/'repair-receipt.json').read_text())
    assert repair['passed'] is True and repair['runtimePassed'] is False and repair['new52RowsPhysicalDatabaseFilesUnchanged'] is True
    assert repair['originalA07OverallStillFalse'] is True and repair['originalRuntimeReceiptUnchanged'] is True
    changes=repair['afterOnlyApprovedPhysicalDifferences'];assert len(changes)==3
    rows={r['path']:r for r in full};assert len(rows)==len(full)
    expected_adds={
     'exports/composite_a33ef06a_3a749256-37a5-45f7-9036-5212aba7b7f7__generation_1.zip':('a04ad665347cbf67c52808323ff503795d76d6ede0ae7fc8ecdf2f0423e214a4',386341),
     'exports/composite_a33ef06a_c131dba5-8902-4db3-a572-7da5150ca8b4__generation_1.csv':('bc2680a591e22cf721fc81ec1ba3dd7536d7164181b29331b4b89d76d5ec38e2',42424)}
    assert {x['path'] for x in changes}=={'exports',*expected_adds}
    for change in changes:
        name=change['path'];before,after=change['before'],change['after'];assert rows.get(name)==before and after['path']==name
        if name=='exports':assert {k:v for k,v in before.items() if k!='mtimeNs'}=={k:v for k,v in after.items() if k!='mtimeNs'}
        else:
            assert before is None and (after['sha256'],after['size'])==expected_adds[name]
            assert after['type']=='file' and after['links']==1 and after['mode']==0o600 and after['uid']==after['gid']==1000 and after['xattrs']=={}
        rows[name]=after
    return sorted(rows.values(),key=lambda r:tuple(r['path'].split('/')))

def validate_current():
    bindings={str(p):check_pin(p,h) for p,h in PINS.items()}
    overall=json.loads((A07/'c25-c26-a-overall-result.json').read_text());audit=json.loads((A07/'c25-c26-audit-final-result.json').read_text())
    assert overall['passed'] is False and overall['workloadComplete'] is True and overall['cleanupVerified'] is True and overall['finalSnapshotVerified'] is True
    assert overall['processExits']['c25-c26-material-audit']==1 and audit['passed'] is True and audit['databaseReadOnly'] is True
    assert audit['protectedCoreFacts']==overall['protectedCoreFacts'] and audit['protectedCoreFacts']['currentRows']==6719
    assert audit['protectedCoreFacts']['allCoreRowsRetained'] is True and audit['protectedCoreFacts']['primarySnapshotExact'] is True
    snapshots={}
    for name,item in SNAPSHOTS.items():
        p=Path(item['path']);snapshots[name]=check_pin(p,item['sha256']);value=json.loads(p.read_text())
        assert len(value['projection'])==217 and sum(x['rows'] for x in value['projection'].values())==item['rows']
    # Indices bind all raw A07 and exact repair evidence, without copying payloads.
    for index in [DIAG/'review-index.json',REPAIR/'review-index.json']:
        values=json.loads(index.read_text())['files']
        for p,item in values.items():
            actual=file_binding(Path(p));assert actual['sha256']==item['sha256'] and actual['bytes']==item['bytes'] and actual['mode']==0o600
    expected_repaired_full()
    return {'fixedEvidence':bindings,'snapshots':snapshots,'A07OverallPassed':False,'A07WorkloadComplete':True,'materialRepairSeparate':True,'logicalCountsObservedDuringArchive':False,'nextStartupSchemaContract':'EXACT_CURRENT_SCHEMA_AND_ROWS; NO_73_3_NORMALIZATION','newLogicalRestoreQualified':False}

def producer_binding(tools,head):
    inherited=A['producer_binding'](tools,head);_,c=A['helpers']()
    assert c.git('rev-parse','refs/heads/archive/training-c26-a07-c41cabef').decode().strip()==A_HEAD
    assert c.git('rev-parse',head+':server-version/backend').strip()==c.git('rev-parse',B_SOURCE_HEAD+':server-version/backend').strip()
    anchor=json.loads(A_ANCHOR.read_text());assert anchor['head']==A_HEAD
    artifacts={}
    for name,item in anchor['components'].items():
        component=REPO/'server-version'/name;current=c.file_inventory(component,'dist');assert current==item['actualDist']
        original=check_pin(Path(item['originalReceiptPath']),item['originalReceiptSha256']);artifacts[name]={'historicalHead':A_HEAD,'originalReceipt':original,'artifactInventoryHash':A['digest'](current),'fileCount':len(current)}
    old=json.loads(Path(anchor['components']['backend']['originalReceiptPath']).read_text())
    dependencies=c.dependency_inventory(REPO/'server-version/backend');assert dependencies==old['dependencies']
    xz=tool_binding(Path('/usr/bin/xz'));assert subprocess.check_output(['/usr/bin/xz','--version'],text=True,timeout=5,env=ENV).splitlines()[0]=='xz (XZ Utils) 5.8.1'
    code="import{createHash}from'node:crypto';import{pythonProgram}from "+json.dumps(PRODUCER.as_uri())+";process.stdout.write(createHash('sha256').update(pythonProgram).digest('hex'))"
    inline=subprocess.check_output([Path(tools)/'node_modules/node/bin/node','--input-type=module','-e',code],text=True,timeout=10,env=ENV)
    return {'head':head,'entry':file_binding(PRODUCER),'inlinePythonSha256':inline,'toolsAndOriginal72Helpers':inherited,'xz':xz,'AAnchor':check_pin(A_ANCHOR,PINS[A_ANCHOR]),'historicalAArtifacts':artifacts,'BSourceBase':B_SOURCE_HEAD,'currentBSource':c.component_inputs(REPO/'server-version/backend'),'dependenciesDigest':A['digest'](dependencies),'BProductEmitted':False}

def stopped_current(tools):
    original=A['stopped_failure'](SOURCE,tools);before=file_binding(A07/'status.json');status=json.loads((A07/'status.json').read_text())
    assert status['state']=='stopped' and status['cleanupVerified'] is True
    assert status['cleanupErrors']==[{'stage':'material-audit','errorType':'AssertionError'}]
    for pid in status['pids'].values():assert type(pid)is int and pid>1 and not Path('/proc',str(pid)).exists()
    for port in status['ports'].values():
        with socket.socket() as s:s.settimeout(.2);assert s.connect_ex(('127.0.0.1',port))!=0
    assert file_binding(A07/'status.json')==before
    return {**original,'A07Status':before,'materialFailureRetained':True}

def staged_bounds(data):
    assert set(data)==set(DATA_DIRS)
    entries=[row for group in data.values() for row in group];logical=sum(r['size'] for r in entries if r['type']=='file')
    xattrs=sum(v['bytes'] for row in entries for v in row['xattrs'].values())
    extraction=sum(((r['size']+4095)//4096)*4096 for r in entries if r['type']=='file')+len(entries)*4096+xattrs+32*1024**2
    assert extraction<=1024**3 and xattrs<=32*1024**2 and os.sysconf('SC_PAGESIZE')==4096
    return {'sourceLogicalBytes':logical,'sourceEntries':len(entries),'extractionReserveBytes':extraction,'archiveMaxBytes':A['ARCHIVE_CAP'],'metadataReserveBytes':METADATA_CAP,'failureReserveBytes':FAILURE_EVIDENCE_RESERVE,'xzMemoryLimitBytes':XZ_MEMORY}

def staged_admission(bounds,current,phase,metadata_allocated=0,compressed=None):
    assert phase in ['COMPRESS','EXTRACT'] and 0<=metadata_allocated<=METADATA_CAP
    A['resource_floor'](current);meta_future=METADATA_CAP-metadata_allocated
    if phase=='COMPRESS':
        assert metadata_allocated==0 and compressed is None
        overlay_increment=A['ARCHIVE_CAP']+METADATA_CAP;tmp_increment=0
        assert current['workspaceFreeBytes']>=A['FLOOR']+A['RESERVE']
    else:
        assert compressed is not None and 0<compressed['allocatedBytes']<=A['ARCHIVE_CAP'] and compressed['bytes']<=A['ARCHIVE_CAP'] and compressed['links']==1
        overlay_increment=meta_future;tmp_increment=bounds['extractionReserveBytes']
    workspace_need=A['FLOOR']+A['RESERVE']+overlay_increment
    tmp_need=A['RESERVE']+tmp_increment
    mem_need=A['MEMORY']+tmp_increment+XZ_MEMORY+A['PROCESS_RESERVE']
    assert current['workspaceFreeBytes']>=workspace_need and current['tmpFreeBytes']>=tmp_need and current['memAvailableBytes']>=mem_need,'split-filesystem admission below original floors'
    return {'phase':phase,'observedResources':dict(current),'futureOverlayIncrementBytes':overlay_increment,'futureTmpIncrementBytes':tmp_increment,'requiredWorkspaceFreeBytes':workspace_need,'requiredTmpFreeBytes':tmp_need,'requiredMemAvailableBytes':mem_need,'metadataAllocatedBytes':metadata_allocated,'compressedAlreadyOccupiesFreeSpace':compressed,'archiveAddedAgain':False if phase=='EXTRACT' else None}

def output_paths(output,restore):
    assert canonical(output)==OUTPUT and canonical(restore)==RESTORE
    for p in [output,restore]:
        assert not os.path.lexists(p)
        for parent in p.parents:assert not parent.is_symlink()
    assert OUTPUT.parent.is_dir() and OUTPUT.parent.stat().st_dev==SOURCE.stat().st_dev
    assert RESTORE.parent==Path('/tmp') and RESTORE.parent.stat().st_dev!=SOURCE.stat().st_dev
    mounts=[r.split() for r in Path('/proc/self/mountinfo').read_text().splitlines()];tmp=[r for r in mounts if r[4]=='/tmp']
    assert tmp and tmp[-1][tmp[-1].index('-')+1]=='tmpfs'
    return output,restore

def archive_members(path,data,guard):
    expected={name if r['path']=='.' else name+'/'+r['path']:r for name,rows in data.items() for r in rows};seen=set()
    with tarfile.open(path,mode='r|xz') as archive:
        for m in archive:
            guard();name=m.name.rstrip('/') if m.isdir() else m.name
            assert name==str(PurePosixPath(name)) and not name.startswith('/') and '..' not in PurePosixPath(name).parts
            assert name in expected and name not in seen;seen.add(name);r=expected[name]
            assert (m.isdir() and r['type']=='directory') or (m.isfile() and r['type']=='file')
            assert not m.issym() and not m.islnk() and m.sparse is None
            assert m.uid==r['uid'] and m.gid==r['gid'] and m.mode==r['mode'] and m.size==(r['size'] if r['type']=='file' else 0)
    assert seen==set(expected)

def restore_instructions():
    return ('NODE-LOCAL PHYSICAL RECOVERY; NOT A DURABLE OR NEW BOOT-TESTED LOGICAL RESTORE.\n'
     'Archive and metadata are on overlay; disposable full verification extraction is on independent /tmp tmpfs.\n'
     'Restore all three roots as one consistent set to a new private location, never mix pgdata/WAL or overwrite current data.\n'
     'Verify pinned descriptor/archive and complete file metadata first. GNU tar --acls --xattrs --xattrs-include=* --same-owner --same-permissions -I /usr/bin/xz -xf ARCHIVE -C FRESH.\n'
     'Current accepted logical state is primary6708 and joint6719, including all 52 new A07 rows; next authorized startup must compare exact current schema and rows. No historical 73/3 exception applies.\n'
     'A07 overall remains false; two material files were restored by a separately bound repair. A historical artifact and current B source are distinct; B has not been emitted by this archive.\n')

def verify_recovery_descriptor(descriptor_path,expected_sha,tools,expected_archive_head,check_data=True):
    # Historical archive HEAD is explicit. Runtime must separately bind its own
    # HEAD and future B producer; this archive never claims B was emitted.
    assert type(check_data)is bool and canonical(descriptor_path)==OUTPUT/NAMES['descriptor']
    assert not any(os.path.lexists(OUTPUT/n) for n in ['archive.part','archive-failure-private.json','archive-failure-private.log','descriptor-unpublished.json'])
    assert not os.path.lexists(RESTORE);private_directory(OUTPUT)
    binding=check_pin(Path(descriptor_path),expected_sha);v=json.loads(Path(descriptor_path).read_text())
    assert v['schemaVersion']==1 and v['kind']==SCOPE and v['head']==expected_archive_head and v['sourceRoot']==str(SOURCE)
    assert v['allowedMutableRoots']==list(DATA_DIRS) and v['BProductEmitted'] is False and v['newLogicalRestoreQualified'] is False
    p=v['producer'];assert p['head']==expected_archive_head and p['BProductEmitted'] is False and p['BSourceBase']==B_SOURCE_HEAD
    assert file_binding(PRODUCER)==p['entry'] and check_pin(A_ANCHOR,PINS[A_ANCHOR])==p['AAnchor']
    _,c=A['helpers']();assert c.component_inputs(REPO/'server-version/backend')==p['currentBSource']
    assert c.git('rev-parse',expected_archive_head+':server-version/backend').strip()==c.git('rev-parse',B_SOURCE_HEAD+':server-version/backend').strip()
    frozen=p['toolsAndOriginal72Helpers']
    assert A['helpers']()[0].python_helper_closure()==frozen['pythonHelperClosure']
    for rel,item in frozen['recoverySources'].items():
        actual=REPO/rel;assert str(actual.resolve())==item['realpath'] and actual.stat().st_mode&0o777==item['mode'] and sha_file(actual)==item['sha256']
    assert_tools_unchanged(frozen['tools']);assert tool_binding(Path('/usr/bin/xz'))==p['xz']
    assert A['digest'](c.dependency_inventory(REPO/'server-version/backend'))==p['dependenciesDigest']
    anchor=json.loads(A_ANCHOR.read_text())
    for name,item in anchor['components'].items():assert c.file_inventory(REPO/'server-version'/name,'dist')==item['actualDist']
    assert set(v['files'])==set(NAMES)-{'archive','descriptor'}
    for n,item in v['files'].items():assert file_binding(OUTPUT/NAMES[n])==item and item['mode']==0o600
    assert file_binding(OUTPUT/NAMES['archive'])==v['archive'] and v['archive']['mode']==0o600 and v['archive']['bytes']<=A['ARCHIVE_CAP']
    read=lambda n:json.loads((OUTPUT/NAMES[n]).read_text())
    full,data,frozen_source,history,receipt=[read(n) for n in ['fullSourceManifest','dataManifest','frozenSourceManifest','historicalRecoveryManifest','archiveReceipt']]
    assert full==expected_repaired_full() and data_projection(full)==data and nondata_manifest(SOURCE)==frozen_source
    assert [r for r in full if not A['mutable_path'](r['path'])]==frozen_source
    assert historical_recovery_manifest()==history and validate_current()==v['acceptedEvidence']
    assert receipt['passed'] is True and receipt['producer']==p and receipt['archive']==v['archive'] and receipt['acceptedEvidence']==v['acceptedEvidence']
    for key in ['roundTripVerified','sourceUnchanged','historicalEvidenceUnchanged','temporaryExtractionRemoved','fsyncVerified']:assert receipt[key] is True
    assert receipt['servicesStarted'] is False and receipt['BProductEmitted'] is False and receipt['A07OverallPassed'] is False
    assert receipt['watcherClose']['joined'] is True and receipt['watcherClose']['remainingAggregateSeconds']>0 and receipt['elapsedSeconds']<600
    budget=receipt['budget'];assert budget['schemaVersion']==3 and budget['bounds']==staged_bounds(data)
    for phase,key in [('COMPRESS','compressionAdmission'),('EXTRACT','extractionAdmission')]:
        a=budget[key];assert a==staged_admission(budget['bounds'],a['observedResources'],phase,a['metadataAllocatedBytes'],a['compressedAlreadyOccupiesFreeSpace'])
    compressed=compressed_allocation(OUTPUT/NAMES['archive']);old=budget['extractionAdmission']['compressedAlreadyOccupiesFreeSpace']
    assert {k:v for k,v in compressed.items() if k!='path'}=={k:v for k,v in old.items() if k!='path'}
    logs=['archive.log','xz-integrity.log','roundtrip-extract.log','restored-controldata.log'];assert len(receipt['steps'])==len(logs)
    for name,step in zip(logs,receipt['steps']):
        log=file_binding(OUTPUT/name);assert step['exitCode']==0 and step['logSha256']==log['sha256'] and log['bytes']<=LOG_CAP
    assert {f.name for f in OUTPUT.iterdir()}==set(NAMES.values())|set(logs)
    assert DIRECTORY_CHARGE+sum(rounded_file_charge(f.stat().st_size) for f in OUTPUT.iterdir() if f.name!=NAMES['archive'])<=METADATA_CAP
    assert (OUTPUT/NAMES['restoreInstructions']).read_text()==restore_instructions()
    if check_data:assert frozen_failure_manifest(SOURCE)==full and stopped_current(tools)==v['stoppedEvidence']
    assert file_binding(Path(descriptor_path))==binding
    return v

def main():
    parser=argparse.ArgumentParser()
    for n in ['tools','output','restore']:parser.add_argument('--'+n,type=Path,required=True)
    for n in ['expected-head','expected-producer-sha256','expected-inline-sha256','expected-python-sha256']:parser.add_argument('--'+n,required=True)
    args=parser.parse_args();os.umask(0o077);tools=canonical(args.tools)
    assert tools==ROOT/'eduk12_tools_20261018' and sha_file(Path(sys.executable).resolve())==args.expected_python_sha256
    assert file_binding(PRODUCER)['sha256']==args.expected_producer_sha256
    output,restore=output_paths(args.output,args.restore)
    with (tools/'.measurement.lock').open('rb') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);guard=ResourceGuard();steps=[];started=time.monotonic();deadline=started+600;created=False;writer=None;joined=False
        result={'scope':SCOPE,'passed':False,'servicesStarted':False,'durableBackup':False,'logicalCountsObservedDuringArchive':False,'BProductEmitted':False,'A07OverallPassed':False}
        def interrupted(signum,_frame):raise TimeoutError(guard.error or str(signum))
        previous={s:signal.signal(s,interrupted) for s in [signal.SIGALRM,signal.SIGTERM,signal.SIGINT,signal.SIGHUP]};signal.setitimer(signal.ITIMER_REAL,600)
        try:
            guard.start();producer=producer_binding(tools,args.expected_head);assert producer['inlinePythonSha256']==args.expected_inline_sha256
            accepted=validate_current();stopped=stopped_current(tools);full=frozen_failure_manifest(SOURCE)
            assert full==expected_repaired_full(),'current physical source differs from exact A07 repair lineage'
            data=data_manifests(SOURCE);assert data_projection(full)==data
            frozen=nondata_manifest(SOURCE);history=historical_recovery_manifest();bounds=staged_bounds(data)
            budget={'schemaVersion':3,'storage':'OVERLAY_ARCHIVE_METADATA__TMPFS_EXTRACTION','bounds':bounds,'compressionAdmission':staged_admission(bounds,guard.check(),'COMPRESS')}
            result['budget']=budget;output.mkdir(mode=0o700);created=True;fsync_directory(output.parent);writer=C26EvidenceWriter(output)
            for n,v in [('fullSourceManifest',full),('dataManifest',data),('frozenSourceManifest',frozen),('historicalRecoveryManifest',history)]:writer.json(output/NAMES[n],v)
            writer.bytes(output/NAMES['restoreInstructions'],restore_instructions().encode())
            partial=output/'archive.part';archive=output/NAMES['archive']
            def run(argv,name,seconds):
                try:step=bounded_archive_pipe(argv,output/(name+'.log'),seconds,guard.check,writer,deadline)
                except BaseException as error:
                    if hasattr(error,'archive_step'):steps.append(error.archive_step)
                    raise
                steps.append(step);return step
            run(['/usr/bin/tar','--format=pax','--acls','--xattrs','--xattrs-include=*','--numeric-owner','--atime-preserve=system','-I','/usr/bin/xz --threads=1 --memlimit-compress=128MiB --no-adjust -6','-cf',partial,'-C',SOURCE,*DATA_DIRS],'archive',300)
            fd=os.open(partial,os.O_RDONLY|os.O_NOFOLLOW)
            try:os.fsync(fd)
            finally:os.close(fd)
            pin=compressed_allocation(partial);run(['/usr/bin/xz','--memlimit-decompress=128MiB','-t',partial],'xz-integrity',60)
            archive_members(partial,data,guard.check);assert compressed_allocation(partial)==pin
            budget['extractionAdmission']=staged_admission(bounds,guard.check(),'EXTRACT',writer.allocated(),pin)
            restore.mkdir(mode=0o700);fsync_directory(restore.parent)
            run(['/usr/bin/tar','--acls','--xattrs','--xattrs-include=*','--same-owner','--same-permissions','-I','/usr/bin/xz --memlimit-decompress=128MiB','-xf',partial,'-C',restore],'roundtrip-extract',180)
            fsync_tree(restore);assert data_manifests(restore)==data
            run([tools/'postgresql/bin/pg_controldata','-D',restore/'pgdata'],'restored-controldata',10)
            assert sha_file(output/'restored-controldata.log')==stopped['pgControldataSha256']
            assert frozen_failure_manifest(SOURCE)==full and historical_recovery_manifest()==history and validate_current()==accepted and stopped_current(tools)==stopped
            assert producer_binding(tools,args.expected_head)==producer and compressed_allocation(partial)==pin
            guard.check();assert private_directory(restore)==RESTORE and RESTORE.parent==Path('/tmp');shutil.rmtree(restore);fsync_directory(restore.parent)
            assert not os.path.lexists(archive);os.rename(partial,archive);fsync_directory(output)
            result['watcherClose']=stop_archive_guard_before_publication(guard,deadline);joined=True
            result.update(passed=True,producer=producer,acceptedEvidence=accepted,stoppedEvidence=stopped,archive=file_binding(archive),budget=budget,steps=steps,elapsedSeconds=time.monotonic()-started,minimumObserved=guard.minimum,roundTripVerified=True,sourceUnchanged=True,historicalEvidenceUnchanged=True,temporaryExtractionRemoved=True,fsyncVerified=True,evidenceAllocation=writer.summary(),comparedMetadata=['path','type','mode','uid','gid','mtime_ns','bytes','sha256','all source xattrs including supported ACLs','no links'],metadataCapability='Source and restored xattrs must match exactly. Raw GNU tar ACL warnings remain; equality does not imply general ACL support.',snapshotBindings=SNAPSHOTS)
            writer.json(output/NAMES['archiveReceipt'],result)
            value={'schemaVersion':1,'kind':SCOPE,'head':args.expected_head,'sourceRoot':str(SOURCE),'producer':producer,'archive':result['archive'],'acceptedEvidence':accepted,'files':{n:file_binding(output/name) for n,name in NAMES.items() if n not in ['archive','descriptor']},'stoppedEvidence':stopped,'allowedMutableRoots':list(DATA_DIRS),'BProductEmitted':False,'newLogicalRestoreQualified':False}
            guard.check();writer.json(output/NAMES['descriptor'],value);fsync_directory(output);guard.check();assert time.monotonic()<deadline
            print(json.dumps({'passed':True,'descriptor':str(output/NAMES['descriptor']),'descriptorSha256':sha_file(output/NAMES['descriptor']),'archiveSha256':result['archive']['sha256']}),flush=True)
        except BaseException as error:
            for s in previous:signal.signal(s,signal.SIG_IGN)
            signal.setitimer(signal.ITIMER_REAL,0);guard.stop()
            if created and os.path.lexists(output/NAMES['descriptor']):os.rename(output/NAMES['descriptor'],output/'descriptor-unpublished.json')
            result.update(passed=False,errorType=type(error).__name__,error=str(error),steps=steps,elapsedSeconds=time.monotonic()-started,minimumObserved=guard.minimum)
            if created:writer.json(output/'archive-failure-private.json',result,failure=True);writer.bytes(output/'archive-failure-private.log',traceback.format_exc().encode(),failure=True);fsync_directory(output)
            raise
        finally:
            for s in previous:signal.signal(s,signal.SIG_IGN)
            signal.setitimer(signal.ITIMER_REAL,0)
            if not joined:guard.stop()
            for s,h in previous.items():signal.signal(s,h)
            fcntl.flock(lock,fcntl.LOCK_UN)
if _analysis_main:main()
`
export function invocation(argv){
 const keys=['python','tools','output','restore','expected-head'],v={};assert.equal(argv.length,keys.length*2)
 for(let i=0;i<argv.length;i+=2){const k=argv[i].slice(2);assert.ok(argv[i].startsWith('--')&&keys.includes(k)&&!(k in v));v[k]=argv[i+1]}
 for(const k of ['python','tools','output','restore'])assert.ok(path.isAbsolute(v[k])&&path.resolve(v[k])===v[k])
 assert.equal(v.output,'/workspace/scratch/5a77e8bdc1ae/c25-build-evidence/c26-analysis-recovery-01');assert.equal(v.restore,'/tmp/c25-c26-analysis-restore-01');assert.match(v['expected-head'],/^[a-f0-9]{40}$/)
 const sha=x=>createHash('sha256').update(x).digest('hex')
 return {python:v.python,args:['-B','-',...keys.filter(k=>k!=='python').flatMap(k=>['--'+k,v[k]]),'--expected-producer-sha256',sha(fs.readFileSync(fileURLToPath(import.meta.url))),'--expected-inline-sha256',sha(pythonProgram),'--expected-python-sha256',sha(fs.readFileSync(fs.realpathSync(v.python)))],input:pythonProgram}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {python,args,input}=invocation(process.argv.slice(2)),r=spawnSync(python,args,{input,encoding:'utf8',timeout:610000,maxBuffer:4*1024**2,env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',PYTHONDONTWRITEBYTECODE:'1'}})
 if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);if(r.error)throw r.error;process.exitCode=r.status??1
}
