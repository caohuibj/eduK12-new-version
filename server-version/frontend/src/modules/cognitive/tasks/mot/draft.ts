import type { MotCalibration, MotTrial } from './generated/protocol'
import type { MotRawFrames } from './capture'

export interface MotDraftBinding {
  sessionId: string; attemptNo: number; protocolKey: 'mot/1.1.0/1.1.0' | 'mot/1.1.1/1.1.0'
  resolvedConfigHash: string; randomSeed: string
}
export interface MotPending { trialIndex: number; calibration: MotCalibration }
export interface MotDraftRecord { core: MotTrial; raw: MotRawFrames }
export interface MotDraftPort {
  readonly binding: Readonly<MotDraftBinding>
  pending(): Promise<MotPending | null>
  begin(pending: MotPending): Promise<void>
  append(record: MotDraftRecord): Promise<void>
  records(): Promise<MotDraftRecord[]>
  appendPractice(record: MotDraftRecord): Promise<void>
  practices(): Promise<MotDraftRecord[]>
  close?(): void
}
export class MotDraftError extends Error {
  constructor(readonly code:'CONFLICT'|'SEQUENCE'|'BUDGET'|'UNAVAILABLE',message:string){super(message);this.name='MotDraftError'}
}
function normalizeBinding(value:unknown):MotDraftBinding {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('A complete frozen MOT draft binding is required')
  const b=value as Record<string,unknown>
  if(typeof b.sessionId!=='string'||!b.sessionId||b.sessionId.length>512
    ||typeof b.randomSeed!=='string'||!b.randomSeed||b.randomSeed.length>256
    ||typeof b.resolvedConfigHash!=='string'||!b.resolvedConfigHash||b.resolvedConfigHash.length>256
    ||typeof b.protocolKey!=='string'||!['mot/1.1.0/1.1.0','mot/1.1.1/1.1.0'].includes(b.protocolKey)||!Number.isSafeInteger(b.attemptNo)||Number(b.attemptNo)<1)
    throw new Error('A complete frozen MOT draft binding is required')
  return {sessionId:b.sessionId,attemptNo:Number(b.attemptNo),protocolKey:b.protocolKey as MotDraftBinding['protocolKey'],
    resolvedConfigHash:b.resolvedConfigHash,randomSeed:b.randomSeed}
}
/** Explicit field order: reordering an equivalent caller object cannot create a fresh exposure. */
export const motDraftKey=(binding:MotDraftBinding):string=>JSON.stringify(normalizeBinding(binding))
const legacyKey=(value:unknown):string|null=>{
  if(typeof value!=='string'||value.length>4096)return null
  try{return motDraftKey(JSON.parse(value))}catch{return null}
}
type State={pending:MotPending|null;records:MotDraftRecord[];practice?:MotDraftRecord[]}
function validateState(state:State){
  if(!Array.isArray(state.records)||state.records.length>45
    ||state.records.some((r,i)=>r?.core?.trialIndex!==i||r?.raw?.trialIndex!==i)
    ||(state.pending!==null&&(!Number.isInteger(state.pending?.trialIndex)||state.pending.trialIndex!==state.records.length)))
    throw new MotDraftError('SEQUENCE','MOT local records are not a contiguous exposure sequence')
}
function validateRecord(record:MotDraftRecord){
  if(!Number.isInteger(record.core.trialIndex)||record.core.trialIndex<0||record.core.trialIndex>44
    ||record.raw.trialIndex!==record.core.trialIndex||!Array.isArray(record.raw.motionFrameTimesMs)
    ||record.raw.motionFrameTimesMs.length>3000)
    throw new MotDraftError('SEQUENCE','MOT raw/core trial identity or bounded frame log is invalid')
}
/** Schema v2 only adds an alias index. Existing records/keys are preserved; nothing is deleted.
 * Writes remain bounded trial-boundary transactions, never per-frame writes or server requests. */
