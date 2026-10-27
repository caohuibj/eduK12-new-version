import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {GRAD_ASSETS} from './generated/assets'
const source=import.meta.glob('./assets/*.png',{eager:true,query:'?url',import:'default'}) as Record<string,string>
export interface GradLoadedAssets {urls:Record<string,string>;release:()=>void}
/** Decode original bytes before presenting, using task-owned blob URLs so an asset change cannot silently replace the frozen photographs. */
export async function loadGradAssets():Promise<GradLoadedAssets>{const urls:Record<string,string>={},release=()=>Object.values(urls).forEach(url=>URL.revokeObjectURL(url))
 try{for(const asset of GRAD_ASSETS){const response=await fetch(source['./assets/'+asset.file]);if(!response.ok)throw Error('GradCPT image unavailable');const bytes=new Uint8Array(await response.arrayBuffer());if(bytesToHex(sha256(bytes))!==asset.sha256)throw Error('GradCPT image hash mismatch')
  const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));urls[asset.file]=url;const image=new Image();image.src=url;await image.decode();if(image.naturalWidth!==309||image.naturalHeight!==256)throw Error('GradCPT original image dimensions differ')}
  return {urls,release}
 }catch(error){release();throw error}}
