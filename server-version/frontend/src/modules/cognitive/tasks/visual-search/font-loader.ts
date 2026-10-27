import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import fontUrl from './assets/LiberationSans-Regular.ttf?url'
import {SEARCH_FONT} from './generated/font'
export async function loadSearchFont():Promise<{release:()=>void}>{const response=await fetch(fontUrl);if(!response.ok)throw Error('Search font unavailable');const bytes=await response.arrayBuffer();if(bytesToHex(sha256(new Uint8Array(bytes)))!==SEARCH_FONT.sha256)throw Error('Search font hash mismatch')
 const face=new FontFace('EduVisualSearchLiberationSans',bytes);await face.load();document.fonts.add(face);if(!document.fonts.check('40px EduVisualSearchLiberationSans')){document.fonts.delete(face);throw Error('Search font not ready')}return {release:()=>{document.fonts.delete(face)}}}
