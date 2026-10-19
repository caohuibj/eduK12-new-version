import { createCipheriv, createDecipheriv, createSecretKey, randomBytes, type KeyObject } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'

// References carry no authoritative answers or scores. AES-GCM authenticates
// version, type, codec, length and all reference bytes; full source digests and
// the existing ownership/epoch/hash checks retain their independent roles.
const PREFIX='ekr1:',MAX=256*1024,DOMAIN=Buffer.from('eduk12:control-reference:v1:')
let active:{input:string;key:KeyObject}|undefined
const material=()=>{const input=process.env.DATA_ENCRYPTION_KEY;if(active&&input===active.input)return active.key
  if(!input||!/^[a-fA-F0-9]{64}$/.test(input))throw new Error('Control reference key unavailable')
  active={input,key:createSecretKey(Buffer.from(input,'hex'))};return active.key}
const hash=(value:unknown)=>{if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new Error('Control digest invalid');return Buffer.from(value,'hex')}
const integer=(value:unknown)=>{if(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>0x7fffffff)throw new Error('Control epoch invalid');const b=Buffer.alloc(4);b.writeUInt32BE(Number(value));return b}
const timestamp=(value:unknown)=>{if(typeof value!=='string')return null;const t=Date.parse(value);if(!Number.isSafeInteger(t)||t<0||new Date(t).toISOString()!==value)return null;const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(t));return b}
const id=(value:unknown)=>{if(typeof value!=='string'||!value.length)throw new Error('Control identity invalid')
  if(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value))return Buffer.concat([Buffer.from([1]),Buffer.from(value.replace(/-/g,''),'hex')])
  const text=Buffer.from(value);if(text.length>2048)throw new Error('Control identity size limit');const size=Buffer.alloc(3);size[0]=0;size.writeUInt16BE(text.length,1);return Buffer.concat([size,text])}
