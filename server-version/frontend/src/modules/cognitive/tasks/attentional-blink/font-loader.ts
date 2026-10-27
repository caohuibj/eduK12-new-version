import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import fontUrl from './assets/LiberationSans-Regular.ttf?url'
import {BLINK_FONT} from './generated/font'
export async function loadBlinkFont():Promise<{release:()=>void}>{const response=await fetch(fontUrl);if(!response.ok)throw Error('Blink font unavailable');const bytes=await response.arrayBuffer();if(bytesToHex(sha256(new Uint8Array(bytes)))!==BLINK_FONT.sha256)throw Error('Blink font hash mismatch')
 const face=new FontFace('EduBlinkLiberationSans',bytes);await face.load();document.fonts.add(face);if(!document.fonts.check('40px EduBlinkLiberationSans')){document.fonts.delete(face);throw Error('Blink font not ready')}return {release:()=>{document.fonts.delete(face)}}}
