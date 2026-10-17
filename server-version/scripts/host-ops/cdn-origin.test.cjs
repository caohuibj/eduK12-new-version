'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {hash,ownerOnly,publicDefault,protect}=require('./cdn-origin.cjs');
const owner={Grantee:{ID:'owner'},Permission:'FULL_CONTROL'};
const publicRead={Grantee:{URI:'http://cam.qcloud.com/groups/global/AllUsers'},Permission:'READ'};
const acl=grants=>({Owner:{ID:'owner'},Grants:grants});
test('only inherited public read is removed; custom identities cannot be discarded',async()=>{
 const before=acl([owner,publicRead]),after=acl([owner]),calls=[];let current=before;
 assert.equal(publicDefault(before),true);assert.equal(ownerOnly(after),true);
 const client=async(method,params)=>{calls.push({method,params});if(method==='putBucketAcl'){current=after;return {}}return current;};
 assert.deepEqual(await protect(client,hash(before)),{changed:true,private:true});
 assert.deepEqual(calls.filter(x=>x.method==='putBucketAcl'),[{method:'putBucketAcl',params:{Bucket:'ptool-videos-edu-1393949445',Region:'ap-beijing',ACL:'private'}}]);
 assert.deepEqual(await protect(client,hash(before)),{changed:false,private:true});
 const custom=acl([owner,publicRead,{Grantee:{ID:'other'},Permission:'READ'}]);
 await assert.rejects(()=>protect(async()=>custom,hash(custom)),/CUSTOM_GRANTS/);
 await assert.rejects(()=>protect(async()=>before,'0'.repeat(64)),/ACL_CHANGED/);
});
test('wrong-owner and public write states cannot qualify as private or canned public read',()=>{
 for(const value of [acl([]),acl([publicRead]),acl([{Grantee:{ID:'other'},Permission:'FULL_CONTROL'}]),acl([owner,{...publicRead,Permission:'WRITE'}])]){
  assert.equal(ownerOnly(value),false);assert.equal(publicDefault(value),false);
 }
 assert.equal(hash(acl([owner,publicRead])),hash(acl([publicRead,owner])));
});
