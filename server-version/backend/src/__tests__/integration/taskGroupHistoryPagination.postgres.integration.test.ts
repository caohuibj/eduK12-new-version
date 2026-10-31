import {randomUUID as uuid} from 'node:crypto'
import {afterAll,describe,expect,it} from 'vitest'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {listTaskGroupArtifactsPage,listTaskGroupLongitudinalArtifactsPage} from '../../modules/reporting/task-artifact'
import {listTrainingGroupTasksPage} from '../../modules/training-analysis/source'
import {trainingGroupHistory} from '../../modules/training-analysis/group-report.service'

const url=integrationDatabaseUrl('TASK_GROUP_HISTORY_DATABASE_URL'),suite=url?describe:describe.skip
afterAll(async()=>{await prisma.$disconnect()})
suite('task group history / actual pointer SQL and Training task authority',()=>{
 it('pages 26 same-time pointers exactly, preserves submillisecond cursors and reaches an authorized task outside the recent100',async()=>{
  requireIsolatedReleaseDatabase(url!)
  const owner=await prisma.user.create({data:{username:'history_'+uuid(),passwordHash:'synthetic-only',role:'TEACHER',accountDomain:'TRAINING',teacherApproved:true}})
  const course=await prisma.course.create({data:{title:'Synthetic pointer-only history',courseCode:uuid(),creatorId:owner.id,courseType:'TRAINING_COURSE'}})
  const oldId=uuid(),tasks=[oldId,...Array.from({length:101},()=>uuid())]
  await prisma.compositeAssessment.createMany({data:tasks.map((id,index)=>({id,code:'history_'+id,name:'Synthetic task '+index,createdBy:owner.id,courseId:course.id,
   productKind:'LEGACY_COMPOSITE',status:'PUBLISHED',publishedAt:new Date(index===0?'2020-01-01T00:00:00Z':'2026-01-01T00:00:00Z')}))})
  const actor={userId:owner.id,role:owner.role},source={product:'TRAINING' as const,containerId:course.id,taskId:oldId}
  const menu=await prisma.$transaction(tx=>listTrainingGroupTasksPage(tx,actor,course.id))
  expect(menu.tasks).toHaveLength(100);expect(menu.tasks.some(task=>task.id===oldId)).toBe(false)
  expect((await prisma.$transaction(tx=>listTrainingGroupTasksPage(tx,actor,course.id,menu.nextTaskId!))).tasks.some(task=>task.id===oldId)).toBe(true)
  const prefix=uuid().slice(0,24),ids=Array.from({length:26},(_,i)=>prefix+(i+1).toString(16).padStart(12,'0'))
  const insert=async(id:string,product:string,containerId:string,taskId:string,kind='GROUP',planId:string|null=null)=>{
   await prisma.$executeRaw`INSERT INTO reporting_task_artifacts(id,product,container_id,task_id,generated_by,payload_cipher,payload_hash,generated_at,report_kind,plan_id)
    VALUES(${id},${product},${containerId},${taskId},${owner.id},'deliberately-not-a-decryptable-payload','synthetic-pointer-only',timestamp '2026-10-30 12:00:00.123',${kind},${planId})`
  }
  for(const id of ids)await insert(id,source.product,source.containerId,source.taskId)
  await insert(uuid(),'SURVEY',source.containerId,source.taskId)
  await insert(uuid(),'TRAINING',uuid(),source.taskId)
  await insert(uuid(),'TRAINING',source.containerId,uuid())
  const planId=uuid();await insert(uuid(),'TRAINING',source.containerId,source.taskId,'GROUP_LONGITUDINAL',planId)
  await insert(uuid(),'TRAINING',source.containerId,source.taskId,'GROUP_LONGITUDINAL',uuid())
  const first=await trainingGroupHistory({actor,courseId:course.id,taskId:oldId})
  expect(first.artifacts.map(pointer=>pointer.artifactId)).toEqual([...ids].reverse().slice(0,25))
  expect(first.nextCursor).toEqual({artifactId:ids[1],generatedAt:'2026-10-30T12:00:00.123000Z'})
  const second=await trainingGroupHistory({actor,courseId:course.id,taskId:oldId,before:first.nextCursor!})
  expect(second.artifacts.map(pointer=>pointer.artifactId)).toEqual([ids[0]]);expect(second.nextCursor).toBeNull()
  // The existing table is timestamp(3), so stored rows end in000. A cursor
  // 1us above them must not be rounded through JS Date into an ID-only cutoff.
  const micro=await prisma.$transaction(tx=>listTaskGroupArtifactsPage(tx,source,{generatedAt:'2026-10-30T12:00:00.123001Z',artifactId:prefix+'000000000000'}))
  expect(micro.artifacts.map(pointer=>pointer.artifactId)).toEqual(first.artifacts.map(pointer=>pointer.artifactId))
  expect((await prisma.$transaction(tx=>listTaskGroupLongitudinalArtifactsPage(tx,source,planId))).artifacts).toHaveLength(1)
  const other=await prisma.user.create({data:{username:'history_other_'+uuid(),passwordHash:'synthetic-only',role:'TEACHER',accountDomain:'TRAINING',teacherApproved:true}})
  await expect(trainingGroupHistory({actor:{userId:other.id,role:other.role},courseId:course.id,taskId:oldId})).rejects.toMatchObject({statusCode:404})
  console.info(JSON.stringify({kind:'task-group-history-pagination',targetPointers:26,pages:[first.artifacts.length,second.artifacts.length],sameTimeIdTieBreak:true,microsecondCursorPreserved:true,
   existingColumnPrecision:3,authorizedOldTaskOutsideRecent100:true,taskMenuContinues:true,wrongActorRejected:true,exactProductContainerTaskKindPlanScope:true,
   unreadablePayloadsNeverDecrypted:true,newFinals:0,newGroupGeneration:0}))
 },60000)
})
