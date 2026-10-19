/** Pure injected /proc fixtures only. No real /proc reads, child or service. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {createProcSocketReader,parseProcInet,parseProcUnix} from './c25-c26-proc-sockets.mjs'

const inetHeader='  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n'
const unixHeader='Num       RefCount Protocol Flags    Type St Inode Path\n'
const inetRow=(inode,{local='0100007F:9CA6',remote='0100007F:1539',state='01'}={})=>`  0: ${local} ${remote} ${state} 00000000:00000000 00:00000000 00000000 1000 0 ${inode} 1 0000000000000000 100 0 0 10 0\n`
const stat=(pid,{startTicks=String(pid*10),parentPid=1,processGroupId=pid,userTicks=4,systemTicks=2,state='S'}={})=>{
 const fields=[state,parentPid,processGroupId,0,0,0,0,0,0,0,0,userTicks,systemTicks,0,0,0,0,1,0,startTicks,0,1]
 return `${pid} (a ) tricky\ncomm) ${fields.join(' ')}\n`
}
function fixture(){
 const owners=[{pid:10,startTicks:'100',processGroupId:10,role:'pg_postmaster'},{pid:20,startTicks:'200',processGroupId:20,role:'api'},{pid:30,startTicks:'300',processGroupId:30,role:'observer'},{pid:40,startTicks:'400',processGroupId:40,role:'report_worker'},{pid:50,startTicks:'500',processGroupId:50,role:'redis'}]
 const texts=new Map(),links=new Map(),dirs=new Map(),events=[],counts=new Map();let time=0
 const h={owners,texts,links,dirs,events,counts,before:null,remaining:80000,setTime:value=>{time=value}}
 for(const pid of [10,20,30,40,50,11,102,103]){
  texts.set(`/proc/${pid}/stat`,stat(pid,[11,102,103].includes(pid)?{parentPid:10,processGroupId:10}:{}));texts.set(`/proc/${pid}/status`,'Name:\tsynthetic\nVmRSS:\t4 kB\nVmHWM:\t8 kB\n')
  links.set(`/proc/${pid}/ns/net`,'net:[999]');dirs.set(`/proc/${pid}/fd`,[])
 }
 links.set('/proc/self/ns/net','net:[999]');dirs.set('/proc/10/task',['10','12']);texts.set('/proc/10/task/10/children','11 102 ');texts.set('/proc/10/task/12/children','103 ')
 const fd=(pid,number,inode)=>{dirs.get(`/proc/${pid}/fd`).push(String(number));links.set(`/proc/${pid}/fd/${number}`,`socket:[${inode}]`)}
 fd(20,7,'200');fd(30,8,'300');fd(40,9,'400');fd(50,10,'500');fd(102,11,'600');fd(40,12,'700')
 // A non-loopback established connection remains visible for attribution to
 // reject if it belongs to the measurement's PG connection, never normalized.
 texts.set('/proc/net/tcp',inetHeader+inetRow('200')+inetRow('500',{local:'00000000:18EB',remote:'00000000:0000',state:'0A'})+inetRow('600',{local:'0100007F:1539',remote:'0200007F:9CA7'}))
 texts.set('/proc/net/tcp6',inetHeader+inetRow('300',{local:'00000000000000000000000001000000:9CA7',remote:'00000000000000000000000001000000:1539'}))
 texts.set('/proc/net/udp',inetHeader+inetRow('700',{local:'0100007F:CF09',remote:'00000000:0000',state:'07'}));texts.set('/proc/net/udp6',inetHeader)
 texts.set('/proc/net/unix',unixHeader+'0000000000000000: 00000003 00000000 00000000 0001 03 400\n')
 const get=(op,path,map)=>{const key=`${op}:${path}`,count=(counts.get(key)??0)+1;counts.set(key,count);h.before?.(op,path,count);if(!map.has(path))throw Object.assign(new Error(`missing ${path}`),{code:'ENOENT'});return structuredClone(map.get(path))}
 const io={readText:path=>get('text',path,texts),readlink:path=>get('link',path,links),readdir:path=>get('dir',path,dirs)}
 h.read=createProcSocketReader({registry:{entries:()=>structuredClone(owners)},remainingMs:()=>h.remaining,record:e=>events.push(structuredClone(e)),io,now:()=>time,byteOrder:'LE'})
 return h
}

test('strict inet parsing returns bare native-endian IPv4/IPv6 and rejects malformed states, queues and Unix rows',()=>{
 const v4=parseProcInet(inetHeader+inetRow('7'))[0];assert.equal(v4.localAddress,'127.0.0.1');assert.equal(v4.localPort,40102);assert.equal(v4.remotePort,5433)
 assert.equal(parseProcInet(inetHeader+inetRow('7',{local:'7F000001:9CA6',remote:'7F000001:1539'}),{byteOrder:'BE'})[0].localAddress,'127.0.0.1')
 const ipv6=inetHeader+inetRow('8',{local:'00000000000000000000000001000000:9CA6',remote:'00000000000000000000000001000000:1539'})
 assert.equal(parseProcInet(ipv6,{family:6,byteOrder:'LE'})[0].localAddress,'::1')
 const mapped=inetHeader+inetRow('8',{local:'0000000000000000FFFF00000100007F:9CA6',remote:'00000000000000000000000001000000:1539'})
 assert.equal(parseProcInet(mapped,{family:6,byteOrder:'LE'})[0].localAddress,'::ffff:127.0.0.1')
 assert.throws(()=>parseProcInet(inetHeader+inetRow('7',{state:'FF'})),/unknown inet state/)
 assert.throws(()=>parseProcInet(inetHeader+inetRow('7').replace('00000000:00000000','no-queue')),/invalid inet queue/)
 assert.throws(()=>parseProcInet(inetHeader+' 0: broken\n'),/truncated/)
 assert.throws(()=>parseProcUnix(unixHeader+'0: 00000003 00000000 00000000 9999 03 7\n'),/unknown unix socket type/)
})

test('reader preserves exact scoped PID/startTicks/PGID, every direct PG child and complete classified socket inventory',()=>{
 const h=fixture(),frame=h.read()
 assert.deepEqual(frame.processes.map(p=>p.pid),[10,20,30,40,50,11,102,103]);assert.deepEqual(frame.pgChildren.map(p=>p.pid),[11,102,103]);assert.ok(!h.counts.has('dir:/proc'))
 const api=frame.processes.find(p=>p.pid===20);assert.equal(api.startTicks,'200');assert.equal(api.processGroupId,20);assert.equal(api.userTicks,4);assert.equal(api.systemTicks,2);assert.equal(api.rssBytes,4096)
 assert.equal(frame.sockets.length,3);assert.ok(frame.sockets.every(s=>s.protocol==='tcp'&&s.state==='ESTABLISHED'));assert.equal(frame.socketInventory.length,6)
 assert.equal(frame.sockets.find(s=>s.ownerPid===30).localAddress,'::1');assert.equal(frame.sockets.find(s=>s.ownerPid===102).remoteAddress,'127.0.0.2')
 assert.deepEqual(frame.sockets.find(s=>s.ownerPid===20),{protocol:'tcp',family:4,localAddress:'127.0.0.1',localPort:40102,remoteAddress:'127.0.0.1',remotePort:5433,state:'ESTABLISHED',stateCode:'01',inode:'200',ownerPid:20,ownerStartTicks:'200',ownerProcessGroupId:20,ownerFd:7})
 assert.ok(frame.socketInventory.some(s=>s.protocol==='unix'&&s.inode==='400'));assert.ok(frame.socketInventory.some(s=>s.protocol==='udp'&&s.inode==='700'));assert.ok(frame.socketInventory.some(s=>s.state==='LISTEN'))
 assert.equal(frame.snapshotEvidence.attempts,1);assert.equal(h.events.length,1)
})

test('one complete racing snapshot can be retried with original actual samples retained, but ongoing changes and unknown inodes stop',()=>{
 const h=fixture();h.before=(op,path,count)=>{if(op==='link'&&path==='/proc/20/fd/7'&&count===2){h.links.set(path,'socket:[201]');h.texts.set('/proc/net/tcp',h.texts.get('/proc/net/tcp').replace(' 200 ',' 201 '))}}
 const frame=h.read();assert.equal(frame.snapshotEvidence.attempts,2);assert.equal(frame.sockets.find(s=>s.ownerPid===20).inode,'201')
 assert.equal(h.events[0].kind,'proc_socket_snapshot_failure');assert.equal(h.events[0].retryAllowed,true);assert.equal(h.events[0].processes.find(p=>p.pid===20).userTicks,4);assert.equal(frame.snapshotEvidence.discardedAttempts.length,1)
 const changing=fixture();changing.texts.set('/proc/net/tcp',changing.texts.get('/proc/net/tcp')+inetRow('201'))
 changing.before=(op,path,count)=>{if(op==='link'&&path==='/proc/20/fd/7')changing.links.set(path,`socket:[${count%2?'200':'201'}]`)}
 assert.throws(()=>changing.read(),/socket fd\/inode set changed/);assert.equal(changing.events.filter(e=>e.kind==='proc_socket_snapshot_failure').length,2);assert.equal(changing.counts.get('link:/proc/20/fd/7'),4)
 const unknown=fixture();unknown.links.set('/proc/20/fd/7','socket:[999]');assert.throws(()=>unknown.read(),/inode absent/);assert.equal(unknown.events.length,2);assert.equal(unknown.events.at(-1).retryAllowed,false)
})

test('PID reuse, changed groups, permissions, malformed rows and network namespaces fail closed without race retries',()=>{
 for(const fault of ['pid','group','permission','parse','namespace']){
  const h=fixture()
  if(fault==='pid')h.texts.set('/proc/20/stat',stat(20,{startTicks:'201'}))
  if(fault==='group')h.texts.set('/proc/20/stat',stat(20,{processGroupId:21}))
  if(fault==='permission')h.before=(op,path)=>{if(path==='/proc/20/fd')throw Object.assign(new Error('denied'),{code:'EACCES'})}
  if(fault==='parse')h.texts.set('/proc/net/tcp','invalid header\n')
  if(fault==='namespace')h.links.set('/proc/20/ns/net','net:[1000]')
  assert.throws(()=>h.read(),fault==='pid'?/PID reused/:fault==='group'?/process group/:fault==='permission'?/denied/:fault==='parse'?/header/:/namespace/)
  assert.equal(h.events.length,1);assert.equal(h.events[0].retryAllowed,false)
 }
 const reusedChild=fixture();reusedChild.read();reusedChild.texts.set('/proc/102/stat',stat(102,{startTicks:'9999',parentPid:10,processGroupId:10}));assert.throws(()=>reusedChild.read(),/PID reused/)
})

test('missing known workers stay explicit without zero CPU; required owners and original sample budgets still fail',()=>{
 const worker=fixture();worker.texts.delete('/proc/40/stat');const frame=worker.read();assert.deepEqual(frame.missingProcessIdentities,['40:400']);assert.equal(frame.processes.some(p=>p.pid===40),false)
 const api=fixture();api.texts.delete('/proc/20/stat');assert.throws(()=>api.read(),/required owned process missing/);assert.equal(api.events.length,1)
 const exhausted=fixture();exhausted.remaining=0;assert.throws(()=>exhausted.read(),/sample deadline/);assert.equal(exhausted.counts.size,0)
 const slow=fixture();slow.before=(op,path)=>{if(path==='/proc/net/tcp')slow.setTime(100)};assert.throws(()=>slow.read(),/sample deadline/);assert.equal(slow.events.length,1);assert.equal(slow.events[0].retryAllowed,false)
})

test('exact prepared-capable worker terminal stat preserves real CPU without invented RSS while reuse and other terminal roles fail',()=>{
 for(const moment of ['initial','after-status']){
  const h=fixture()
  if(moment==='initial')h.texts.set('/proc/40/stat',stat(40,{state:'Z',userTicks:17,systemTicks:9}))
  else h.before=(op,path,count)=>{if(op==='text'&&path==='/proc/40/stat'&&count===2)h.texts.set(path,stat(40,{state:'Z',userTicks:17,systemTicks:9}))}
  const frame=h.read();assert.equal(frame.processes.some(p=>p.pid===40),false);assert.deepEqual(frame.missingProcessIdentities,['40:400'])
  assert.equal(frame.terminatedProcessObservations[0].userTicks,17);assert.equal(frame.terminatedProcessObservations[0].systemTicks,9);assert.equal(frame.terminatedProcessObservations[0].state,'Z');assert.equal(frame.terminatedProcessObservations[0].rssObservation,'NOT_AVAILABLE_AFTER_TERMINATION')
 }
 const reused=fixture();reused.texts.set('/proc/40/stat',stat(40,{state:'Z'}));reused.before=(op,path,count)=>{if(op==='text'&&path==='/proc/40/stat'&&count===2)reused.texts.set(path,stat(40,{state:'Z',startTicks:'401'}))};assert.throws(()=>reused.read(),/terminated PID reused/)
 const api=fixture();api.texts.set('/proc/20/stat',stat(20,{state:'Z'}));assert.throws(()=>api.read(),/required process became terminal/)
})

test('real terminal PG child stat is separately preserved with complete child enumeration for observer rejection or exact retirement proof',()=>{
 const h=fixture();h.texts.set('/proc/102/stat',stat(102,{state:'Z',parentPid:10,processGroupId:10,userTicks:21,systemTicks:8}))
 const frame=h.read();assert.equal(frame.processes.some(p=>p.pid===102),false);assert.equal(frame.pgChildren.some(p=>p.pid===102),false)
 assert.deepEqual(frame.enumeratedPgChildIdentities.map(p=>p.pid),[11,102,103]);const ended=frame.terminatedPgChildObservations[0];assert.equal(ended.pid,102);assert.equal(ended.startTicks,'1020');assert.equal(ended.userTicks,21);assert.equal(ended.systemTicks,8);assert.equal(ended.state,'Z');assert.equal('rssBytes' in ended,false)
 const reused=fixture();reused.texts.set('/proc/102/stat',stat(102,{state:'Z',parentPid:10,processGroupId:10}));reused.before=(op,path,count)=>{if(op==='text'&&path==='/proc/102/stat'&&count===2)reused.texts.set(path,stat(102,{state:'Z',parentPid:10,processGroupId:10,startTicks:'1021'}))};assert.throws(()=>reused.read(),/terminated PID reused/)
})

test('explicitly absent children interface uses bounded complete PPID enumeration; churn, missing stat and denied interfaces never become empty',()=>{
 const setup=()=>{const h=fixture();h.texts.delete('/proc/10/task/10/children');h.dirs.set('/proc',['self','net','10','20','30','40','50','11','102','103']);return h}
 const good=setup(),frame=good.read();assert.equal(frame.snapshotEvidence.childEnumerationMethod,'COMPLETE_PROC_PPID');assert.equal(frame.snapshotEvidence.globalProcScans,2);assert.equal(frame.snapshotEvidence.globalProcRows,16);assert.deepEqual(frame.pgChildren.map(p=>p.pid),[11,102,103])
 for(const mode of ['churn','missing','permission','parse','pid-reuse']){
  const bad=setup()
  if(mode==='churn')bad.before=(op,path,count)=>{if(op==='dir'&&path==='/proc')bad.dirs.set('/proc',count%2?['10','20','30','40','50','11','102','103']:['10','20','30','40','50','11','102'])}
  if(mode==='missing')bad.dirs.get('/proc').push('999')
  if(mode==='permission')bad.before=(op,path)=>{if(path==='/proc/10/task/10/children')throw Object.assign(new Error('denied children interface'),{code:'EACCES'})}
  if(mode==='parse')bad.texts.set('/proc/103/stat','broken')
  if(mode==='pid-reuse')bad.before=(op,path,count)=>{if(op==='text'&&path==='/proc/102/stat'&&count===5)bad.texts.set(path,stat(102,{parentPid:10,processGroupId:10,startTicks:'999'}))}
  assert.throws(()=>bad.read());assert.ok(bad.events.filter(e=>e.kind==='proc_socket_snapshot_failure').length<=2)
  if(mode==='permission')assert.equal(bad.counts.has('dir:/proc'),false)
  if(mode==='churn'||mode==='missing')assert.equal(bad.events.filter(e=>e.kind==='proc_socket_snapshot_failure').length,2)
 }
})

test('PPID first scan pins child identity before the second stat and forbids PID reuse as a retry',()=>{
 const h=fixture();h.texts.delete('/proc/10/task/10/children');h.dirs.set('/proc',['10','20','30','40','50','11','102','103'])
 h.before=(op,path,count)=>{if(op==='text'&&path==='/proc/102/stat'&&count===2)h.texts.set(path,stat(102,{parentPid:10,processGroupId:10,startTicks:'999'}))}
 assert.throws(()=>h.read(),/PID reused or process group\/parent changed/);assert.equal(h.events.length,1);assert.equal(h.events[0].retryAllowed,false);assert.equal(h.counts.get('text:/proc/102/stat'),2)
})

test('owned socket selection ignores unrelated duplicates, deduplicates identical candidates and still parses every row',()=>{
 const h=fixture()
 h.texts.set('/proc/net/tcp',h.texts.get('/proc/net/tcp')+inetRow('200')+inetRow('999')+inetRow('0'))
 h.texts.set('/proc/net/udp',h.texts.get('/proc/net/udp')+inetRow('999',{state:'07'})+inetRow('0',{state:'07'}))
 const frame=h.read();assert.equal(frame.socketInventory.length,6);assert.equal(frame.sockets.length,3);assert.equal(frame.snapshotEvidence.equivalentOwnedRows,1);assert.equal(frame.snapshotEvidence.unreferencedOrZeroRows,4)
 assert.equal(frame.socketInventory.some(row=>['0','999'].includes(row.inode)),false);assert.equal(frame.snapshotEvidence.networkRowsParsed,11)
 const malformed=fixture();malformed.texts.set('/proc/net/udp6',inetHeader+'0: broken unreferenced row\n');assert.throws(()=>malformed.read(),/truncated/);assert.equal(malformed.events[0].retryAllowed,false)
})

test('owned socket conflicts preserve raw candidates and identity bracket without fabricated attribution or zero metrics',()=>{
 for(const variant of ['protocol','family','endpoint','state','unix-endpoint']){
  const h=fixture()
  if(variant==='protocol')h.texts.set('/proc/net/udp',h.texts.get('/proc/net/udp')+inetRow('200'))
  if(variant==='family')h.texts.set('/proc/net/tcp6',h.texts.get('/proc/net/tcp6')+inetRow('200',{local:'00000000000000000000000001000000:9CA6',remote:'00000000000000000000000001000000:1539'}))
  if(variant==='endpoint')h.texts.set('/proc/net/tcp',h.texts.get('/proc/net/tcp')+inetRow('200',{remote:'0200007F:1539'}))
  if(variant==='state')h.texts.set('/proc/net/tcp',h.texts.get('/proc/net/tcp')+inetRow('200',{state:'08'}))
  if(variant==='unix-endpoint')h.texts.set('/proc/net/unix',h.texts.get('/proc/net/unix')+'0: 00000003 00000000 00000000 0001 03 400 /different-endpoint\n')
  assert.throws(()=>h.read(),error=>error.code==='OWNED_SOCKET_ATTRIBUTION_NOT_OBSERVED')
  assert.equal(h.events.length,1);const event=h.events[0],proof=event.socketAttribution
  assert.equal(event.retryAllowed,false);assert.equal(proof.observation,'NOT_OBSERVED');assert.equal(proof.measurementComplete,false);assert.equal(proof.bracketVerified,true);assert.equal(proof.conflicts.length,1);assert.equal(proof.conflicts[0].candidates.length,2)
  assert.ok(proof.conflicts[0].candidates.every(x=>x.raw&&x.table&&x.line>=2&&x.normalized.inode===proof.conflicts[0].inode))
  assert.deepEqual(proof.fdBefore,proof.fdAfter);assert.equal(proof.identityBefore.length,proof.identityAfter.length);assert.ok(proof.conflicts[0].owners.every(fd=>proof.identityBefore.some(p=>p.pid===fd.ownerPid&&p.startTicks===fd.ownerStartTicks)))
  assert.equal('sockets' in event,false);assert.equal('measurementCpu' in event,false)
 }
 // An ambiguous candidate never excuses identity reuse during its bracket.
 const reused=fixture();reused.texts.set('/proc/net/udp',reused.texts.get('/proc/net/udp')+inetRow('200'))
 reused.before=(op,name,count)=>{if(op==='text'&&name==='/proc/20/stat'&&count===3)reused.texts.set(name,stat(20,{startTicks:'201'}))}
 assert.throws(()=>reused.read(),/PID reused/);assert.equal(reused.events[0].socketAttribution.bracketVerified,false);assert.equal(reused.events[0].socketAttribution.identityAfter.find(p=>p.pid===20).startTicks,'201')
})
