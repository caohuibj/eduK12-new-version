import {beforeEach,describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({assets:[] as unknown[],pins:[] as unknown[]}))
vi.mock('../../config',()=>({config:{assetSigningSecret:'synthetic-public-media-test-secret',uploadDir:'/tmp/synthetic-public-media-tests'}}))
vi.mock('../../config/database',()=>({prisma:{
 $transaction:async(fn:(tx:unknown)=>unknown)=>fn({}),
 storedAsset:{findMany:async()=>state.assets},assetReference:{findMany:async()=>state.pins,findFirst:vi.fn(async()=>state.pins[0]??null)},
}}))
vi.mock('../../modules/survey/admission.service',()=>({verifiedSurveyAttempt:vi.fn()}))
vi.mock('../../modules/survey/flow.assignment',()=>({ensureSurveyFlowAssignment:vi.fn(),assignedSurveySnapshot:vi.fn()}))
vi.mock('../../modules/survey/waves.service',()=>({SurveyWaveError:class extends Error{constructor(readonly statusCode:number,message:string){super(message)}}}))
import {prisma} from '../../config/database'
import {authorizeOwnSurveyImage} from '../../modules/survey/public-scale-media'
import {verifiedSurveyAttempt} from '../../modules/survey/admission.service'
import {ensureSurveyFlowAssignment,assignedSurveySnapshot} from '../../modules/survey/flow.assignment'
import {createCustomScaleDefinition} from '../../modules/scale/scale-definition'
import {canonicalScalePresentation} from '../../modules/survey/catalog-scale.presentation'
import {verifyAssessmentMediaCapability} from '../../modules/assessment-media/assessment-media-capability'
import {frozenSurveyScaleImage,frozenSurveyScaleMediaItems,issueOwnSurveyScaleVideo} from '../../modules/survey/public-scale-media'
import type {ResearchFrozenUnit,ResearchFrozenPublication} from '../../modules/survey/publication.service'
const image={asset:{assetId:'image',contentHash:'a'.repeat(64),mimeType:'image/png' as const},altText:'Stimulus',order:0}
const report={...image,asset:{...image.asset,assetId:'report-only'}}
const video={schemaVersion:1 as const,video:{assetId:'video',contentHash:'b'.repeat(64),mimeType:'video/mp4' as const},poster:image.asset,
 captions:[{asset:{assetId:'caption',contentHash:'c'.repeat(64),mimeType:'text/vtt' as const},kind:'captions' as const,srcLang:'zh',label:'字幕'}]}