export function createMotDraft(binding:MotDraftBinding):MotDraftPort {
  const key=motDraftKey(binding)
  let connection:Promise<IDBDatabase>|undefined
  const db=()=>{
    if(connection)return connection
    const attempt=new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open('eduk12-mot-drafts-v1',2)
      let stopped=false
      request.onupgradeneeded=()=>{
        const database=request.result,tx=request.transaction!
        if(!database.objectStoreNames.contains('drafts'))database.createObjectStore('drafts')
        if(!database.objectStoreNames.contains('bindings')){
          const aliases=database.createObjectStore('bindings')
          const cursor=tx.objectStore('drafts').openKeyCursor()
          cursor.onsuccess=()=>{
            const row=cursor.result
            if(!row)return
            const canonical=legacyKey(row.primaryKey)
            if(canonical){
              const existing=aliases.get(canonical)
              existing.onsuccess=()=>{
                const keys:string[]=existing.result??[]
                aliases.put([...keys,String(row.primaryKey)],canonical)
                row.continue()
              }
            }else row.continue()
          }
        }
      }
      request.onblocked=()=>{stopped=true;reject(new MotDraftError('UNAVAILABLE','Close the other task tab before opening the draft'))}
      request.onerror=()=>reject(request.error)
      request.onsuccess=()=>{
        if(stopped){request.result.close();return}
        request.result.onversionchange=()=>{request.result.close();connection=undefined}
        resolve(request.result)
      }
    })
    connection=attempt
    void attempt.catch(()=>{if(connection===attempt)connection=undefined})
    return attempt
  }
  async function transact<T>(write:boolean,action:(state:State)=>T):Promise<T>{
    const database=await db()
    return new Promise((resolve,reject)=>{
      const tx=database.transaction(['drafts','bindings'],write?'readwrite':'readonly')
      const store=tx.objectStore('drafts'),aliases=tx.objectStore('bindings'),lookup=aliases.get(key)
      let output:T
      const fail=(error:unknown)=>{reject(error);tx.abort()}
      lookup.onsuccess=()=>{
        const keys:string[]=lookup.result??[key]
        if(!Array.isArray(keys)||keys.length!==1){fail(new MotDraftError('CONFLICT','Several local drafts have the same frozen identity; all were preserved'));return}
        const actualKey=keys[0],request=store.get(actualKey)
        request.onsuccess=()=>{
          try{
            const state:State=request.result??{pending:null,records:[],practice:[]}
            validateState(state)
            output=action(state)
            if(write){store.put(state,actualKey);aliases.put([actualKey],key)}
          }catch(error){fail(error)}
        }
      }
      tx.oncomplete=()=>resolve(output)
      tx.onerror=()=>reject(tx.error)
      tx.onabort=()=>reject(tx.error??new Error('MOT local save was interrupted'))
    })
  }
  return {
    binding:Object.freeze(normalizeBinding(binding)),
    pending:()=>transact(false,s=>s.pending),
    begin:pending=>{
      const snapshot=structuredClone(pending)
      return transact(true,s=>{
        if(s.pending)throw new MotDraftError('CONFLICT','Unresolved MOT exposure must be recovered first')
        if(!Number.isInteger(snapshot.trialIndex)||snapshot.trialIndex!==s.records.length||snapshot.trialIndex>44)
          throw new MotDraftError('SEQUENCE','MOT exposure progress does not match the local draft')
        s.pending=snapshot
      })
    },
    append:record=>{
      const snapshot=structuredClone(record);validateRecord(snapshot)
      return transact(true,s=>{
        const found=s.records.find(r=>r.core.trialIndex===snapshot.core.trialIndex)
        if(found){
          if(JSON.stringify(found)!==JSON.stringify(snapshot))throw new MotDraftError('CONFLICT','Conflicting MOT draft retry')
          return
        }
        if(s.pending?.trialIndex!==snapshot.core.trialIndex||snapshot.core.trialIndex!==s.records.length)
          throw new MotDraftError('SEQUENCE','MOT draft exposure binding is missing')
        s.records.push(snapshot);s.pending=null
      })
    },
    records:()=>transact(false,s=>s.records),
    practices:()=>transact(false,s=>s.practice??[]),
    appendPractice:record=>{
      const snapshot=structuredClone(record);validateRecord(snapshot)
      return transact(true,s=>{
        s.practice??=[]
        if(s.practice.length>=100)throw new MotDraftError('BUDGET','MOT practice storage budget reached')
        s.practice.push(snapshot)
      })
    },
    close:()=>{const current=connection;connection=undefined;void current?.then(database=>database.close(),()=>undefined)},
  }
}
