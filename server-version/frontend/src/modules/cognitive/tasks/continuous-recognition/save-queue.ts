import {clone,type CapturedRecord,type LocalReceipt,type SealedRecord} from './contracts'
import {sealDigest} from './digest'
/** Bounded serial local-durable writes. Never awaits on rAF, never calls a network save per image. */
export class RecognitionSaveQueue {
  private settled:SealedRecord[]=[];private pending:CapturedRecord[]=[];private active:Promise<void>|null=null
  failed:Error|null=null
  constructor(readonly contextKey:string,private save:(record:SealedRecord)=>Promise<LocalReceipt>,private onFailure:(error:Error)=>void){}
  get retained(){return clone(this.settled)}
  get pendingCount(){return this.pending.length}
  enqueue(value:CapturedRecord){
    if(value.contextKey!==this.contextKey)throw Error('Draft context mismatch')
    const found=[...this.settled,...this.pending].find(r=>r.recordKey===value.recordKey)
    if(found){const original={...found} as CapturedRecord & {recordDigest?:string};delete original.recordDigest;if(JSON.stringify(original)!==JSON.stringify(value))throw Error('Existing exposure cannot be replaced');return}
    if(this.pending.length>=5)throw Error('No further exposure may start beyond the reserved sealed-record slot')
    this.pending.push(clone(value))
    if(this.pending.length>4){this.failed=new Error('Local draft backlog overflow; sealed record retained');this.onFailure(this.failed);return}
    void this.drain()
  }
  async retry(){this.failed=null;await this.drain();if(this.failed)throw this.failed}
  async idle(){await this.active;if(this.failed)throw this.failed;if(this.pending.length)throw Error('Local drafts are not yet durable')}
  private drain():Promise<void>{
    if(this.active)return this.active
    if(this.failed||!this.pending.length)return Promise.resolve()
    const promise=Promise.resolve().then(async()=>{
      while(this.pending.length&&!this.failed){const record=this.pending[0]
        try{const sealed:SealedRecord={...clone(record),recordDigest:sealDigest(record)};const r=await this.save(clone(sealed))
          if(r?.retained!==true||r.contextKey!==this.contextKey||r.recordKey!==record.recordKey||r.recordDigest!==sealed.recordDigest)throw Error('Local durable draft receipt mismatch')
          this.pending.shift();this.settled.push(sealed)
        }catch(error){this.failed=error instanceof Error?error:new Error('Local persistence failed');this.onFailure(this.failed)}
      }
    })
    this.active=promise;void promise.finally(()=>{if(this.active===promise)this.active=null});return promise
  }
}
