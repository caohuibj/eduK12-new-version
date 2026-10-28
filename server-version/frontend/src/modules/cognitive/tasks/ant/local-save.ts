import type { AntRawRecord } from './capture'
import { antRecordDigest } from './seal'
export interface AntLocalReceipt { durable:true;contextId:string;key:string;recordDigest:string }
/** Host must append idempotently to durable LOCAL storage. No per-trial server/COS request belongs here. */
export type PersistAntLocalDraft=(record:AntRawRecord,seal:{contextId:string;key:string;recordDigest:string})=>Promise<AntLocalReceipt>
export class AntLocalQueue {
  private recordsByKey=new Map<string,AntRawRecord>()
  private pending:string[]=[]
  private acknowledged=new Set<string>()
  private digests=new Map<string,string>()
  private running:Promise<void>|null=null
  failed=false
  faultReason:string|null=null
  constructor(readonly contextId:string,readonly persistLocalDraft:PersistAntLocalDraft,
    readonly onFault:(reason:string)=>void,readonly maxPending=4,readonly maxRecords=312){}
  enqueue(record:AntRawRecord):void {
    if(record.contextId!==this.contextId)throw Error('ANT local draft context mismatch')
    const previous=this.recordsByKey.get(record.key)
    if(previous){if(JSON.stringify(previous)!==JSON.stringify(record))throw Error('ANT cached raw record conflict');return}
    if(this.recordsByKey.size>=this.maxRecords)throw Error('ANT attempt record bound exceeded')
    this.recordsByKey.set(record.key,structuredClone(record));this.pending.push(record.key)
    // One extra sealed record is retained when the bound is detected, then exposure must stop.
    if(this.pending.length>this.maxPending){this.fault('local_queue_overflow');return}
    if(!this.failed)void this.drain()
  }
  private fault(reason:string){if(this.failed)return;this.failed=true;this.faultReason=reason;this.onFault(reason)}
  private drain():Promise<void> {
    if(this.running)return this.running
    this.running=Promise.resolve().then(async()=>{
      while(this.pending.length&&!this.failed){
        const key=this.pending[0],record=this.recordsByKey.get(key)!
        try{
          const recordDigest=this.digests.get(key)??antRecordDigest(record)
          this.digests.set(key,recordDigest)
          const receipt=await this.persistLocalDraft(structuredClone(record),{contextId:this.contextId,key,recordDigest})
          if(!receipt||receipt.durable!==true||receipt.contextId!==this.contextId||receipt.key!==key||receipt.recordDigest!==recordDigest)
            throw Error('Missing durable local receipt')
          this.acknowledged.add(key);this.pending.shift()
        }catch{this.fault('local_write_unconfirmed')}
      }
    }).finally(()=>{this.running=null})
    return this.running
  }
  async retry():Promise<boolean>{if(this.running)await this.running;this.failed=false;this.faultReason=null;await this.drain();return !this.failed&&this.pending.length===0}
  async wait():Promise<boolean>{if(this.running)await this.running;return !this.failed&&this.pending.length===0}
  records():AntRawRecord[]{return [...this.recordsByKey.values()].map(r=>structuredClone(r))}
  sealedRecordSet(){return [...this.recordsByKey.keys()].map(key=>({key,recordDigest:this.digests.get(key)??null}))}
  get pendingCount(){return this.pending.length}
  get durableCount(){return this.acknowledged.size}
}
