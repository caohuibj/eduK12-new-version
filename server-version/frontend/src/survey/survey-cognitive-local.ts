import { finalDraftStore } from '../services/persistence/finalDraftStore'

// Technical IDs only, scoped to this public research project. This registry lets
// withdrawal clean known Survey trials without touching any other product's drafts.
type LocalSession={attemptId:string;sessionId:string;researchCode?:string}
const key=(publicId:string)=>'huisurvey:v1:cognitive-sessions:'+publicId
const read=(publicId:string):LocalSession[]=>{
  try{const rows:unknown=JSON.parse(localStorage.getItem(key(publicId))??'[]')
    return Array.isArray(rows)?rows.filter((r):r is LocalSession=>!!r&&typeof r==='object'
      &&typeof r.attemptId==='string'&&typeof r.sessionId==='string'):[]
  }catch{return []}
}
const write=(publicId:string,rows:LocalSession[])=>{
  try{if(rows.length)localStorage.setItem(key(publicId),JSON.stringify(rows));else localStorage.removeItem(key(publicId))}catch{/* cleanup still uses in-memory known IDs */}
}
export function rememberSurveyCognitiveSession(publicId:string,attemptId:string,sessionId:string,researchCode?:string){
  const rows=read(publicId)
  if(!rows.some(r=>r.sessionId===sessionId))write(publicId,[...rows,{attemptId,sessionId,...(researchCode?{researchCode}: {})}])
}
export async function clearSurveyCognitiveSessions(publicId:string,attemptId?:string,knownIds:string[]=[],researchCode?:string):Promise<boolean>{
  const rows=read(publicId),ids=new Set([...knownIds,...rows.filter(r=>attemptId?r.attemptId===attemptId:!!researchCode&&r.researchCode===researchCode).map(r=>r.sessionId)])
  const deleted=new Set<string>()
  await Promise.all([...ids].map(async id=>{try{await finalDraftStore.delete('cognitive:'+id);deleted.add(id)}catch{/* preserve registry for a later cleanup retry */}}))
  write(publicId,read(publicId).filter(r=>!deleted.has(r.sessionId)))
  return deleted.size===ids.size
}
export async function clearSurveyCognitiveSession(publicId:string,sessionId:string):Promise<boolean>{
  try{await finalDraftStore.delete('cognitive:'+sessionId)
    write(publicId,read(publicId).filter(r=>r.sessionId!==sessionId));return true
  }catch{return false}
}

/** Only the existing Survey namespace can identify unmarked legacy drafts. */
export function readSurveyCognitiveSessionIds():string[]{
  try{
    const prefix='huisurvey:v1:cognitive-sessions:'
    const ids=new Set<string>()
    for(let i=0;i<localStorage.length;i++){
      const storedKey=localStorage.key(i)
      if(storedKey?.startsWith(prefix))for(const row of read(storedKey.slice(prefix.length)))ids.add(row.sessionId)
    }
    return [...ids]
  }catch{return []}
}
