'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const BUCKET = 'ptool-videos-edu-1393949445';
const REGION = 'ap-beijing';
const PUBLIC = 'http://cam.qcloud.com/groups/global/AllUsers';
function normalize(acl) {
  if (!acl?.Owner?.ID || !Array.isArray(acl.Grants)) throw Error('ORIGIN_ACL_INVALID');
  const grants = acl.Grants.map(g => ({permission:g.Permission, id:g.Grantee?.ID || null, uri:g.Grantee?.URI || null}));
  grants.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {owner:acl.Owner.ID, grants};
}
function hash(acl) { return crypto.createHash('sha256').update(JSON.stringify(normalize(acl))).digest('hex'); }
function ownerOnly(acl) {
  const a=normalize(acl);
  return a.grants.length===1 && a.grants[0].permission==='FULL_CONTROL' && a.grants[0].id===a.owner && !a.grants[0].uri;
}
function publicDefault(acl) {
  const a=normalize(acl);
  return a.grants.length===2 && a.grants.filter(g=>g.permission==='FULL_CONTROL'&&g.id===a.owner&&!g.uri).length===1
    && a.grants.filter(g=>g.permission==='READ'&&g.uri===PUBLIC&&!g.id).length===1;
}
async function protect(client, expectedHash) {
  const base={Bucket:BUCKET,Region:REGION}, before=await client('getBucketAcl',base);
  if(ownerOnly(before))return {changed:false, private:true};
  if(hash(before)!==expectedHash)throw Error('ORIGIN_ACL_CHANGED');
  if(!publicDefault(before))throw Error('ORIGIN_CUSTOM_GRANTS_REQUIRE_REVIEW');
  await client('putBucketAcl',{...base,ACL:'private'});
  const after=await client('getBucketAcl',base);
  if(!ownerOnly(after))throw Error('ORIGIN_NOT_PRIVATE');
  return {changed:true,private:true};
}
async function main() {
  const x=JSON.parse(fs.readFileSync(0,'utf8'));
  if(process.env.COS_BUCKET!==BUCKET||process.env.COS_REGION!==REGION)throw Error('ORIGIN_TARGET_MISMATCH');
  const COS=require('cos-nodejs-sdk-v5');
  const sdk=new COS({SecretId:process.env.COS_SECRET_ID,SecretKey:process.env.COS_SECRET_KEY,
    ...(process.env.COS_SECURITY_TOKEN?{SecurityToken:process.env.COS_SECURITY_TOKEN}:{}),Timeout:15000});
  const client=(method,params)=>new Promise((resolve,reject)=>sdk[method](params,(error,data)=>error?reject(Error('ORIGIN_API_FAILED')):resolve(data)));
  if(x.command==='inspect') {
    const acl=await client('getBucketAcl',{Bucket:BUCKET,Region:REGION});
    console.log(JSON.stringify({acl:normalize(acl),fingerprint:hash(acl),private:ownerOnly(acl),publicDefault:publicDefault(acl)}));
  } else if(x.command==='protect')console.log(JSON.stringify(await protect(client,x.expectedHash)));
  else throw Error('ORIGIN_COMMAND_DENIED');
}
module.exports={normalize,hash,ownerOnly,publicDefault,protect};
if(require.main===module)main().catch(error=>{console.error(/^[A-Z_]{3,80}$/.test(error.message)?error.message:'ORIGIN_OPERATION_FAILED');process.exitCode=1;});
