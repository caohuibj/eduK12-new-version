import type { MotCalibration, MotTrial } from './generated/protocol'
import type { MotRawFrames } from './capture'

export interface MotDraftBinding {
  sessionId: string; attemptNo: number; protocolKey: 'mot/1.1.0/1.1.0'
  resolvedConfigHash: string; randomSeed: string
}
export interface MotPending { trialIndex: number; calibration: MotCalibration }
export interface MotDraftRecord { core: MotTrial; raw: MotRawFrames }
export interface MotDraftPort {
  pending(): Promise<MotPending | null>
  begin(pending: MotPending): Promise<void>
  append(record: MotDraftRecord): Promise<void>
  records(): Promise<MotDraftRecord[]>
  appendPractice(record: MotDraftRecord): Promise<void>
  practices(): Promise<MotDraftRecord[]>
}
/** IndexedDB stores one bounded write per trial boundary. Never a per-frame request/write. */
export function createMotDraft(binding: MotDraftBinding): MotDraftPort {
  if(!binding.sessionId||!binding.randomSeed||!binding.resolvedConfigHash
    ||binding.protocolKey!=='mot/1.1.0/1.1.0'||!Number.isSafeInteger(binding.attemptNo)||binding.attemptNo<1)
    throw new Error('A complete frozen MOT draft binding is required')
  const key=JSON.stringify(binding)
  let connection: Promise<IDBDatabase>|undefined
  const db=()=>connection??=new Promise((resolve,reject)=>{
    const request=indexedDB.open('eduk12-mot-drafts-v1',1)
    request.onupgradeneeded=()=>{request.result.createObjectStore('drafts')}
    request.onerror=()=>reject(request.error)
    request.onsuccess=()=>resolve(request.result)
  })
  type State={pending:MotPending|null;records:MotDraftRecord[];practice:MotDraftRecord[]}
  async function transact<T>(write:boolean,action:(state:State)=>T):Promise<T>{
    const connection=await db()
    return new Promise((resolve,reject)=>{
      const tx=connection.transaction('drafts',write?'readwrite':'readonly'),store=tx.objectStore('drafts')
      const request=store.get(key)
      let output:T
      request.onsuccess=()=>{
        try{
          const state:State=request.result??{pending:null,records:[],practice:[]}
          output=action(state)
          if(write)store.put(state,key)
        }catch(error){tx.abort();reject(error)}
      }
      tx.oncomplete=()=>resolve(output)
      tx.onerror=()=>reject(tx.error)
      tx.onabort=()=>reject(tx.error??new Error('MOT local save was interrupted'))
    })
  }
  return {
    pending:()=>transact(false,s=>s.pending),
    begin:pending=>transact(true,s=>{
      if(s.pending)throw new Error('Unresolved MOT exposure must be recovered first')
      if(s.records.some(r=>r.core.trialIndex===pending.trialIndex))throw new Error('MOT exposure cannot be repeated')
      s.pending=pending
    }),
    append:record=>transact(true,s=>{
      const found=s.records.find(r=>r.core.trialIndex===record.core.trialIndex)
      if(found){
        if(JSON.stringify(found)!==JSON.stringify(record))throw new Error('Conflicting MOT draft retry')
        return
      }
      if(s.pending?.trialIndex!==record.core.trialIndex)throw new Error('MOT draft exposure binding is missing')
      s.records.push(record);s.pending=null
    }),
    records:()=>transact(false,s=>s.records),
    practices:()=>transact(false,s=>s.practice??[]),
    appendPractice:record=>transact(true,s=>{
      s.practice??=[]
      if(s.practice.length>=100)throw new Error('MOT practice storage budget reached')
      s.practice.push(record)
    }),
  }
}