function unit():ResearchFrozenUnit{
 const definition=createCustomScaleDefinition()
 definition.items=[{itemCode:'private-code',content:'Question',images:[image],video,type:'single',required:true,sortOrder:0,responseSetKey:'default',randomizeOptions:false}]
 definition.scoring.itemRules=[{itemCode:'private-code',transform:{type:'identity'}}]
 definition.scoring.scores=[{key:'total',type:'total',label:'Total',direction:'higher_is_more',canonical:true,displayPrecision:1,source:{type:'items',items:[{itemCode:'private-code',weight:1}],aggregation:'sum'}}]
 definition.report.primaryScoreKeys=['total']
 definition.report.scoreOrder=['total']
 definition.report.interpretations=[{scoreKey:'total',headline:'Total',source:{type:'score_only'},summary:'Synthetic descriptive score',bands:[],guidance:[]}]
 definition.report.rawScoreFeedback={schemaVersion:1,rules:[{scoreKey:'total',ranges:[{key:'all',min:1,max:5,includeMax:true,text:'Report',images:[report]}]}]}
 const {display,mapping}=canonicalScalePresentation(definition,'ONE_BY_ONE')
 return {draftId:'draft',instrumentKey:'scale',kind:'SCALE',title:'Synthetic',draftRevision:1,sourceDigest:'digest',scoringDigest:'score',compiledDefinition:definition,displayDefinition:display,sourceAnswerMapping:mapping}
}
const proof={publicId:'public',attemptId:'attempt',accessCredential:'secret'}
let selected:ResearchFrozenPublication
beforeEach(()=>{
 vi.clearAllMocks()
 selected={units:[unit()]} as ResearchFrozenPublication
 vi.mocked(verifiedSurveyAttempt).mockResolvedValue({status:'STARTED',attemptId:'attempt',projectId:'project',waveId:'wave',publicationId:'publication',participantId:null,compiledSnapshot:selected} as never)
 vi.mocked(assignedSurveySnapshot).mockImplementation(snapshot=>snapshot)
 state.assets=[video.video,image.asset,video.captions[0].asset].map(a=>({id:a.assetId,objectKey:'assets/'+a.assetId,provider:'local',sha256:a.contentHash,mimeType:a.mimeType,sizeBytes:100,deletedAt:null}))
 state.pins=[video.video,image.asset,video.captions[0].asset].map(a=>({assetId:a.assetId}))
})
describe('Survey canonical Scale participant media boundary',()=>{
 it('permits only projected canonical stimulus images, never report feedback or arbitrary assets',()=>{
  expect(frozenSurveyScaleImage(selected,'image')).toEqual(image.asset)
  expect(frozenSurveyScaleImage(selected,'report-only')).toBeUndefined()
  expect(frozenSurveyScaleImage(selected,'someone-elses-image')).toBeUndefined()
  expect(frozenSurveyScaleImage({...selected,units:[]},'image')).toBeUndefined()
 })
 it('requires matching mapped item, display identity and immutable compiled image/video',()=>{
  const u=unit();u.sourceAnswerMapping!.items.i_0='missing'
  expect(()=>frozenSurveyScaleMediaItems(u)).toThrow()
  const other=unit();(other.displayDefinition as {items:Array<{images:unknown[]}>}).items[0].images=[report]
  expect(()=>frozenSurveyScaleMediaItems(other)).toThrow()
  const absent=unit();delete absent.sourceAnswerMapping
  expect(()=>frozenSurveyScaleMediaItems(absent)).toThrow()
 })
 it('issues existing signed native video/poster/caption capabilities bound to exact attempt and publication',async()=>{
  const result=await issueOwnSurveyScaleVideo(proof,'scale','i_0')
  expect(verifiedSurveyAttempt).toHaveBeenCalledWith(proof)
  const token=new URL(result.videoUrl,'https://example.test').searchParams.get('cap')!
  expect(verifyAssessmentMediaCapability(token)).toMatchObject({scopeId:'SURVEY:publication:attempt:scale:i_0',audience:'public',kind:'video',asset:video.video})
  expect(result.posterUrl).toContain('/api/assets/assessment-media/content?cap=')
  expect(result.captions[0].assetId).toBe('caption')
  expect(result.videoUrl).not.toContain('secret')
 })
 it('rejects missing pins, wrong unit/item and terminal/invalid participant proof',async()=>{
  await expect(issueOwnSurveyScaleVideo(proof,'other','i_0')).rejects.toThrow()
  await expect(issueOwnSurveyScaleVideo(proof,'scale','private-code')).rejects.toThrow()
  state.pins=[{assetId:'video'}]
  await expect(issueOwnSurveyScaleVideo(proof,'scale','i_0')).rejects.toThrow('retained')
  vi.mocked(verifiedSurveyAttempt).mockResolvedValueOnce({status:'SCREENED_OUT'} as never)
  await expect(issueOwnSurveyScaleVideo(proof,'scale','i_0')).rejects.toThrow()
  vi.mocked(verifiedSurveyAttempt).mockRejectedValueOnce(new Error('invalid proof'))
  await expect(issueOwnSurveyScaleVideo(proof,'scale','i_0')).rejects.toThrow('invalid proof')
 })
 it('rechecks persisted assignment and never reveals a sibling questionnaire variant',async()=>{
  const original={...selected,flow:{}} as ResearchFrozenPublication
  vi.mocked(verifiedSurveyAttempt).mockResolvedValueOnce({status:'STARTED',attemptId:'attempt',projectId:'project',waveId:'wave',publicationId:'publication',participantId:null,compiledSnapshot:original} as never)
  vi.mocked(ensureSurveyFlowAssignment).mockResolvedValueOnce({groupKey:'selected'} as never)
  vi.mocked(assignedSurveySnapshot).mockReturnValueOnce({...selected,units:[]})
  await expect(issueOwnSurveyScaleVideo(proof,'scale','i_0')).rejects.toThrow()
  expect(ensureSurveyFlowAssignment).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({attemptId:'attempt',accessCredential:'secret',snapshot:original}))
 })
})


describe('Survey sourced SJT image access',()=>{
 const sjt=(source=true)=>({instrumentKey:'sjt',kind:'SJT',displayDefinition:{schemaVersion:2,scenes:[{sceneKey:'scene',image,questions:[]}]},...(source?{sourceProvenance:{source:{kind:'SJT',sourceId:'release'}}}:{})})
 it('requires the actual selected source image and this publication retention',async()=>{
  selected.units=[sjt() as never]
  expect(await authorizeOwnSurveyImage(proof,'image')).toEqual(image.asset)
  expect(prisma.assetReference.findFirst).toHaveBeenCalledWith({where:{assetId:'image',entityType:'SurveyResearchPublication',entityId:'publication',field:'media'},select:{id:true}})
  state.pins=[]; await expect(authorizeOwnSurveyImage(proof,'image')).rejects.toMatchObject({statusCode:404})
  await expect(authorizeOwnSurveyImage(proof,'unassigned')).rejects.toMatchObject({statusCode:404})
 })
 it('preserves native Survey frozen images without imposing new grant/pin requirements',async()=>{
  selected.units=[sjt(false) as never]; state.pins=[]
  expect(await authorizeOwnSurveyImage(proof,'image')).toEqual(image.asset)
  expect(prisma.assetReference.findFirst).not.toHaveBeenCalled()
 })
 it('keeps fresh participant proof and persisted assignment checks before image disclosure',async()=>{
  selected.units=[sjt() as never]
  vi.mocked(verifiedSurveyAttempt).mockRejectedValueOnce(new Error('invalid proof'))
  await expect(authorizeOwnSurveyImage(proof,'image')).rejects.toThrow('invalid proof')
  vi.mocked(assignedSurveySnapshot).mockReturnValueOnce({...selected,units:[]})
  await expect(authorizeOwnSurveyImage(proof,'image')).rejects.toMatchObject({statusCode:404})
 })
})
