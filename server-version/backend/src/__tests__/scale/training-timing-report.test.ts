import {afterEach,describe,it,expect,vi} from 'vitest'
const {findMany}=vi.hoisted(()=>({findMany:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{assessment:{findMany}}}))
import {withTrainingTimingReport} from '../../modules/composite/training-timing-report'
import {freezeTrainingTimingPolicy,freezeTrainingTimingSnapshot} from '../../modules/assessment-runtime/training-scale-timing'
const snapshot=freezeTrainingTimingSnapshot(freezeTrainingTimingPolicy([{id:'course',courseType:'TRAINING_COURSE',isLibrary:false}],false),'course',1,false)
const report={unitReports:[{itemId:'item',type:'SCALE',scores:{total:5}}]}
const parent={id:'attempt',trainingTimingSnapshot:snapshot,compositeAssessment:{productKind:'QUESTIONNAIRE',timingExportEnabled:true,revision:2}}
afterEach(()=>vi.clearAllMocks())
describe('current teacher-only timing report projection',()=>{
 it('adds zero timing queries for disabled, participant and legacy paths',async()=>{
  expect(await withTrainingTimingReport(report,{...parent,compositeAssessment:{...parent.compositeAssessment,timingExportEnabled:false}},'teacher')).toBe(report)
  for(const role of ['participant','student','anonymous'])expect(await withTrainingTimingReport(report,parent,role)).toBe(report)
  const old=await withTrainingTimingReport(report,{...parent,trainingTimingSnapshot:null},'teacher')
  expect(old.unitReports[0].trainingTiming).toMatchObject({status:'NOT_COLLECTED',items:{}})
  expect(findMany).not.toHaveBeenCalled()
 })
 it('uses one narrow batch only when freshly enabled, never mutating the cached science report',async()=>{
  findMany.mockResolvedValue([{compositeItemId:'item',timingEncrypted:null}])
  const result=await withTrainingTimingReport(report,parent,'teacher')
  expect(result.unitReports[0].trainingTiming).toMatchObject({status:'MISSING',items:{}})
  expect(findMany).toHaveBeenCalledExactlyOnceWith({where:{compositeAttemptId:'attempt'},select:{compositeItemId:true,timingEncrypted:true}})
  expect(report.unitReports[0]).not.toHaveProperty('trainingTiming')
  expect(result.unitReports[0].scores).toEqual({total:5})
  expect(await withTrainingTimingReport(report,{...parent,compositeAssessment:{...parent.compositeAssessment,timingExportEnabled:false}},'teacher')).toBe(report)
  expect(findMany).toHaveBeenCalledTimes(1)
 })
})
