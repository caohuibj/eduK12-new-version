import {describe,expect,it,vi} from 'vitest'
vi.mock('../../modules/survey/content-binding.service',()=>({decodeSurveyAttemptContentBinding:vi.fn()}))
import {allocateResearchFlowOnAdmission} from '../../modules/survey/flow.assignment'
const input={publicationId:'publication',projectId:'project',waveId:'wave',attemptId:'attempt',participantId:null,accessCredential:'a'.repeat(43)}
describe('allocateResearchFlowOnAdmission snapshot load',()=>{
  it('returns before loading compiledSnapshot when the publication has no flow',async()=>{
    const findFirst=vi.fn()
    const tx={$queryRaw:vi.fn(async()=>[{definition_digest:'ab'.repeat(32),has_flow:false}]),surveyPublication:{findFirst}}
    await expect(allocateResearchFlowOnAdmission(tx as never,input)).resolves.toBeUndefined()
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(findFirst).not.toHaveBeenCalled()
  })
  it('uses JSON-aware flow presence: absent and JSON null both skip fat reads',async()=>{
    const absent=vi.fn(async()=>[{definition_digest:'ab'.repeat(32),has_flow:false}])
    const tx={$queryRaw:absent,surveyPublication:{findFirst:vi.fn()}}
    await expect(allocateResearchFlowOnAdmission(tx as never,input)).resolves.toBeUndefined()
    expect(tx.surveyPublication.findFirst).not.toHaveBeenCalled()
    const sql=String((absent.mock.calls[0] as unknown as [TemplateStringsArray])[0].join(' '))
    expect(sql).toContain("jsonb_typeof(publication.compiled_snapshot->'flow') <> 'null'")
    expect(sql).toContain('COALESCE')
    // A JSON null and a missing key both map to has_flow=false in PostgreSQL,
    // rather than the old IS NOT NULL check that misclassified JSON null.
  })
  it('loads compiledSnapshot when a flow exists and no prepared snapshot matches',async()=>{
    const findFirst=vi.fn(async()=>null)
    const tx={$queryRaw:vi.fn(async()=>[{definition_digest:'ab'.repeat(32),has_flow:true}]),surveyPublication:{findFirst}}
    await expect(allocateResearchFlowOnAdmission(tx as never,input)).rejects.toThrow('研究入场时冻结发布定义不可访问')
    expect(findFirst).toHaveBeenCalledWith({where:{id:'publication',projectId:'project'},select:{definitionDigest:true,compiledSnapshot:true}})
  })
  it('does not load compiledSnapshot when the prepared snapshot digest matches a publication that has a flow',async()=>{
    let calls=0
    const findFirst=vi.fn()
    const tx={$queryRaw:vi.fn(async()=>{
      calls+=1
      if(calls===1)return [{definition_digest:'d'.repeat(64),has_flow:true}]
      throw new Error('locked flow read')
    }),surveyPublication:{findFirst}}
    await expect(allocateResearchFlowOnAdmission(tx as never,{...input,
      preparedDigest:{publicationId:'publication',snapshotDigest:'d'.repeat(64)},
      preparedSnapshot:{projectId:'project',waveId:'wave',flow:{flowDigest:'flow'}} as never,
    })).rejects.toThrow('locked flow read')
    expect(findFirst).not.toHaveBeenCalled()
  })
})
