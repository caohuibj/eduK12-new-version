import { readSurveyCognitiveSessionIds } from './survey-cognitive-local'

const cursorKey='huisurvey:v1:cognitive-retention-cursor'
const pausedKey='huisurvey:v1:cognitive-retention-paused'
let cleanupPaused=false
const mayCleanup=()=>{
  if(cleanupPaused)return false
  try{return localStorage.getItem(pausedKey)!=='1'}catch{return false}
}
const pauseCleanup=()=>{
  cleanupPaused=true
  try{localStorage.setItem(pausedKey,'1')}catch(error){
    // If reads are blocked too, every sweep also fails safe. If only writes
    // fail, we cannot inform other tabs and must not claim a protected lease.
    try{if(localStorage.getItem(pausedKey)==='1')return}catch{return}
    throw error
  }
}
const lockName=(sessionId:string)=>'huisurvey:cognitive-draft:'+sessionId
const locks=()=>typeof navigator!=='undefined'?navigator.locks:undefined

/** Hold before recovery/admission. The browser releases this automatically if
 * a tab crashes. No heartbeat or persisted lease can expire under a live task. */
export async function holdSurveyCognitiveDraft(sessionId:string,signal:AbortSignal):Promise<()=>void>{
  const manager=locks()
  if(!manager)return ()=>undefined // Cleanup also skips without Web Locks.
  return new Promise((resolve,reject)=>{
    let release:()=>void=()=>undefined
    const held=new Promise<void>(done=>{release=done})
    void Promise.resolve().then(()=>manager.request(lockName(sessionId),{mode:'shared',signal},async()=>{
      if(signal.aborted){resolve(()=>undefined);return}
      const stop=()=>{signal.removeEventListener('abort',stop);release()}
      signal.addEventListener('abort',stop,{once:true})
      resolve(stop)
      await held
    })).catch(error=>{
      if(signal.aborted){reject(error);return}
      // Some browsers expose Web Locks but deny acquisition. This optional
      // cleaner must not consume a fresh admission; stop cleanup browser-wide
      // before continuing. It stays paused until this site's storage is reset.
      try{pauseCleanup();resolve(()=>undefined)}catch{reject(error)}
    })
  })
}

/** One best-effort sweep per Survey open. Nothing runs while Survey is closed.
 * Discovery is advisory: expiry rechecks ownership, seal and write clock in the
 * same IndexedDB transaction as deletion, after obtaining the cross-tab lock. */
export async function cleanupExpiredSurveyCognitiveDrafts():Promise<void>{
  try{
    const manager=locks()
    if(!manager||!mayCleanup())return // Cannot prove no active peer: retain rather than guess.
    // Keep the durable store out of the participant entry's eager dependency graph.
    // Loading failure is best-effort cleanup failure, never permission to discard drafts.
    const {finalDraftStore}=await import('../services/persistence/finalDraftStore')
    if(!mayCleanup())return
    const legacy=new Set(readSurveyCognitiveSessionIds())
    const savedCursor=localStorage.getItem(cursorKey)
    const after=savedCursor&&savedCursor.length<=512?savedCursor:null
    const page=await finalDraftStore.listSurveyCognitiveDrafts([...legacy],after)
    for(const id of page.sessionIds){
      try{
        await manager.request(lockName(id),{mode:'exclusive',ifAvailable:true},async lock=>{
          if(lock&&mayCleanup())await finalDraftStore.expireSurveyCognitiveDraft(id,legacy.has(id),Date.now())
        })
      }catch{/* Storage/lock denial never blocks Survey or removes retry evidence. */}
    }
    // Each later Survey open continues this bounded scan. Deleted cursor keys
    // remain valid lower bounds; reaching the end wraps the next open to start.
    if(page.nextCursor)localStorage.setItem(cursorKey,page.nextCursor)
    else localStorage.removeItem(cursorKey)
  }catch{/* Retry on the next Survey open; no timer and no impact on server state. */}
}
