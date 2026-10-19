import {describe,it,expect,vi} from 'vitest'
import {freezeGroupIpPolicy,GROUP_IP_MAX_WINDOW_MS} from '../../modules/survey/group-ip-policy'
import {prepareTrainingPublicRound,assertTrainingRoundActive,assertTrainingTokenRound,publicRoundMetadata,trainingRoundPublicationIdentity} from '../../modules/composite/training-public-round'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createCompositeTokenSchema} from '../../modules/composite/composite.schema'
const now=new Date('2026-10-19T03:00:00.000Z'),end=new Date(+now+GROUP_IP_MAX_WINDOW_MS)
const policy={schemaVersion:1,timeZone:'Asia/Shanghai'}
const row={id:'parent',createdBy:'teacher',productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',publicEnabled:true,status:'PUBLISHED',publishedAt:now,
 questionnaireCourses:[{courseId:'course'}],trainingFlowDigest:null,trainingVariantDigest:null,opensAt:null}
const round={id:'round',compositeId:'parent',courseId:'course',publishedAt:now,publicationHash:canonicalHash(trainingRoundPublicationIdentity(row,'course')),
 groupIpPolicy:freezeGroupIpPolicy(policy,now),opensAt:now,closesAt:end}
const db=()=>({$queryRaw:vi.fn().mockResolvedValueOnce([{id:'course'}]).mockResolvedValueOnce([]),trainingPublicRound:{findUnique:vi.fn().mockResolvedValue(round),create:vi.fn(async({data})=>({id:'round',...data}))}})
describe('Training public round explicit freeze and admission boundaries',()=>{
 it('legacy null does not query or infer enablement',async()=>{
  const tx=db();expect(await prepareTrainingPublicRound(tx as any,row,'teacher',{},end,now)).toBeNull()
  await assertTrainingTokenRound(tx as any,{compositeAssessmentId:row.id,trainingRoundId:null},now)
  expect(tx.$queryRaw).not.toHaveBeenCalled();expect(tx.trainingPublicRound.findUnique).not.toHaveBeenCalled()
  expect(publicRoundMetadata({})).toEqual({roundId:null,groupIpWindow:null})
 })
 it('freezes exact publication/course/config and server window using shared Survey policy',async()=>{
  const tx=db(),created=await prepareTrainingPublicRound(tx as any,row,'teacher',{groupIpPolicy:policy},end,now)
  expect(created).toMatchObject({...round,createdBy:'teacher'})
  expect(created?.publicationIdentity).toEqual(trainingRoundPublicationIdentity(row,'course'))
  expect(tx.trainingPublicRound.create).toHaveBeenCalledTimes(1)
 })
 it.each([[-1,false],[0,true],[GROUP_IP_MAX_WINDOW_MS-1,true],[GROUP_IP_MAX_WINDOW_MS,false],[GROUP_IP_MAX_WINDOW_MS+1,false]])('window offset %s valid %s',(offset,valid)=>{
  if(valid)expect(()=>assertTrainingRoundActive(round,new Date(+now+Number(offset)))).not.toThrow()
  else expect(()=>assertTrainingRoundActive(round,new Date(+now+Number(offset)))).toThrow()
 })
 it.each([null,{schemaVersion:1,timeZone:'invalid'},{schemaVersion:1,timeZone:'UTC',activationDate:'2026-10-18'}])('rejects invalid policy %j',async bad=>{
  await expect(prepareTrainingPublicRound(db() as any,row,'teacher',{groupIpPolicy:bad},end,now)).rejects.toThrow()
 })
 it('accepts an already-open task from a prior local day without backdating the round',async()=>{
  const result=await prepareTrainingPublicRound(db() as any,{...row,opensAt:new Date(+now-3*86400000)},'teacher',{groupIpPolicy:policy},end,now)
  expect(result?.opensAt).toEqual(now)
 })
 it('rejects >48h and future opening while accepting shorter cutoff',async()=>{
  await expect(prepareTrainingPublicRound(db() as any,row,'teacher',{groupIpPolicy:policy},new Date(+end+1),now)).rejects.toThrow()
  await expect(prepareTrainingPublicRound(db() as any,{...row,opensAt:new Date(+now+1)},'teacher',{groupIpPolicy:policy},end,now)).rejects.toThrow()
  const shorter=await prepareTrainingPublicRound(db() as any,row,'teacher',{groupIpPolicy:policy},new Date(+now+3600000),now)
  expect(+shorter!.closesAt-+shorter!.opensAt).toBe(3600000)
 })
 it.each([{productKind:'ORGANIZATION_RESOURCE'},{questionnaireType:'STANDALONE'},{publicEnabled:false},{status:'DRAFT'},{questionnaireCourses:[]},{questionnaireCourses:[{courseId:'course'},{courseId:'second'}]}])('rejects unsupported scope %j',async patch=>{
  const tx=db();await expect(prepareTrainingPublicRound(tx as any,{...row,...patch},'teacher',{groupIpPolicy:policy},end,now)).rejects.toThrow()
  expect(tx.trainingPublicRound.create).not.toHaveBeenCalled()
 })
 it('rejects wrong course/author facts and study combinations',async()=>{
  const tx=db();tx.$queryRaw.mockReset().mockResolvedValue([])
  await expect(prepareTrainingPublicRound(tx as any,row,'teacher',{groupIpPolicy:policy},end,now)).rejects.toThrow()
  const study=db();study.$queryRaw.mockReset().mockResolvedValueOnce([{id:'course'}]).mockResolvedValueOnce([{id:'study'}])
  await expect(prepareTrainingPublicRound(study as any,row,'teacher',{groupIpPolicy:policy},end,now)).rejects.toThrow()
 })
 it('reuse is exact existing frozen round and cannot extend window',async()=>{
  const tx=db();expect(await prepareTrainingPublicRound(tx as any,row,'teacher',{roundId:'round'},end,now)).toEqual(round)
  expect(tx.trainingPublicRound.create).not.toHaveBeenCalled()
  await expect(prepareTrainingPublicRound(db() as any,row,'teacher',{roundId:'round'},new Date(+end+1),now)).rejects.toThrow()
  for(const patch of [{compositeId:'other'},{courseId:'other'},{publicationHash:'f'.repeat(64)}]){
   const mismatch=db();mismatch.trainingPublicRound.findUnique.mockResolvedValue({...round,...patch})
   await expect(prepareTrainingPublicRound(mismatch as any,row,'teacher',{roundId:'round'},end,now)).rejects.toThrow()
  }
 })
 it('new admission rejects wrong binding/cutoff with one indexed read',async()=>{
  const tx=db();tx.$queryRaw.mockReset().mockResolvedValueOnce([round]).mockResolvedValueOnce([]).mockResolvedValueOnce([round])
  expect(await assertTrainingTokenRound(tx as any,{trainingRoundId:round.id,compositeAssessmentId:row.id},now)).toBe('course')
  expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
  await expect(assertTrainingTokenRound(tx as any,{trainingRoundId:round.id,compositeAssessmentId:'other'},now)).rejects.toThrow()
  await expect(assertTrainingTokenRound(tx as any,{trainingRoundId:round.id,compositeAssessmentId:row.id},end)).rejects.toThrow()
 })
 it('course cutoff bounds new round even when parent expiry is absent',async()=>{
  const tx=db();tx.$queryRaw.mockReset().mockResolvedValueOnce([{id:'course',endedAt:new Date(+end-1)}])
  await expect(prepareTrainingPublicRound(tx as any,row,'teacher',{groupIpPolicy:policy},end,now)).rejects.toThrow('课程截止')
 })
 it('metadata lists real binding without publication identity/credentials',()=>{
  expect(publicRoundMetadata({trainingRoundId:round.id,trainingRound:round})).toEqual({roundId:round.id,groupIpWindow:{opensAt:now,closesAt:end}})
 })
 it('request rejects both selectors and hint/auth fields',()=>{
  const base={expiresAt:end.toISOString(),maxUses:0}
  expect(createCompositeTokenSchema.safeParse({...base,groupIpPolicy:policy}).success).toBe(true)
  expect(createCompositeTokenSchema.safeParse({...base,groupIpPolicy:policy,roundId:'10000000-0000-4000-8000-000000000001'}).success).toBe(false)
  expect(createCompositeTokenSchema.safeParse({...base,groupIp:true}).success).toBe(false)
 })
})
