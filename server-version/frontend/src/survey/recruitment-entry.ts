/** Public recruitment capability, NOT an account session or participant
 * identity. Cache only in this browser tab with an absolute 30-minute deadline.
 * Private research identity / completed answers never enter this storage key.
 */
const TTL_MS=30*60*1000
const key=(id:string)=>'huisurvey:recruitment:v1:'+id
const validId=(id:string)=>/^[a-f0-9-]{36}$/i.test(id)
export const isRecruitmentEntryToken=(token:string)=>/^[A-Za-z0-9_-]{43}$/.test(token)
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>
type Saved={token:string;createdAt:number}

function validSaved(saved:Saved,now:number):boolean{
  return !!saved&&isRecruitmentEntryToken(saved.token)
    &&Number.isFinite(saved.createdAt)&&saved.createdAt<=now
    &&now-saved.createdAt<TTL_MS
}
export function readRecruitmentEntry(id:string,hash:string,storage:Store|null,now=Date.now()):string{
  if(!validId(id))return ''
  const supplied=new URLSearchParams(hash.replace(/^#/,'')).get('entry')||''
  if(isRecruitmentEntryToken(supplied))return supplied
  if(!storage)return ''
  try{
    const raw=storage.getItem(key(id))
    if(!raw)return ''
    const saved=JSON.parse(raw) as Saved
    if(validSaved(saved,now))return saved.token
    storage.removeItem(key(id))
  }catch{/* blocked storage or malformed receipt */}
  return ''
}
export function rememberRecruitmentEntry(id:string,token:string,storage:Store,now=Date.now()):void{
  if(!validId(id)||!isRecruitmentEntryToken(token))return
  try{
    const existing=storage.getItem(key(id))
    if(existing){
      const saved=JSON.parse(existing) as Saved
      if(saved.token===token&&validSaved(saved,now))return
    }
  }catch{/* stale malformed or blocked storage */}
  try{storage.setItem(key(id),JSON.stringify({token,createdAt:now} satisfies Saved))}
  catch{/* private/disabled storage does not prevent first-use in memory */}
}
export function clearRecruitmentEntry(id:string,storage:Store):void{
  if(!validId(id))return
  try{storage.removeItem(key(id))}catch{/* optional browser storage */}
}