const encode=(value:any):{kind:number;plain:Buffer}=>{
  if(value?.k==='FSP2')return {kind:2,plain:Buffer.concat([hash(value.p),integer(value.e)])}
  if(value?.k==='SCF2')return {kind:4,plain:Buffer.concat([id(value.a),integer(value.e)])}
  if(value?.kind==='SHARED_COGNITIVE_RUNTIME'&&value.storageVersion===1){const t=timestamp(value.frozenAt);if(t)return {kind:6,plain:Buffer.concat([hash(value.artifactHash),t])}}
  if(value?.kind==='SHARED_SCALE_RUNTIME'&&value.storageVersion===2){const t=timestamp(value.frozenAt);if(t)return {kind:5,plain:Buffer.concat([hash(value.artifactHash),t])}}
  if(value?.k==='UAR2'){
    const t=timestamp(value.x?.frozenAt)
    if(t&&typeof value.b==='string'&&/^[1-9][0-9]{0,18}$/.test(value.b)&&BigInt(value.b)<=0x7fffffffffffffffn){
      const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(value.b));const extras={...value.x};delete extras.frozenAt
      if(extras.governance?.status==='READY'&&extras.governance.holdReason===null)delete extras.governance
      return {kind:1,plain:Buffer.concat([hash(value.p),b,t,Buffer.from(JSON.stringify(extras))])}
    }
  }
  if(value?.k==='WVP2' && Array.isArray(value.u) && value.u.every((u:any)=>Array.isArray(u)&&u.length===2)){
    const binding=Buffer.from(JSON.stringify(value.b));if(binding.length>65535||!Array.isArray(value.u)||value.u.length>32)throw new Error('Whole control binding invalid')
    const n=Buffer.alloc(3);n.writeUInt16BE(binding.length);n[2]=value.u.length
    return {kind:3,plain:Buffer.concat([hash(value.p),n,binding,...value.u.map((u:any)=>{if(!Array.isArray(u)||u.length!==2)throw new Error('Whole unit control invalid');return Buffer.concat([id(u[0]),hash(u[1])])})])}
  }
  if(!['UAR2','FSP2','WVP2','SCF2'].includes(value?.k)&&!['SHARED_SCALE_RUNTIME','SHARED_COGNITIVE_RUNTIME'].includes(value?.kind))throw new Error('Control reference type invalid')
  return {kind:0,plain:Buffer.from(JSON.stringify(value))}
}
const decode=(kind:number,plain:Buffer):any=>{
  let cursor=0
  const take=(n:number)=>{if(!Number.isSafeInteger(n)||n<0||cursor+n>plain.length)throw new Error('Control reference truncated');const out=plain.subarray(cursor,cursor+n);cursor+=n;return out}
  const readId=()=>{const tag=take(1)[0];if(tag===1){const h=take(16).toString('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)}if(tag!==0)throw new Error('Control identity encoding invalid');const n=take(2).readUInt16BE();if(n<1||n>2048)throw new Error('Control identity length invalid');return take(n).toString('utf8')}
  const readTime=()=>{const raw=take(8).readBigUInt64BE();if(raw>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Control time invalid');const date=new Date(Number(raw));if(Number.isNaN(date.getTime()))throw new Error('Control time invalid');return date.toISOString()}
  let value:any
  if(kind===0){value=JSON.parse(plain.toString('utf8'));cursor=plain.length;if(!['UAR2','FSP2','WVP2','SCF2'].includes(value?.k)&&!['SHARED_SCALE_RUNTIME','SHARED_COGNITIVE_RUNTIME'].includes(value?.kind))throw new Error('Control reference type invalid')}
  else if(kind===1){const p=take(32).toString('hex'),b=take(8).readBigUInt64BE().toString(),frozenAt=readTime(),x=JSON.parse(take(plain.length-cursor).toString('utf8'));if(!x||typeof x!=='object'||Array.isArray(x)||'frozenAt'in x)throw new Error('Admission difference invalid');value={k:'UAR2',p,b,x:{...x,frozenAt,governance:x.governance??{status:'READY',holdReason:null}}}}
  else if(kind===2)value={k:'FSP2',p:take(32).toString('hex'),e:take(4).readUInt32BE()}
  else if(kind===3){const p=take(32).toString('hex'),meta=take(3),size=meta.readUInt16BE(),count=meta[2];if(count>32)throw new Error('Whole control count invalid');const b=JSON.parse(take(size).toString('utf8')),u=[];for(let i=0;i<count;i++)u.push([readId(),take(32).toString('hex')]);value={k:'WVP2',p,b,u}}
  else if(kind===4)value={k:'SCF2',a:readId(),e:take(4).readUInt32BE()}
  else if(kind===5)value={kind:'SHARED_SCALE_RUNTIME',storageVersion:2,artifactHash:take(32).toString('hex'),frozenAt:readTime()}
  else if(kind===6)value={kind:'SHARED_COGNITIVE_RUNTIME',storageVersion:1,artifactHash:take(32).toString('hex'),frozenAt:readTime()}
  else throw new Error('Control reference version/type unsupported')
  if(cursor!==plain.length)throw new Error('Control reference trailing data')
  return value
}
export const isControlReferenceField=(value:unknown):value is `ekr1:${string}`=>typeof value==='string'&&value.startsWith(PREFIX)
export const encryptControlReference=(value:unknown):string=>{
  const {kind,plain}=encode(value);if(!plain.length||plain.length>MAX)throw new Error('Control reference size limit')
  const packed=plain.length>=128?gzipSync(plain,{level:1,chunkSize:Math.max(64,Math.min(16384,plain.length+64)),...(plain.length<=4096?{windowBits:12,memLevel:4}:{})}):plain,compressed=packed.length<plain.length
  const header=Buffer.alloc(7);header[0]=1;header[1]=kind;header[2]=compressed?1:0;header.writeUInt32BE(plain.length,3)
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',material(),iv);cipher.setAAD(Buffer.concat([DOMAIN,header]));const body=Buffer.concat([cipher.update(compressed?packed:plain),cipher.final()])
  return PREFIX+Buffer.concat([header,iv,cipher.getAuthTag(),body]).toString('base64')
}
export const decryptControlReference=(value:string):unknown=>{
  if(!isControlReferenceField(value)||value.length>2*(MAX+128))throw new Error('Control reference size/version invalid')
  const encoded=value.slice(PREFIX.length);if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error('Control reference encoding invalid')
  const data=Buffer.from(encoded,'base64');if(data.length<36||data.toString('base64')!==encoded)throw new Error('Control reference encoding invalid')
  const header=data.subarray(0,7),size=header.readUInt32BE(3);if(header[0]!==1||header[2]>1||size<1||size>MAX)throw new Error('Control reference metadata invalid')
  const cipher=createDecipheriv('aes-256-gcm',material(),data.subarray(7,19));cipher.setAAD(Buffer.concat([DOMAIN,header]));cipher.setAuthTag(data.subarray(19,35))
  const packed=Buffer.concat([cipher.update(data.subarray(35)),cipher.final()]),plain=header[2]===1?gunzipSync(packed,{maxOutputLength:size,chunkSize:Math.max(64,Math.min(16384,size+64))}):packed
  if(plain.length!==size)throw new Error('Control reference length invalid')
  return decode(header[1],plain)
}
