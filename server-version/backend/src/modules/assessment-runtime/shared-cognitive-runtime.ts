import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { BoundedArtifactCache } from './bounded-artifact-cache'
import { canonicalHash, canonicalJsonBytes, retainImmutableCanonicalValue } from './canonical'
import { encryptCompactField, decryptCompactField } from './compact-field-codec'
import { encryptControlReference, decryptControlReference, isControlReferenceField } from './control-reference-codec'
import { decryptCognitivePayload, encryptCognitivePayload } from '../cognitive/cognitive.security'
import { sessionConfigFromStoredValue } from '../cognitive/v2/session-snapshot'
import { sharedControlWritesEnabled } from './shared-control-records'

type Db=Pick<Prisma.TransactionClient,'$queryRaw'>
type Entry={artifact:any;parsed:ReturnType<typeof sessionConfigFromStoredValue>;bytes:number}
const MAX=2*1024*1024,cache=new BoundedArtifactCache<Entry>(32,4*1024*1024)
const local=new WeakMap<object,Map<string,Entry>>()
const hash=(artifact:unknown)=>canonicalHash({kind:'COGNITIVE_RUNTIME_ARTIFACT',version:1,artifact})
const withoutTime=(snapshot:any)=>{const {frozenAt:_time,...artifact}=snapshot;return artifact}
const txMap=(db:Db)=>{let map=local.get(db);if(!map){map=new Map();local.set(db,map)}return map}
const retain=(key:string,entry:Entry,db?:Db)=>{
 if(db&&db!==prisma){const map=txMap(db);if(map.size<32&&entry.bytes<=64*1024)map.set(key,entry)}
 else cache.set(key,entry,entry.bytes*8+1024)
 return entry
}
const verify=(row:any,key:string):Entry=>{
 if(!row||row.artifactHash!==key||row.formatVersion!==2||!Number.isInteger(row.plaintextBytes)||row.plaintextBytes<1||row.plaintextBytes>MAX)throw new Error('Cognitive shared runtime record invalid')
 const body=decryptCompactField<any>(row.payloadEncrypted,MAX+1024)
 if(body?.kind!=='COGNITIVE_RUNTIME_ARTIFACT'||body.version!==1||!body.artifact||'frozenAt'in body.artifact
   ||canonicalJsonBytes(body.artifact).length!==row.plaintextBytes||hash(body.artifact)!==key)throw new Error('Cognitive shared runtime integrity invalid')
 const parsed=sessionConfigFromStoredValue({...body.artifact,frozenAt:'2000-01-01T00:00:00.000Z'})
 if(!parsed.snapshot||!parsed.compiledRuntime||hash(withoutTime(parsed.snapshot))!==key)throw new Error('Cognitive shared runtime normalized identity invalid')
 retainImmutableCanonicalValue(body.artifact);retainImmutableCanonicalValue(parsed.snapshot);retainImmutableCanonicalValue(parsed.compiledRuntime)
 return {artifact:body.artifact,parsed,bytes:row.plaintextBytes}
}
const read=async(key:string,db:Db=prisma):Promise<Entry>=>{
 if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Cognitive runtime reference invalid')
 const known=cache.get(key)??(db!==prisma?txMap(db).get(key):undefined);if(known)return known
 const rows=await db.$queryRaw<any[]>`SELECT artifact_hash AS "artifactHash",format_version AS "formatVersion",plaintext_bytes AS "plaintextBytes",payload_encrypted AS "payloadEncrypted" FROM assessment_runtime_artifacts WHERE artifact_hash=${key}`
 if(rows.length!==1)throw new Error('Frozen Cognitive runtime missing; restore its shared version before retrying')
 return retain(key,verify(rows[0],key),db)
}
export const storeSharedCognitiveRuntime=async(snapshot:any,db:Db=prisma):Promise<string>=>{
 if(!sharedControlWritesEnabled())return encryptCognitivePayload(snapshot)
 const artifact=withoutTime(snapshot),key=hash(artifact),bytes=canonicalJsonBytes(artifact).length
 if(bytes<1||bytes>MAX)throw new Error('Cognitive runtime size limit')
 let entry=cache.get(key)??(db!==prisma?txMap(db).get(key):undefined)
 if(!entry){
  const payload=encryptCompactField({kind:'COGNITIVE_RUNTIME_ARTIFACT',version:1,artifact},MAX+1024)
  let rows=await db.$queryRaw<any[]>`INSERT INTO assessment_runtime_artifacts(artifact_hash,format_version,plaintext_bytes,payload_encrypted) VALUES(${key},2,${bytes},${payload}) ON CONFLICT(artifact_hash) DO NOTHING
    RETURNING artifact_hash AS "artifactHash",format_version AS "formatVersion",plaintext_bytes AS "plaintextBytes",payload_encrypted AS "payloadEncrypted"`
  if(!rows.length)rows=await db.$queryRaw<any[]>`SELECT artifact_hash AS "artifactHash",format_version AS "formatVersion",plaintext_bytes AS "plaintextBytes",payload_encrypted AS "payloadEncrypted" FROM assessment_runtime_artifacts WHERE artifact_hash=${key}`
  if(rows.length!==1)throw new Error('Cognitive shared runtime append unconfirmed')
  entry=retain(key,verify(rows[0],key),db)
 }
 return encryptControlReference({kind:'SHARED_COGNITIVE_RUNTIME',storageVersion:1,artifactHash:key,frozenAt:snapshot.frozenAt})
}
export const loadSharedCognitiveRuntime=async<TConfig=Record<string,unknown>>(encrypted:string,db?:Db):Promise<ReturnType<typeof sessionConfigFromStoredValue<TConfig>>>=>{
 if(!isControlReferenceField(encrypted))return sessionConfigFromStoredValue<TConfig>(decryptCognitivePayload(encrypted))
 const ref=decryptControlReference(encrypted)as any
 if(ref?.kind!=='SHARED_COGNITIVE_RUNTIME'||ref.storageVersion!==1||typeof ref.frozenAt!=='string'||Number.isNaN(Date.parse(ref.frozenAt)))throw new Error('Cognitive runtime reference version invalid')
 const entry=await read(ref.artifactHash,db),config=JSON.parse(JSON.stringify(entry.parsed.config))as TConfig
 // Scientific plans remain immutable; each caller receives its own small config.
 return {config,snapshot:{...entry.parsed.snapshot!,config,frozenAt:ref.frozenAt},compiledRuntime:entry.parsed.compiledRuntime} as ReturnType<typeof sessionConfigFromStoredValue<TConfig>>
}
export const sharedCognitiveRuntimeCacheStats=()=>cache.stats()
