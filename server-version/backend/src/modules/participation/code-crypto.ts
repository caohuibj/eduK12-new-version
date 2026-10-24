import {createHmac,scrypt,createHash,randomBytes} from 'node:crypto'
import {BoundedAdmissionGate} from '../../services/boundedAdmissionGate'

export const normalizeShortCode=(value:string)=>value.normalize('NFKC').trim().toUpperCase()
export const validShortCode=(value:string)=>/^[A-Z0-9\u4e00-\u9fa5]{1,20}$/.test(value)
export function parseMemorableCode(value:string):{prefix:string;suffix:string}|null{
  if(value.length>64)return null
  const text=value.normalize('NFKC').trim().toUpperCase(),split=text.lastIndexOf('-')
  const prefix=text.slice(0,split),suffix=text.slice(split+1)
  return split>0&&validShortCode(prefix)&&/^[A-Z0-9]{4,12}$/.test(suffix)?{prefix,suffix}:null
}
export const codeCredentialHash=(secret:string)=>createHash('sha256').update(secret).digest('hex')
/** Shared mechanisms only; callers select a fixed product namespace, never user input.
 * Survey's original namespace/encoding remain byte-for-byte compatible. */
export function createParticipationCodeCrypto(namespace:string,codePrefix:string,registryPrefix:string,gateName:string){
 const gate=new BoundedAdmissionGate({name:gateName,maxConcurrent:4,maxQueue:8,maxWaitMs:1000})
function codeKey(context:string):Buffer{
  const raw=process.env.DATA_ENCRYPTION_KEY
  if(!raw||!/^[a-f0-9]{64}$/i.test(raw))throw new Error('Participant code key unavailable')
  return createHmac('sha256',Buffer.from(raw,'hex')).update(namespace+'\0'+context).digest()
}
/** Project- and reset-generation-specific, deliberately slow; no user code is stored. */
async function memorableCredential(projectId:string,prefix:string,suffix:string,version:number):Promise<string>{
  return gate.run(()=>new Promise<string>((resolve,reject)=>{
    scrypt(prefix+'-'+suffix,codeKey(projectId+':'+version),32,{N:16384,r:8,p:1,maxmem:32*1024*1024},
      (error,key)=>error?reject(error):resolve(key.toString('base64url')))
  }))
}
const resetCodeHash=(projectId:string,value:string)=>createHmac('sha256',codeKey('reset:'+projectId)).update(value).digest('hex')

// SELF_CODE remains the stored mode identifier for compatibility with frozen studies.
// Its portable credential is now issued ONLY by the server, with 100 random bits.
const codeAlphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const encodeCodeBytes=(bytes:Buffer)=>Array.from(bytes,byte=>codeAlphabet[byte&31]).join('')
function generateStudyCode():string{
 const value=encodeCodeBytes(randomBytes(20))
 return codePrefix+'-'+value.match(/.{5}/g)!.join('-')
}
function normalizeGeneratedCode(value:string):string|null{
 if(value.length>64)return null
 const text=value.normalize('NFKC').trim().toUpperCase()
 const alphabet='[0-9A-HJKMNP-TV-Z]'
 if(!new RegExp('^'+codePrefix+'(?:-'+alphabet+'{5}){4}$').test(text)&&!new RegExp('^'+codePrefix+alphabet+'{20}$').test(text))return null
 const body=text.slice(codePrefix.length).replace(/-/g,'')
 return codePrefix+'-'+body.match(/.{5}/g)!.join('-')
}
// Separate namespace from the legacy 20-hex-character self-chosen-code registry.
// A legacy value (even one resembling HS2) can never authenticate a generated row.
const generatedCodeLookup=(projectId:string,value:string)=>registryPrefix+encodeCodeBytes(
 createHmac('sha256',codeKey('generated-code-lookup-v2:'+projectId)).update(value).digest().subarray(0,19))

 return {codeKey,memorableCredential,resetCodeHash,generateStudyCode,normalizeGeneratedCode,generatedCodeLookup}
}
