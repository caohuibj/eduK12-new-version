import { describe,it,expect,vi,beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { compileSurveyFlow } from '../../modules/survey/flow.definition'
import { ensureSurveyFlowAssignment,SurveyAssignmentError } from '../../modules/survey/flow.assignment'
vi.mock('../../modules/assessment-runtime/security',()=>({
  encryptUnifiedRuntimePayload:(value:unknown)=>JSON.stringify(value),
  decryptUnifiedRuntimePayload:(value:string)=>JSON.parse(value),
}))
const flow=compileSurveyFlow({schemaVersion:1,experiment:{experimentKey:'trial',linkedPolicy:'KEEP_LINKED',groups:[
  {groupKey:'a',weight:1,materialTitle:'A',materialBody:'Alpha'},
  {groupKey:'b',weight:1,materialTitle:'B',materialBody:'Bravo'},
]},blocks:[{blockKey:'closing',kind:'MATERIAL',body:'done'}]},[],'LINKED_WAVES')
const snapshot={flow,quotaPolicy:{schemaVersion:1,groupLimits:{a:2,b:2}}} as ResearchFrozenPublication
const input={projectId:'project',waveId:'wave',attemptId:'attempt',participantId:'subject',
  researchCode:'research-code',accessCredential:'private-credential',snapshot}
const prior={schemaVersion:1,flowDigest:flow.flowDigest,experimentKey:'trial',groupKey:'b',
  algorithm:'CRYPTO_RANDOM_INT_V1',assignedAt:'2026-01-01T00:00:00.000Z'}
const fixture=()=>({
  $queryRaw:vi.fn().mockResolvedValue([{id:'locked'}]),
  surveyWaveAttempt:{findFirst:vi.fn().mockResolvedValue({id:'attempt',participantId:'subject',status:'STARTED',flowAssignmentCipher:null}),
    findMany:vi.fn().mockResolvedValue([{id:'previous',flowAssignmentCipher:JSON.stringify(prior)},
      {id:'later',flowAssignmentCipher:'must not decrypt'}]),updateMany:vi.fn().mockResolvedValue({count:1})},
  surveyParticipant:{findFirst:vi.fn().mockResolvedValue({id:'subject'})},
  surveyExperimentQuotaBucket:{findMany:vi.fn().mockResolvedValue([
    {groupKey:'a',maxAssigned:2,assignedCount:0},{groupKey:'b',maxAssigned:2,assignedCount:1},
  ]),updateMany:vi.fn().mockResolvedValue({count:1})},
})
const asTx=(tx:ReturnType<typeof fixture>)=>tx as unknown as Prisma.TransactionClient
beforeEach(()=>vi.clearAllMocks())
describe('Survey adapter retains its identity, quota CAS and persistence boundary',()=>{
  it('locks and rechecks credentials before returning a persisted assignment without reserving quota again',async()=>{
    const tx=fixture();tx.surveyWaveAttempt.findFirst.mockResolvedValue({...await tx.surveyWaveAttempt.findFirst(),flowAssignmentCipher:JSON.stringify(prior)})
    expect(await ensureSurveyFlowAssignment(asTx(tx),input)).toEqual(prior)
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4)
    expect(tx.surveyParticipant.findFirst).toHaveBeenCalledWith({where:{id:'subject',projectId:'project',researchCode:'research-code',status:'ACTIVE',credentialHash:createHash('sha256').update(input.accessCredential).digest('hex'),credentialRevokedAt:null},select:{id:true}})
    expect(tx.surveyWaveAttempt.findMany).not.toHaveBeenCalled()
    expect(tx.surveyExperimentQuotaBucket.findMany).not.toHaveBeenCalled()
    expect(tx.surveyWaveAttempt.updateMany).not.toHaveBeenCalled()
  })
  it('keeps history ordering/bounds and reserves the inherited group with exact CAS before encrypting',async()=>{
    const tx=fixture(),value=await ensureSurveyFlowAssignment(asTx(tx),input)
    expect(value).toMatchObject({groupKey:'b',algorithm:'LINKED_INHERIT_V1',inheritedFromAttemptId:'previous'})
    expect(tx.surveyWaveAttempt.findMany).toHaveBeenCalledWith({where:{projectId:'project',participantId:'subject',flowAssignmentCipher:{not:null},id:{not:'attempt'}},orderBy:[{startedAt:'asc'},{id:'asc'}],select:{id:true,flowAssignmentCipher:true},take:100})
    expect(tx.surveyExperimentQuotaBucket.updateMany).toHaveBeenCalledWith({where:{projectId:'project',waveId:'wave',groupKey:'b',assignedCount:1,maxAssigned:2},data:{assignedCount:{increment:1}}})
    const write=tx.surveyWaveAttempt.updateMany.mock.calls[0][0]
    expect(write.where).toEqual({id:'attempt',projectId:'project',flowAssignmentCipher:null})
    expect(JSON.parse(write.data.flowAssignmentCipher)).toEqual(value)
    expect(tx.surveyExperimentQuotaBucket.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.surveyWaveAttempt.updateMany.mock.invocationCallOrder[0])
  })
  it('refuses a changed credential before quota/history access',async()=>{
    const tx=fixture();tx.surveyParticipant.findFirst.mockResolvedValue(null)
    await expect(ensureSurveyFlowAssignment(asTx(tx),input)).rejects.toThrow('研究编号的私密凭证已撤销')
    expect(tx.surveyExperimentQuotaBucket.findMany).not.toHaveBeenCalled()
    expect(tx.surveyWaveAttempt.findMany).not.toHaveBeenCalled()
  })
  it('retains anonymous session credential checks',async()=>{
    const tx=fixture();tx.surveyWaveAttempt.findFirst.mockResolvedValue({id:'attempt',participantId:null,status:'STARTED',flowAssignmentCipher:null,sessionHash:'old'})
    await expect(ensureSurveyFlowAssignment(asTx(tx),{...input,participantId:null})).rejects.toThrow('单次匿名凭证已失效')
    expect(tx.surveyExperimentQuotaBucket.findMany).not.toHaveBeenCalled()
  })
  it('surfaces quota CAS conflicts using the existing error class without assignment writes',async()=>{
    const tx=fixture();tx.surveyExperimentQuotaBucket.updateMany.mockResolvedValue({count:0})
    await expect(ensureSurveyFlowAssignment(asTx(tx),input)).rejects.toThrow(SurveyAssignmentError)
    expect(tx.surveyWaveAttempt.updateMany).not.toHaveBeenCalled()
  })
  it('refuses full inherited quotas without switching groups',async()=>{
    const tx=fixture();tx.surveyExperimentQuotaBucket.findMany.mockResolvedValue([{groupKey:'a',maxAssigned:2,assignedCount:0},{groupKey:'b',maxAssigned:2,assignedCount:2}])
    await expect(ensureSurveyFlowAssignment(asTx(tx),input)).rejects.toThrow('既有研究实验组本轮名额已满，不允许随机改变纵向分组')
    expect(tx.surveyExperimentQuotaBucket.updateMany).not.toHaveBeenCalled()
    expect(tx.surveyWaveAttempt.updateMany).not.toHaveBeenCalled()
  })
})
