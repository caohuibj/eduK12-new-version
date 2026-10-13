import test from 'node:test';
import assert from 'node:assert/strict';
import inventory from './cos-inventory.cjs';
test('current and all versions paginate independently and count duplicate candidates only',async()=>{
  const call=async(method,args)=>{
    if(method==='getBucket'&&!args.Marker)return {Contents:[{Key:'one/x',Size:'9',ETag:'same',StorageClass:'STANDARD'}],IsTruncated:'true',NextMarker:'one/x'};
    if(method==='getBucket')return {Contents:[{Key:'two/x',Size:'9',ETag:'same',StorageClass:'STANDARD_IA'}],IsTruncated:false};
    if(!args.KeyMarker)return {Versions:[{Key:'one/x',VersionId:'a',Size:'9',IsLatest:true}],IsTruncated:true,NextKeyMarker:'one/x',NextVersionIdMarker:'a'};
    return {Versions:[{Key:'one/x',VersionId:'old',Size:'3',IsLatest:false},{Key:'two/x',VersionId:'b',Size:'9',IsLatest:true}],DeleteMarkers:[{Key:'gone',VersionId:'m',IsLatest:false}],IsTruncated:false};
  };
  const result=await inventory.inventory(call);
  assert.equal(result.mode,'read_only');
  for(const b of result.buckets){assert.equal(b.currentBytes,18);assert.equal(b.allVersionBytes,21);assert.equal(b.noncurrentBytes,3);assert.equal(b.extraCopyCandidateBytes,9);assert.match(b.duplicateStatus,/NOT_CONTENT_OR_REFERENCE_VERIFIED/);}
});
test('missing or repeated cursor never produces a complete inventory',async()=>{
  for(const reply of [{IsTruncated:true},{IsTruncated:true,NextMarker:'same'}]){
    await assert.rejects(inventory.pages(async()=>reply,'getBucket',{},['Contents'],[['Marker','NextMarker']]),/PAGINATION_INCOMPLETE/);
  }
});
test('overlapping pages and invalid sizes are refused',async()=>{
  const row={Key:'a',Size:'5'};let n=0;
  await assert.rejects(inventory.pages(async()=>({Contents:[row],IsTruncated:n++===0,NextMarker:'a'}),'getBucket',{},['Contents'],[['Marker','NextMarker']]),/INVENTORY_DUPLICATE_PAGE/);
  assert.throws(()=>inventory.summarize([{Key:'a',Size:'NaN'}],[]),/OBJECT_SIZE_INVALID/);
});
