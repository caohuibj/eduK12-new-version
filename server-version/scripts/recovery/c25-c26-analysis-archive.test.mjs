/** Pure contracts and safe rejected CLI only; no current archive, SQL or service. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {pythonProgram,invocation} from './c25-c26-analysis-archive.mjs'
function python(body){
 const r=spawnSync(process.env.C25_TEST_PYTHON,['-B','-c',"import json,sys\nfrom unittest import mock\np=json.load(sys.stdin)\ns={'__name__':'pure_contract'}\nwith mock.patch('subprocess.Popen',side_effect=AssertionError('no subprocess')):exec(compile(p['source'],'<adapter>','exec'),s)\nexec(compile(p['body'],'<contract>','exec'),s)"],{input:JSON.stringify({source:pythonProgram,body}),encoding:'utf8',timeout:15000,maxBuffer:1024**2,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}})
 assert.ifError(r.error);assert.equal(r.status,0,r.stderr||r.stdout)
}
test('binds the real A07 false, separate exact repair and current 6708/6719 schema',()=>python(String.raw`
value=validate_current();full=expected_repaired_full();original=json.loads((DIAG/'current-stopped-full-manifest.json').read_text())
assert value['A07OverallPassed'] is False and value['A07WorkloadComplete'] is True and value['materialRepairSeparate'] is True
assert value['nextStartupSchemaContract']=='EXACT_CURRENT_SCHEMA_AND_ROWS; NO_73_3_NORMALIZATION'
assert len(full)==len(original)+2
assert {r['path'] for r in full}-{r['path'] for r in original}=={r['path'] for r in json.loads((REPAIR/'repair-receipt.json').read_text())['afterOnlyApprovedPhysicalDifferences'] if r['before'] is None}
assert [r for r in full if r['path'].startswith('pgdata')]==[r for r in original if r['path'].startswith('pgdata')]
assert {k:v['rows'] for k,v in SNAPSHOTS.items()}=={'eduk12_recovery':6708,'eduk12_c25_joint_restore':6719}
assert 'No historical 73/3 exception applies' in restore_instructions()
`))
test('split filesystem bounds use the actual repaired data inventory without a compression estimate',()=>python(String.raw`
b=staged_bounds(data_projection(expected_repaired_full()))
assert b['extractionReserveBytes']==1017737216 and b['sourceEntries']==23308 and b['sourceLogicalBytes']==888451455
assert b['archiveMaxBytes']==128*1024**2 and b['metadataReserveBytes']==32*1024**2 and b['failureReserveBytes']==4*1024**2
assert b['xzMemoryLimitBytes']==128*1024**2
`))
test('stages charge only future allocations on their actual filesystem and preserve each floor',()=>python(String.raw`
b=staged_bounds(data_projection(expected_repaired_full()));base=A['FLOOR']+A['RESERVE']
compress={'workspaceFreeBytes':base+128*1024**2+32*1024**2,'tmpFreeBytes':A['RESERVE'],'memAvailableBytes':A['MEMORY']+XZ_MEMORY+A['PROCESS_RESERVE']}
x=staged_admission(b,compress,'COMPRESS');assert x['futureTmpIncrementBytes']==0
pin={'allocatedBytes':19*1024**2,'bytes':18*1024**2,'links':1}
extract={'workspaceFreeBytes':base+12*1024**2,'tmpFreeBytes':A['RESERVE']+b['extractionReserveBytes'],'memAvailableBytes':A['MEMORY']+b['extractionReserveBytes']+XZ_MEMORY+A['PROCESS_RESERVE']}
y=staged_admission(b,extract,'EXTRACT',20*1024**2,pin)
assert y['futureTmpIncrementBytes']==1017737216 and y['futureOverlayIncrementBytes']==12*1024**2 and y['archiveAddedAgain'] is False
for phase,good,allocated,compressed in [('COMPRESS',compress,0,None),('EXTRACT',extract,20*1024**2,pin)]:
    for key in good:
        bad=dict(good);bad[key]-=1
        try:staged_admission(b,bad,phase,allocated,compressed)
        except AssertionError:pass
        else:raise AssertionError('one-byte short admission accepted: '+key)
for badpin in [dict(pin,links=2),dict(pin,allocatedBytes=128*1024**2+1),dict(pin,bytes=128*1024**2+1)]:
    try:staged_admission(b,extract,'EXTRACT',20*1024**2,badpin)
    except AssertionError:pass
    else:raise AssertionError('bad compression pin admitted')
`))
test('metadata allocated charge retains four MiB failure evidence inside the 32 MiB cap',()=>python(String.raw`
import tempfile
with tempfile.TemporaryDirectory() as tmp:
    w=C26EvidenceWriter(Path(tmp));normal=METADATA_CAP-FAILURE_EVIDENCE_RESERVE-DIRECTORY_CHARGE-4096
    w.claim(Path(tmp)/'normal',normal)
    try:w.claim(Path(tmp)/'another',1)
    except AssertionError:pass
    else:raise AssertionError('normal records consumed failure reserve')
    w.claim(Path(tmp)/'archive-failure-private.json',FAILURE_EVIDENCE_RESERVE-8192,failure=True)
    assert w.charged<=METADATA_CAP
    try:w.claim(Path(tmp)/'archive-failure-private.log',8192,failure=True)
    except AssertionError:pass
    else:raise AssertionError('allocated rounded failure charge exceeded cap')
`))
test('XZ member validator rejects links, duplicates, traversal and metadata mismatch using tiny in-memory fixtures',()=>python(String.raw`
import io,tempfile
base={'path':'.','type':'directory','uid':os.getuid(),'gid':os.getgid(),'mode':0o700,'xattrs':{}}
data={'pgdata':[base]}
def make(kind):
    raw=io.BytesIO()
    with tarfile.open(fileobj=raw,mode='w:xz',preset=6) as t:
        m=tarfile.TarInfo('pgdata' if kind!='traversal' else '../pgdata');m.type=tarfile.DIRTYPE;m.mode=base['mode'];m.uid=base['uid'];m.gid=base['gid']
        if kind=='link':m.type=tarfile.SYMTYPE;m.linkname='/tmp/forbidden'
        if kind=='owner':m.uid+=1
        t.addfile(m)
        if kind=='duplicate':t.addfile(m)
    return raw.getvalue()
with tempfile.TemporaryDirectory() as tmp:
    for kind in ['good','link','traversal','owner','duplicate']:
        p=Path(tmp)/kind;p.write_bytes(make(kind))
        try:archive_members(p,data,lambda:None)
        except AssertionError:assert kind!='good'
        else:assert kind=='good'
`))
test('real Node to Python stdin CLI exceeds single-argument limit and safely rejects invalid tools before output',()=>{
 const values={python:process.env.C25_TEST_PYTHON,tools:'/not-the-approved-tools',output:'/workspace/scratch/5a77e8bdc1ae/c25-build-evidence/c26-analysis-recovery-01',restore:'/tmp/c25-c26-analysis-restore-01','expected-head':'a'.repeat(40)}
 const v=invocation(Object.entries(values).flatMap(([k,val])=>['--'+k,val]));assert.deepEqual(v.args.slice(0,2),['-B','-']);assert.ok(Buffer.byteLength(v.input)>131072)
 assert.equal(v.input,pythonProgram);assert.equal(v.args[v.args.indexOf('--expected-inline-sha256')+1],createHash('sha256').update(v.input).digest('hex'))
 const r=spawnSync(v.python,v.args,{input:v.input,encoding:'utf8',timeout:10000,maxBuffer:1024**2,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}})
 assert.ifError(r.error);assert.notEqual(r.status,0);assert.match(r.stderr,/AssertionError/);assert.doesNotMatch(r.stderr,/Argument list too long|SyntaxError/)
 for(const key of ['output','restore'])assert.throws(()=>invocation(Object.entries({...values,[key]:'/tmp/old-existing'}).flatMap(([k,val])=>['--'+k,val])))
})
test('current lineage drift rejects before creating output or spawning tar',()=>python(String.raw`
import copy,tempfile,threading
from unittest import mock
full=expected_repaired_full();full[1]['mtimeNs']+=1
class Guard:
    minimum={};error=None
    def start(self):pass
    def stop(self):pass
    def check(self):return {'workspaceFreeBytes':20*1024**3,'tmpFreeBytes':3*1024**3,'memAvailableBytes':5*1024**3}
with tempfile.TemporaryDirectory() as tmp:
    output=Path(tmp)/'new';restore=Path(tmp)/'extract';calls=[]
    argv=['adapter','--tools',str(ROOT/'eduk12_tools_20261018'),'--output',str(output),'--restore',str(restore),'--expected-head','a'*40,'--expected-producer-sha256',sha_file(PRODUCER),'--expected-inline-sha256','b'*64,'--expected-python-sha256',sha_file(Path(sys.executable).resolve())]
    with mock.patch.object(sys,'argv',argv),mock.patch('fcntl.flock'),mock.patch.dict(main.__globals__,ResourceGuard=Guard,output_paths=lambda *_:(output,restore),producer_binding=lambda *_:{'inlinePythonSha256':'b'*64},validate_current=lambda:{},stopped_current=lambda *_:{},frozen_failure_manifest=lambda *_:full),mock.patch('subprocess.Popen',side_effect=AssertionError('no spawn')):
        try:main()
        except AssertionError as e:assert str(e)=='current physical source differs from exact A07 repair lineage'
        else:raise AssertionError('lineage drift accepted')
    assert not output.exists() and not restore.exists()
`))
test('EXTRACT refusal retains only failed compressed attempt and never creates restore or publishes descriptor',()=>python(String.raw`
import tempfile
from unittest import mock
full=expected_repaired_full();data=data_projection(full)
class Guard:
    minimum={};error=None
    def start(self):pass
    def stop(self):pass
    def check(self):return {'workspaceFreeBytes':20*1024**3,'tmpFreeBytes':A['RESERVE'],'memAvailableBytes':5*1024**3}
with tempfile.TemporaryDirectory() as tmp:
    output=Path(tmp)/'new';restore=Path(tmp)/'extract';calls=[]
    argv=['adapter','--tools',str(ROOT/'eduk12_tools_20261018'),'--output',str(output),'--restore',str(restore),'--expected-head','a'*40,'--expected-producer-sha256',sha_file(PRODUCER),'--expected-inline-sha256','b'*64,'--expected-python-sha256',sha_file(Path(sys.executable).resolve())]
    def child(argv,log,seconds,guard,writer,deadline):
        calls.append(log.name)
        assert 0<seconds<=300
        if log.name=='archive.log':
            assert '/usr/bin/xz --threads=1 --memlimit-compress=128MiB --no-adjust -6' in argv
            (output/'archive.part').write_bytes(b'pure-fake-compression-not-current-data')
        else:assert list(map(str,argv))==['/usr/bin/xz','--memlimit-decompress=128MiB','-t',str(output/'archive.part')]
        writer.bytes(log,b'');return {'exitCode':0,'logSha256':sha_file(log)}
    patched=dict(ResourceGuard=Guard,output_paths=lambda *_:(output,restore),producer_binding=lambda *_:{'inlinePythonSha256':'b'*64},validate_current=lambda:{},stopped_current=lambda *_:{},frozen_failure_manifest=lambda *_:full,data_manifests=lambda *_:data,nondata_manifest=lambda *_:[],historical_recovery_manifest=lambda:{},bounded_archive_pipe=child,archive_members=lambda *_:None)
    with mock.patch.object(sys,'argv',argv),mock.patch('fcntl.flock'),mock.patch.dict(main.__globals__,patched),mock.patch('subprocess.Popen',side_effect=AssertionError('no spawn')):
        try:main()
        except AssertionError as e:assert str(e)=='split-filesystem admission below original floors'
        else:raise AssertionError('short tmp space accepted')
    assert calls==['archive.log','xz-integrity.log'] and (output/'archive.part').is_file()
    assert not restore.exists() and not (output/NAMES['descriptor']).exists()
    failure=json.loads((output/'archive-failure-private.json').read_text());assert failure['passed'] is False and len(failure['steps'])==2
`))
