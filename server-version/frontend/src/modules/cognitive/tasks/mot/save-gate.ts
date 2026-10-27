/** Serialize one captured record's persistence; retries reuse its in-flight promise.
 * This is a client save guard, not a server idempotency receipt or proof of COS durability. */
export function createMotSaveGate(){
  let active:{key:string;promise:Promise<void>}|null=null
  return {
    run(key:string,save:()=>Promise<void>):Promise<void>{
      if(active){
        if(active.key!==key)return Promise.reject(new Error('A different MOT record is still saving'))
        return active.promise
      }
      const promise=Promise.resolve().then(save)
      active={key,promise}
      const clear=()=>{if(active?.promise===promise)active=null}
      void promise.then(clear,clear)
      return promise
    },
  }
}
