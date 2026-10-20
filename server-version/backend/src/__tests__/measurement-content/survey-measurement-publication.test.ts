import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({tx:{$queryRaw:vi.fn(),surveyInstrumentDraft:{findUniqueOrThrow:vi.fn()}},transaction:vi.fn(),authorize:vi.fn(),compile:vi.fn(),publish:vi.fn(),assets:vi.fn(),retain:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:m.transaction}}))
vi.mock('../../modules/survey/builder.service',()=>({authorizedProject:m.authorize,SurveyBuilderError:class extends Error{constructor(readonly statusCode:number,message:string){super(message)}}}))
vi.mock('../../modules/survey/publication.service',()=>({compileFrozenResearchUnit:m.compile,publishSurveyMeasurementUnit:m.publish}))
vi.mock('../../modules/survey/media.references',()=>({assertSurveyMediaOwned:m.assets}))
vi.mock('../../modules/assessment-media/assessment-asset',()=>({retainAssessmentAssetReferences:m.retain}))
import {publishSurveyMeasurementDraft} from '../../modules/survey/measurement-publication.service'
const draft=()=>({id:'draft',projectId:'project',revision:2,status:'DRAFT',catalogGrantId:null,kind:'SCALE'})
beforeEach(()=>{vi.resetAllMocks();m.transaction.mockImplementation(fn=>fn(m.tx));m.tx.$queryRaw.mockResolvedValue([{id:'draft'}]);m.tx.surveyInstrumentDraft.findUniqueOrThrow.mockResolvedValue(draft());m.compile.mockReturnValue({kind:'SCALE',displayDefinition:{},draftRevision:2});m.assets.mockResolvedValue([]);m.publish.mockResolvedValue({releaseId:'release',contentHash:'hash',status:'PUBLISHED',family:'SCALE',version:'2',content:{measurementHash:'measurement',metrics:[{metricKey:'total'}]}})})
describe('explicit private measurement publication',()=>{
 it('authorizes, locks exact revision, compiles and retains in the same transaction',async()=>{
  await expect(publishSurveyMeasurementDraft('owner','project','draft',2)).resolves.toEqual({releaseId:'release',contentHash:'hash',measurementHash:'measurement',family:'SCALE',version:'2',metricKeys:['total']})
  expect(m.authorize).toHaveBeenCalledWith(m.tx,'owner','project',true)
  expect(m.tx.$queryRaw.mock.calls[0][0].sql).toContain('FOR SHARE')
  expect(m.assets.mock.invocationCallOrder[0]).toBeLessThan(m.publish.mock.invocationCallOrder[0])
  expect(m.retain).toHaveBeenCalledWith({owner:{entityType:'MeasurementContentRelease',entityId:'release',field:'media'},references:[],db:m.tx})
 })
 it('does not read drafts after authorization refusal',async()=>{m.authorize.mockRejectedValue(new Error('denied'));await expect(publishSurveyMeasurementDraft('other','project','draft',2)).rejects.toThrow('denied');expect(m.tx.$queryRaw).not.toHaveBeenCalled()})
 it.each([{revision:3},{status:'ARCHIVED'},{catalogGrantId:'catalog'},{kind:'FORM'}])('rejects unavailable or non-native draft %j',async change=>{m.tx.surveyInstrumentDraft.findUniqueOrThrow.mockResolvedValue({...draft(),...change});await expect(publishSurveyMeasurementDraft('owner','project','draft',2)).rejects.toThrow();expect(m.publish).not.toHaveBeenCalled()})
 it('does not bypass asset authorization',async()=>{m.assets.mockRejectedValue(new Error('asset denied'));await expect(publishSurveyMeasurementDraft('owner','project','draft',2)).rejects.toThrow('asset denied');expect(m.publish).not.toHaveBeenCalled()})
 it('cannot reactivate a retired exact revision',async()=>{m.publish.mockResolvedValue({status:'RETIRED'});await expect(publishSurveyMeasurementDraft('owner','project','draft',2)).rejects.toMatchObject({statusCode:409});expect(m.retain).not.toHaveBeenCalled()})
})
