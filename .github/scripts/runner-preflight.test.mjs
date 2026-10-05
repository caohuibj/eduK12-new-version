import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { resourceErrors, requireFreePort, effectiveMemory } from './runner-preflight.mjs';
const GiB=1024**3;
test('heavy capacity guard rejects unsafe OS and resources without applying it to hosted VMs',()=>{
  const ready={environment:'self-hosted',os:'linux',freeBytes:30*GiB,memoryBytes:8*GiB,light:false};
  assert.deepEqual(resourceErrors(ready),[]);
  for(const override of [{os:'darwin'},{os:'win32'},{freeBytes:3*GiB},{memoryBytes:4*GiB}])
    assert.ok(resourceErrors({...ready,...override}).length);
  assert.deepEqual(resourceErrors({...ready,environment:'github-hosted',freeBytes:3*GiB}),[]);
  assert.deepEqual(resourceErrors({...ready,os:'darwin',light:true,freeBytes:6*GiB,memoryBytes:3*GiB}),[]);
  assert.ok(resourceErrors({...ready,os:'darwin',light:true,freeBytes:3*GiB}).length);
});
test('occupied application port fails instead of trusting a previous process',async()=>{
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const {port}=server.address();
  try {await assert.rejects(requireFreePort(port),{code:'EADDRINUSE'});}
  finally {await new Promise(resolve=>server.close(resolve));}
  await requireFreePort(port);
});

test('capacity follows the tightest cgroup limit, not the larger WSL total',()=>{
  const limits={
    '/sys/fs/cgroup/system.slice/runner.service/memory.max': 'max',
    '/sys/fs/cgroup/system.slice/memory.max': String(5*GiB),
    '/sys/fs/cgroup/memory.max': String(9*GiB),
  };
  const read=path=>{
    if(!(path in limits)) throw Object.assign(new Error('missing'),{code:'ENOENT'});
    return limits[path];
  };
  assert.equal(effectiveMemory(10*GiB,'0::/system.slice/runner.service',read),5*GiB);
  assert.equal(effectiveMemory(10*GiB,'0::/',read),9*GiB);
  assert.equal(effectiveMemory(4*GiB,'0::/system.slice/runner.service',read),4*GiB);
  assert.equal(effectiveMemory(10*GiB,'5:memory:/runner',path=>path.endsWith('/runner/memory.limit_in_bytes') ? String(5*GiB) : String(20*GiB)),5*GiB);
  assert.throws(()=>effectiveMemory(10*GiB,'0::/runner',()=> 'broken'));
  assert.throws(()=>effectiveMemory(10*GiB,'0::/runner',()=>{throw Object.assign(new Error('denied'),{code:'EACCES'});}));
});

test('Mac control and frontend have different disk reserves and do not require Docker ports',()=>{
  const base={environment:'self-hosted',os:'darwin',freeBytes:9*GiB,memoryBytes:8*GiB,light:false};
  assert.deepEqual(resourceErrors({...base,frontend:true}),[]);
  assert.ok(resourceErrors({...base,frontend:true,freeBytes:7*GiB}).length);
  assert.deepEqual(resourceErrors({...base,control:true,freeBytes:2*GiB,memoryBytes:1*GiB}),[]);
  assert.ok(resourceErrors({...base,control:true,freeBytes:0.5*GiB}).length);
});
