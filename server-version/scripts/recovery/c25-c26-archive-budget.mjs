/** C26-only staged tmpfs admission and bounded archive evidence writers.
 * Importing is inert; the original Python helper inventory is unchanged. */
export const STAGED_ARCHIVE_PYTHON=String.raw`
import errno,selectors
METADATA_CAP=128*1024**2
FAILURE_EVIDENCE_RESERVE=4*1024**2
LOG_CAP=8*1024**2
DIRECTORY_CHARGE=64*1024
def rounded_file_charge(size):
    assert type(size)is int and size>=0
    return ((size+4095)//4096)*4096+4096

def staged_bounds(data):
    assert set(data)==set(DATA_DIRS)
    entries=[entry for group in data.values() for entry in group]
    logical=sum(row['size'] for row in entries if row['type']=='file')
    rounded=sum(((row['size']+4095)//4096)*4096 for row in entries if row['type']=='file')
    xattr_bytes=sum(value['bytes'] for row in entries for value in row['xattrs'].values())
    extraction=rounded+len(entries)*4096+xattr_bytes+32*1024**2
    assert extraction<=A['ARCHIVE_CAP'] and xattr_bytes<=32*1024**2
    assert METADATA_CAP==A['METADATA_RESERVE'] and os.sysconf('SC_PAGESIZE')==4096
    return {'sourceLogicalBytes':logical,'sourceEntries':len(entries),'archiveMaxBytes':A['ARCHIVE_CAP'],'extractionReserveBytes':extraction,'metadataReserveBytes':METADATA_CAP,'failureEvidenceReserveBytes':FAILURE_EVIDENCE_RESERVE,'singleLogCapBytes':LOG_CAP,'tmpFloorBytes':A['RESERVE'],'memoryFloorBytes':A['MEMORY'],'workspaceFloorBytes':A['FLOOR'],'processReserveBytes':A['PROCESS_RESERVE']}

def staged_admission(bounds,current,phase,metadata_allocated=0,compressed=None):
    assert phase in ['COMPRESS','EXTRACT'] and 0<=metadata_allocated<=METADATA_CAP
    A['resource_floor'](current)
    if phase=='COMPRESS':
        assert metadata_allocated==0 and compressed is None
        assert current['workspaceFreeBytes']>=A['FLOOR']+A['RESERVE']
        increment=bounds['archiveMaxBytes']+METADATA_CAP
    else:
        assert compressed is not None and 0<compressed['allocatedBytes']<=bounds['archiveMaxBytes']
        assert compressed['bytes']<=bounds['archiveMaxBytes'] and compressed['links']==1
        increment=bounds['extractionReserveBytes']+(METADATA_CAP-metadata_allocated)
    need_tmp=A['RESERVE']+increment
    need_memory=A['MEMORY']+increment+A['PROCESS_RESERVE']
    assert current['tmpFreeBytes']>=need_tmp and current['memAvailableBytes']>=need_memory,'stage cannot coexist within original tmp/memory floors'
    return {'phase':phase,'observedResources':dict(current),'futureTmpfsIncrementBytes':increment,'requiredTmpFreeBytes':need_tmp,'requiredMemAvailableBytes':need_memory,'metadataAllocatedBytes':metadata_allocated,'compressedAlreadyOccupiesFreeSpace':compressed,'archiveAddedAgain':False if phase=='EXTRACT' else None}

def compressed_allocation(path):
    before=path.lstat();binding=file_binding(path);after=path.lstat()
    assert A['stable_stat'](before)==A['stable_stat'](after) and before.st_blocks==after.st_blocks
    assert after.st_nlink==1 and 0<after.st_blocks*512<=A['ARCHIVE_CAP'] and after.st_size<=A['ARCHIVE_CAP']
    return {**binding,'device':after.st_dev,'inode':after.st_ino,'links':after.st_nlink,'uid':after.st_uid,'gid':after.st_gid,'mtimeNs':after.st_mtime_ns,'blocks':after.st_blocks,'allocatedBytes':after.st_blocks*512}

class C26EvidenceWriter:
    def __init__(self,root):self.root=Path(root);self.sizes={};self.charged=DIRECTORY_CHARGE
    def claim(self,path,size,failure=False):
        path=Path(path);assert path.parent==self.root and path.name not in ['archive.part',NAMES['archive'],'verification-restore']
        assert size<=64*1024**2
        old=rounded_file_charge(self.sizes[path]) if path in self.sizes else 0
        charged=self.charged-old+rounded_file_charge(size)
        assert charged<=METADATA_CAP-(0 if failure else FAILURE_EVIDENCE_RESERVE),'archive evidence allocation cap'
        if failure:assert path.name in ['archive-failure-private.json','archive-failure-private.log']
        self.sizes[path]=size;self.charged=charged
    def check_allocated(self,path):
        st=Path(path).lstat()
        assert stat.S_ISREG(st.st_mode) and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600
        assert st.st_size==self.sizes[Path(path)] and st.st_blocks*512+4096<=rounded_file_charge(st.st_size)
        assert self.root.stat().st_blocks*512<=DIRECTORY_CHARGE
    def bytes(self,path,value,failure=False):
        assert isinstance(value,bytes);self.claim(path,len(value),failure);sync_bytes(path,value);self.check_allocated(path)
    def json(self,path,value,failure=False):self.bytes(path,(json.dumps(value,indent=2,sort_keys=True)+'\n').encode(),failure)
    def append(self,path,handle,value):
        size=self.sizes[Path(path)]+len(value);assert size<=LOG_CAP,'archive child log cap'
        self.claim(path,size);handle.write(value);self.check_allocated(path)
    def allocated(self):
        allocated=self.root.stat().st_blocks*512+sum(path.stat().st_blocks*512 for path in self.sizes)
        assert 0<=allocated<=self.charged<=METADATA_CAP
        return allocated
    def summary(self):return {'capBytes':METADATA_CAP,'chargedBytes':self.charged,'failureReserveBytes':FAILURE_EVIDENCE_RESERVE,'perLogCapBytes':LOG_CAP,'directoryChargeBytes':DIRECTORY_CHARGE,'files':{p.name:{'logicalBytes':size,'allocatedUpperBoundBytes':rounded_file_charge(size)} for p,size in self.sizes.items()}}

def archive_child_identity(pid):
    raw=Path('/proc',str(pid),'stat').read_text();parts=raw[raw.rfind(') ')+2:].split()
    return {'pid':int(raw.split(' ',1)[0]),'parentPid':int(parts[1]),'processGroupId':int(parts[2]),'startTicks':parts[19]}

def archive_group_members(pgid):
    rows=[]
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():continue
        try:
            raw=(entry/'stat').read_text();parts=raw[raw.rfind(') ')+2:].split()
        except FileNotFoundError:continue
        if int(parts[2])==pgid:rows.append({'pid':int(entry.name),'state':parts[0],'parentPid':int(parts[1]),'processGroupId':pgid,'startTicks':parts[19]})
    return rows

def bounded_archive_pipe(argv,log_path,seconds,guard,writer,aggregate_end):
    # Keep the leader waitable (WNOWAIT) until pipe drain and safe group signal
    # complete. A reaped/reused numerical PGID is never the signal authority.
    assert 0<seconds<=300
    started=time.monotonic();cutoff=min(aggregate_end,started+seconds)
    command=['/usr/bin/prlimit','--fsize='+str(A['ARCHIVE_CAP'])+':'+str(A['ARCHIVE_CAP']),'--',*map(str,argv)]
    writer.claim(log_path,0);process=None;identity=None;poller=None;error=None;exit_info=None;ownership_lost=False;cleanup_errors=[];signal_sent=False;wait_owned=False
    assert signal.getsignal(signal.SIGCHLD)==signal.SIG_DFL,'waitable child ownership requires default SIGCHLD'
    signal.signal(signal.SIGCHLD,signal.SIG_DFL) # Reset inherited sigaction flags, including NOCLDWAIT.
    def check():
        guard();assert time.monotonic()<cutoff,'bounded archive child deadline'
    def exact_group():
        current=archive_child_identity(process.pid)
        assert current==identity and current['processGroupId']==process.pid and current['parentPid']==os.getpid(),'archive child identity drift'
    with Path(log_path).open('xb',buffering=0) as log:
        try:
            check();process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=ENV,start_new_session=True)
            identity=archive_child_identity(process.pid);exact_group()
            os.set_blocking(process.stdout.fileno(),False);poller=selectors.DefaultSelector();poller.register(process.stdout,selectors.EVENT_READ)
            eof=False
            while not eof or exit_info is None:
                check()
                for key,_ in poller.select(min(.1,max(.001,cutoff-time.monotonic()))):
                    chunk=os.read(key.fd,65536)
                    if not chunk:eof=True;poller.unregister(process.stdout)
                    else:writer.append(log_path,log,chunk)
                exit_info=os.waitid(os.P_PID,process.pid,os.WEXITED|os.WNOHANG|os.WNOWAIT)
            exact_group();check()
            assert all(row['state'] in ['Z','X','x'] for row in archive_group_members(process.pid)),'archive leader exit left active group members'
            check();code=process.wait(timeout=min(5,max(.001,cutoff-time.monotonic())));wait_owned=True
            assert code==0,'archive child failed; private log retained'
            check()
        except BaseException as caught:
            error=caught
            ownership_lost=isinstance(caught,ChildProcessError) or isinstance(caught,OSError) and caught.errno==errno.ECHILD
            if process is not None:
                try:
                    if process.returncode is None and not ownership_lost:
                        # No poll/wait or consuming waitid has run: with default
                        # SIGCHLD this direct child cannot yet be PID-reused.
                        # This permits safe failure cleanup even if diagnostic
                        # /proc or WNOWAIT itself failed, never successful proof.
                        assert os.getpgid(process.pid)==process.pid
                        os.killpg(process.pid,signal.SIGKILL);signal_sent=True
                        until=min(aggregate_end,time.monotonic()+5)
                        while any(row['state'] not in ['Z','X','x'] for row in archive_group_members(process.pid)):
                            assert time.monotonic()<until,'archive group kill did not reach quiescence'
                            time.sleep(.01)
                except BaseException as cleanup:cleanup_errors.append(type(cleanup).__name__)
                finally:
                    try:process.wait(timeout=min(5,max(.001,aggregate_end-time.monotonic())));wait_owned=not ownership_lost
                    except BaseException as cleanup:cleanup_errors.append(type(cleanup).__name__)
        finally:
            for finalize in [lambda:poller.close() if poller is not None else None,lambda:process.stdout.close() if process is not None and process.stdout is not None else None,log.flush,lambda:os.fsync(log.fileno()),lambda:writer.check_allocated(log_path)]:
                try:finalize()
                except BaseException as cleanup:
                    cleanup_errors.append(type(cleanup).__name__)
                    if error is None:error=cleanup
    log_sha=None;log_bytes=None
    try:
        log_sha=sha_file(log_path);log_bytes=Path(log_path).stat().st_size
        if error is None:check() # Include mandatory log fsync/hash in the original cutoff.
    except BaseException as cleanup:
        if error is None:error=cleanup
        else:cleanup_errors.append(type(cleanup).__name__)
    if error is not None:
        error.archive_step={'argv':list(map(str,argv)),'passed':False,'seconds':time.monotonic()-started,'pid':process.pid if process else None,'identity':identity,'exitCode':process.returncode if process and wait_owned else None,'waitOwnershipVerified':wait_owned,'ownershipLost':ownership_lost,'groupKillSent':signal_sent,'cleanupErrors':cleanup_errors,'logSha256':log_sha,'logBytes':log_bytes,'errorType':type(error).__name__}
        raise error
    return {'argv':list(map(str,argv)),'seconds':time.monotonic()-started,'exitCode':process.returncode,'logSha256':log_sha,'logBytes':log_bytes,'logCapBytes':LOG_CAP,'identity':identity,'leaderReapedAfterPipeDrain':True}

def admit_extraction(partial,bounds,writer,guard,create_restore,expected_sha,evidence):
    pin=compressed_allocation(partial)
    assert pin['sha256']==expected_sha,'compressed bytes changed after integrity/member validation'
    evidence['compressedArchiveBeforeRoundTrip']=pin
    allocated=writer.allocated();current=guard();evidence['extractionAdmissionAttempt']={'resources':current,'metadataChargedBytes':writer.charged,'metadataAllocatedBytes':allocated}
    admission=staged_admission(bounds,current, 'EXTRACT',allocated,pin)
    assert compressed_allocation(partial)==pin,'compressed identity changed before extraction'
    create_restore()
    return pin,admission
`
