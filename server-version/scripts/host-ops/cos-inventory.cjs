// Read-only paginated capacity and duplicate-candidate inventory. No object mutation methods.
const fs=require('node:fs');
const BUCKETS=['ptool-videos-edu-1393949445','eduk12-backups-1393949445'];
const need=(ok,code)=>{if(!ok)throw Error(code);};
const yes=v=>v===true||v==='true';
async function pages(call,method,params,fields,markers){
  const out=[];let next={},seen=new Set(),tokens=new Set();
  for(let page=0;page<200;page++){
    const r=await call(method,{...params,MaxKeys:1000,...next});
    for(const field of fields)for(const v of r[field]||[]){
      const id=JSON.stringify([field,v.Key,v.VersionId||'']);
      need(!seen.has(id),'INVENTORY_DUPLICATE_PAGE');seen.add(id);
      out.push({...v,kind:field});need(out.length<=100000,'INVENTORY_LIMIT');
    }
    if(!yes(r.IsTruncated))return out;
    next={};
    for(const [request,response] of markers)next[request]=r[response]||'';
    const token=JSON.stringify(next);need(Object.values(next)[0]&&!tokens.has(token),'PAGINATION_INCOMPLETE');tokens.add(token);
  }
  throw Error('PAGINATION_LIMIT');
}
function summarize(current,versions){
  let bytes=0,total=0,noncurrent=0,byStorageClass={},prefixes={},groups=new Map();
  for(const v of current){
    const n=Number(v.Size);need(Number.isSafeInteger(n)&&n>=0,'OBJECT_SIZE_INVALID');bytes+=n;
    const cls=v.StorageClass||'UNKNOWN';byStorageClass[cls]=(byStorageClass[cls]||0)+n;
    const prefix=v.Key.includes('/')?v.Key.split('/')[0]+'/':'(root)';prefixes[prefix]=(prefixes[prefix]||0)+n;
    if(n>0&&v.ETag){const id=JSON.stringify([v.ETag,n]);if(!groups.has(id))groups.set(id,[]);groups.get(id).push({key:v.Key,bytes:n,etag:v.ETag});}
  }
  for(const v of versions){
    const n=v.kind==='DeleteMarkers'?0:Number(v.Size);need(Number.isSafeInteger(n)&&n>=0,'VERSION_SIZE_INVALID');
    total+=n;if(!yes(v.IsLatest))noncurrent+=n;
  }
  const duplicates=[...groups.values()].filter(g=>g.length>1);
  return {currentObjects:current.length,currentBytes:bytes,allVersionBytes:total,noncurrentBytes:noncurrent,
    byStorageClass,prefixes,duplicateGroups:duplicates.length,
    extraCopyCandidateBytes:duplicates.reduce((n,g)=>n+(g.length-1)*g[0].bytes,0),
    duplicateStatus:'ETAG_SIZE_CANDIDATES_NOT_CONTENT_OR_REFERENCE_VERIFIED',duplicateCandidates:duplicates};
}
async function inventory(call){
  const buckets=[];
  for(const Bucket of BUCKETS){
    const base={Bucket,Region:'ap-beijing'};
    const current=await pages(call,'getBucket',base,['Contents'],[['Marker','NextMarker']]);
    const versions=await pages(call,'listObjectVersions',base,['Versions','DeleteMarkers'],[['KeyMarker','NextKeyMarker'],['VersionIdMarker','NextVersionIdMarker']]);
    buckets.push({bucket:Bucket,...summarize(current,versions)});
  }
  return {schema:1,at:new Date().toISOString(),status:'COMPLETE',mode:'read_only',buckets};
}
module.exports={pages,summarize,inventory};
if(require.main===module)(async()=>{
  const payload=JSON.parse(fs.readFileSync(0,'utf8'));
  need(payload.credentials?.COS_SECRET_ID&&payload.credentials.COS_SECRET_KEY,'COS_CREDENTIALS_REQUIRED');
  const COS=require('/app/node_modules/cos-nodejs-sdk-v5'),c=payload.credentials;
  const client=new COS({SecretId:c.COS_SECRET_ID,SecretKey:c.COS_SECRET_KEY,...(c.COS_SECURITY_TOKEN?{SecurityToken:c.COS_SECURITY_TOKEN}:{}),Timeout:30000});
  const allowed=new Set(['getBucket','listObjectVersions']);
  const call=(method,args)=>new Promise((resolve,reject)=>{need(allowed.has(method),'READ_ONLY_METHOD_REQUIRED');client[method](args,(e,r)=>e?reject(e):resolve(r));});
  console.log(JSON.stringify(await inventory(call)));
})().catch(()=>{console.error(JSON.stringify({status:'FAILED',error:'COS_INVENTORY_FAILED'}));process.exitCode=1;});
