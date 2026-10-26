import {clone,type RecognitionContext,type Asset} from './contracts'
import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
export function validateContext(value:RecognitionContext,syntheticReview=false):RecognitionContext {
  const c=clone(value), hex=(s:string)=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)
  if(!c.contextKey||c.contextKey.length>512||!hex(c.configHash)||!hex(c.protocolSignature)||!hex(c.manifestHash)
    ||!c.randomSeed||c.randomSeed.length>256||c.presentationApproval!=='recognition-300-css-single-seen-20261026')throw Error('Frozen host context and approved geometry are required')
  const p=c.config,total=p.profile==='research'?260:p.profile==='experience'?100:0,t=total===260?60:20
  if(!total||p.imageMs!==750||p.isiMs!==800||p.generatorVersion!=='seeded-blocks-0.1.0'
    ||p.responseRule!=='image-and-following-isi-half-open-0.1.0')throw Error('Unapproved frozen protocol')
  const m=c.manifest,ids=[...p.formalAssetIds,...p.practiceAssetIds]
  if(new Set(ids).size!==ids.length||p.practiceAssetIds.length!==6||p.formalAssetIds.length<(total===260?184:74))throw Error('Asset pools must be adequate and isolated')
  if(m.formal.length!==total||m.targetPairs.length!==t||m.practice.length!==8)throw Error('Incomplete frozen manifest')
  const counts={'target-first':0,'target-repeat':0,'filler-first':0,'vigilance-repeat':0}
  const first=new Map<string,number>()
  m.formal.forEach((r,i)=>{
    if(r.index!==i||r.block!==Math.floor(i/4)+1||r.slot!==i%4||!p.formalAssetIds.includes(r.assetId)
      ||!(r.kind in counts)||r.plannedOnsetMs!==i*1550||r.plannedImageOffsetMs!==i*1550+750||r.plannedWindowEndMs!==(i+1)*1550)throw Error('Frozen presentation sequence mismatch')
    counts[r.kind]++
    if(r.kind==='target-first'||r.kind==='filler-first'){if(first.has(r.assetId)||r.firstIndex!==null)throw Error('Duplicate first identity');first.set(r.assetId,i)}
    else if(r.firstIndex!==first.get(r.assetId))throw Error('Repeat pairing mismatch')
  })
  if(counts['target-first']!==t||counts['target-repeat']!==t||counts['filler-first']!==(total===260?124:54)||counts['vigilance-repeat']!==(total===260?16:6))throw Error('Frozen counts mismatch')
  for(const pair of m.targetPairs){const a=m.formal[pair.firstIndex],b=m.formal[pair.repeatIndex]
    if(!a||!b||a.kind!=='target-first'||b.kind!=='target-repeat'||a.assetId!==b.assetId||a.assetId!==pair.assetId||b.firstIndex!==a.index||pair.lagImages!==b.index-a.index)throw Error('Frozen target pair mismatch')}
  const practiceOrder=[0,1,2,0,3,1,4,5]
  if(m.practice.some((r,i)=>r.index!==i||r.assetId!==p.practiceAssetIds[practiceOrder[i]]||r.seenBefore!==(practiceOrder.indexOf(practiceOrder[i])<i)))throw Error('Frozen independent practice mismatch')
  const a=c.assetManifest
  if((a.status!=='authorized'&&!(syntheticReview&&a.status==='synthetic-review-only'))||!hex(a.manifestHash)||!a.evidenceRef)throw Error('No explicit authorized asset manifest')
  const byId=new Map<string,Asset>()
  for(const item of a.assets){if(byId.has(item.assetId)||!hex(item.sha256)||!item.url||item.width<=0||item.width>1024||item.width!==item.height)throw Error('Missing/ambiguous or unapproved image geometry');byId.set(item.assetId,item)}
  for(const id of [...new Set(m.formal.map(r=>r.assetId)),...p.practiceAssetIds])if(!byId.has(id))throw Error('Missing frozen image asset')
  return c
}
/** Preparation-only fetch+SHA256 verification, four workers, 2MiB/image, 64MiB bytes and 50M decoded pixels.
 * The verified bytes become a private ObjectURL used by the displayed decoded image; never refetch in formal stage. */
export async function decodeAssets(c:RecognitionContext,makeImage:()=>HTMLImageElement=()=>new Image(),
  fetchImage:typeof fetch=fetch):Promise<Map<string,HTMLImageElement>> {
  const used=new Set([...c.manifest.formal.map(r=>r.assetId),...c.config.practiceAssetIds])
  const assets=c.assetManifest.assets.filter(a=>used.has(a.assetId)),decoded=new Map<string,HTMLImageElement>()
  if(assets.length>190||assets.reduce((n,a)=>n+a.width*a.height,0)>50_000_000)throw Error('Image preparation pixel budget exceeded')
  const abort=new AbortController();let next=0,totalBytes=0
  try{await Promise.all(Array.from({length:Math.min(4,assets.length)},async()=>{
    while(next<assets.length&&!abort.signal.aborted){const a=assets[next++]
      const response=await fetchImage(a.url,{signal:abort.signal,cache:'force-cache',credentials:'same-origin'})
      if(!response.ok||Number(response.headers.get('content-length'))>2*1024*1024)throw Error('Image response failed or exceeds byte budget')
      const chunks:Uint8Array[]=[],reader=response.body?.getReader();let length=0
      if(!reader)throw Error('Bounded image stream is required')
      while(true){const item=await reader.read();if(item.done)break
        length+=item.value.byteLength;totalBytes+=item.value.byteLength
        if(length>2*1024*1024||totalBytes>64*1024*1024){await reader.cancel();throw Error('Image preparation byte budget exceeded')}
        chunks.push(item.value)
      }
      const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength}
      if(bytesToHex(sha256(bytes))!==a.sha256)throw Error('Actual image bytes do not match frozen SHA256')
      const image=makeImage(),url=URL.createObjectURL(new Blob([bytes],{type:response.headers.get('content-type')??'application/octet-stream'}))
      try{image.decoding='sync';image.src=url;await image.decode()
        if(abort.signal.aborted||image.naturalWidth!==a.width||image.naturalHeight!==a.height||!image.complete)throw Error('Decoded image does not match bound dimensions')
        image.alt='';image.draggable=false;decoded.set(a.assetId,image)
      }catch(error){URL.revokeObjectURL(url);throw error}
    }
  }))}catch(error){abort.abort();releaseDecodedAssets(decoded);throw error}
  if(decoded.size!==used.size){releaseDecodedAssets(decoded);throw Error('Some frozen images have not decoded')}
  return decoded
}
export function releaseDecodedAssets(images:Map<string,HTMLImageElement>){for(const image of images.values()){
  image.onerror=null;if(image.src.startsWith('blob:'))URL.revokeObjectURL(image.src)
}images.clear()}
