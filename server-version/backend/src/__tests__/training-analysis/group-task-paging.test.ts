import {expect,it,vi} from 'vitest'
import {listTrainingGroupTasksPage} from '../../modules/training-analysis/source'
import {trainingCognitiveGroupTaskKey,trainingScaleGroupTaskKey} from '../../modules/training-analysis/group-source'
const actor={userId:'teacher',role:'TEACHER'} as const
it.each([[0,101,0],[0,0,101],[99,101,101]])('pages composite=%i, Cognitive=%i, Scale=%i through all families without duplicates',async(compositeN,cognitiveN,scaleN)=>{
 const ids=(prefix:string,n:number)=>Array.from({length:n},(_,i)=>prefix+'-'+String(i).padStart(3,'0'))
 const composite=ids('composite',compositeN).map(id=>({id,name:id})),cognitive=ids('cognitive',cognitiveN).map(id=>({id,title:id,status:'PUBLISHED'})),scales=ids('scale',scaleN).map(id=>({id,name:id}))
 const slice=(rows:any[],query:any)=>rows.slice(query.cursor?rows.findIndex(row=>row.id===query.cursor.id)+query.skip:0).slice(0,query.take)
 const tx={
  $queryRaw:vi.fn(async(q:any)=>{const sql=(Array.isArray(q)?q:q.strings).join(' ')
   if(sql.includes('FROM courses'))return[{id:actor.userId,role:actor.role,businessRole:actor.role,isActive:true,isFrozen:false,expiresAt:null,teacherApproved:true,accountDomain:'TRAINING',mustChangePassword:false,tokenVersion:0,trainingGrantVersion:null,courseId:'course',creatorId:actor.userId,courseType:'TRAINING_COURSE',isLibrary:false}]
   const values=q.values as any[],after=sql.includes('s.id>')?values.at(-2):null
   return scales.filter(row=>after===null||row.id>after).slice(0,values.at(-1))
  }),
  relationalAssessmentAssignment:{findMany:vi.fn(async()=>[])},
  compositeAssessment:{findMany:vi.fn(async(q:any)=>slice(composite,q)),findFirst:vi.fn(async(q:any)=>composite.find(row=>row.id===q.where.id)??null)},
  cognitiveAssignment:{findMany:vi.fn(async(q:any)=>slice(cognitive,q))},
 }
 let cursor:string|undefined;const seen:string[]=[]
 for(let page=0;page<10;page++){
  const result=await listTrainingGroupTasksPage(tx as any,actor,'course',cursor)
  expect(result.tasks.length).toBeLessThanOrEqual(100);seen.push(...result.tasks.map(t=>t.id))
  if(!result.nextTaskId)break
  cursor=result.nextTaskId
 }
 expect(seen).toEqual([...composite.map(row=>row.id),...cognitive.map(row=>trainingCognitiveGroupTaskKey(row.id)),...scales.map(row=>trainingScaleGroupTaskKey(row.id))])
 expect(new Set(seen).size).toBe(compositeN+cognitiveN+scaleN)
 for(const [q]of tx.cognitiveAssignment.findMany.mock.calls)expect(q.where).toMatchObject({courseId:'course',createdBy:'teacher',listedStandalone:true})
})
