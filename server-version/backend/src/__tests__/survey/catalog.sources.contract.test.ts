import { describe,expect,it,vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { compileResearchScale } from '../../modules/survey/builder.compiler'
import { compileSurveySjtV2 } from '../../modules/survey/sjt-v2.compiler'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { scoreScale } from '../../modules/scale/scale-scoring'
import { scoreSituationalModel } from '../../modules/situational/situation-model-resolver'
import { asLinearSituationDefinition } from '../../modules/situational/situation-runtime-definition'
import { scoreResearchSjtAnswers,normalizeSurveySjtAnswers } from '../../modules/survey/sjt-runtime'
import { initialCognitiveDefinition,SURVEY_GONOGO_CONFIG } from '../../modules/survey/cognitive.definition'
import { adaptCatalogScale,adaptCatalogSjt,adaptCatalogCognitive,getCatalogSourceSnapshot,listCatalogSources,assertCatalogSourcesCurrent,adaptCatalogQuestionnaireForm,questionnaireFormSourceVersion,type QuestionnaireCatalogForm } from '../../modules/survey/catalog.sources'
import type { SjtDraftV2 } from '../../modules/survey/builder.definition'
import type { SituationDefinitionV2 } from '../../modules/situational/situation-branching'
import type { SituationPackage } from '../../modules/situational/situation-package'

const scale=()=>compileResearchScale('Source Scale',{schemaVersion:1,respondentType:'participant_self_report',
  responseOptions:[{optionKey:'no',label:'No',score:0},{optionKey:'yes',label:'Yes',score:1}],
  dimensions:[{dimensionKey:'source_score',label:'Source score',direction:'descriptive'}],aggregation:'sum',
  items:[{itemKey:'source_item',prompt:'Question',required:true,reverse:false,dimensionKeys:['source_score']}]})
const scaleRef={kind:'SCALE' as const,sourceId:'scale-id',sourceVersion:'2.0.0'}
const sjt=():SituationPackage=>{
  const draft:SjtDraftV2={schemaVersion:2,respondentType:'participant_self_report',title:'Authorized source',author:'Source author',sourceNote:'Authorized source note',
    licenseStatus:'authorized',redistribution:'allowed',orderPolicy:'FIXED',metrics:[{metricKey:'metric',label:'Metric',direction:'descriptive'}],
    scoring:{modelKey:'AUTHOR_KEY_SUM',modelVersion:'1',sourceNote:'Frozen author contributions'},
    scenes:[{sceneKey:'source_scene',title:'Scene',stimulus:'Text stimulus',questions:[{questionKey:'question',prompt:'Choose',responseType:'SINGLE',required:true,allowRefusal:false,
      options:[{optionKey:'first',label:'First',contributions:{metric:1}},{optionKey:'second',label:'Second',contributions:{metric:2}}]}]}]}
  const pkg=compileSurveySjtV2('source',draft).package
  for(const node of pkg.definition.flow.nodes)if(node.nodeType==='SCENE')node.motherSceneKey=node.sceneKey
  return {...pkg,releaseStatus:'PUBLISHED',goldenCases:[{name:'first',responses:[{sceneKey:'survey_q_question',channelKey:'question',responseValue:'first'}],expected:{quality:'interpretable',metricKeys:['metric'],metrics:{metric:1}}}]}
}

describe('immutable system catalog source adapters',()=>{
  it('preserves typed numeric Scale values, exact scorer and source identity without modifying source',()=>{
    const definition=scale()
    definition.items[0].itemCode='Official Item 1'
    definition.scoring.itemRules[0].itemCode='Official Item 1'
    if(definition.scoring.scores[0].source.type==='items')definition.scoring.scores[0].source.items[0].itemCode='Official Item 1'
    definition.responseSets[0].options[0].value=0
    definition.responseSets[0].options[1].value=1
    const original=structuredClone(definition)
    const imported=adaptCatalogScale(scaleRef,'Source Scale',definition)
    expect(definition).toEqual(original)
    expect(imported.compiledDefinition).toEqual(original)
    expect(imported.definitionDigest).toBe(canonicalHash(original))
    expect(imported.answerMapping).toEqual({type:'SCALE_TYPED_V1',items:{i_0:'Official Item 1'},options:{o_0:0,o_1:1}})
    const mapping=imported.answerMapping!
    for(const option of ['o_0','o_1']){
      const originalAnswers={[mapping.items.i_0]:mapping.options[option]}
      expect(scoreScale(imported.compiledDefinition as typeof definition,originalAnswers)).toEqual(scoreScale(original,originalAnswers))
    }
  })
  it('refuses restricted rights and presentation changes rather than rewriting official source',()=>{
    const definition=scale();definition.license.redistribution='restricted'
    expect(()=>adaptCatalogScale(scaleRef,'Source',definition)).toThrow('SOURCE_RIGHTS')
    definition.license.redistribution='allowed';definition.items[0].randomizeOptions=true
    expect(()=>adaptCatalogScale(scaleRef,'Source',definition)).toThrow('PRESENTATION_UNSUPPORTED')
  })
  it('preserves authorized V2 SJT original scoring and every choice matches the source oracle',()=>{
    const pkg=sjt(),original=structuredClone(pkg)
    const imported=adaptCatalogSjt({kind:'SJT',sourceId:'release-id',sourceVersion:pkg.instrumentVersion},'Authorized source',pkg)
    expect(pkg).toEqual(original);expect(imported.compiledDefinition).toEqual(pkg.definition)
    for(const choice of ['first','second']){
      const display=imported.displayDefinition as SjtDraftV2,definition=imported.compiledDefinition as SituationDefinitionV2
      const normalized=normalizeSurveySjtAnswers(display,definition,{question:choice})
      expect(scoreResearchSjtAnswers(display,definition,normalized.responses)).toEqual(scoreSituationalModel(asLinearSituationDefinition(pkg.definition),normalized.responses))
    }
  })
  it('rejects native SJT research capture even for a no-op single assignment',()=>{
    const pkg=sjt()
    const node=pkg.definition.flow.nodes.find(n=>n.nodeType==='SCENE')!
    pkg.definition.researchAssignment={assignmentVersion:'source-assignment-v1',groups:[{groupKey:'control',nodeKey:node.nodeKey,variants:[{variantKey:'control',weight:1,omittedChannelKeys:[],probeTiming:'DEFINED'}]}]}
    expect(()=>adaptCatalogSjt({kind:'SJT',sourceId:'source',sourceVersion:pkg.instrumentVersion},'Source',pkg)).toThrow('SOURCE_SJT_RESEARCH_CAPTURE_UNSUPPORTED')
  })
  it('does not claim restricted SJT sources or branch flattening is supported',()=>{
    const pkg=sjt();pkg.definition.license.redistribution='restricted'
    expect(()=>adaptCatalogSjt({kind:'SJT',sourceId:'source',sourceVersion:'1'},'Source',pkg)).toThrow('SOURCE_RIGHTS')
  })
  it('accepts only the actual controlled published Cognitive config, never substitutes a template for another task',()=>{
    const ref={kind:'COGNITIVE' as const,sourceId:'config-id',sourceVersion:'1.1.0'}
    const row={name:'Go/No-Go',testType:'gonogo',configVersion:'1.1.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',config:SURVEY_GONOGO_CONFIG,status:'PUBLISHED',accessPolicy:'OPEN'}
    expect(adaptCatalogCognitive(ref,row).displayDefinition).toEqual(initialCognitiveDefinition())
    expect(()=>adaptCatalogCognitive(ref,{...row,testType:'stroop'})).toThrow('CONTROLLED_IDENTITY')
    expect(()=>adaptCatalogCognitive(ref,{...row,config:{...SURVEY_GONOGO_CONFIG,totalTrials:100}})).toThrow('CONTROLLED_IDENTITY')
    expect(()=>adaptCatalogCognitive(ref,{...row,status:'RETIRED'})).toThrow('NOT_PUBLISHED')
    expect(()=>adaptCatalogCognitive(ref,{...row,accessPolicy:'GRANT'})).toThrow('ACCESS_POLICY')
  })
  it('loads an exact version and never falls back to latest or inactive database source',async()=>{
    const db={$queryRaw:vi.fn().mockResolvedValue([]),scale:{findFirst:vi.fn().mockResolvedValue(null)}}
    await expect(getCatalogSourceSnapshot({actorUserId:'actor',ref:scaleRef},db as never)).rejects.toThrow('NOT_PUBLISHED')
    expect(db.scale.findFirst).toHaveBeenCalledWith({where:{id:'scale-id',instrumentVersion:'2.0.0',status:'PUBLISHED'}})
  })
  it('denies cross-organization Form reads before touching definition data',async()=>{
    const db={$queryRaw:vi.fn().mockResolvedValue([]),huiteacherFormInstrument:{findFirst:vi.fn()}}
    await expect(getCatalogSourceSnapshot({actorUserId:'system-admin',ref:{kind:'FORM',sourceId:'private',sourceVersion:'1',organizationId:'other-org'}},db as never)).rejects.toThrow('ORGANIZATION_ADMIN_REQUIRED')
    expect(db.huiteacherFormInstrument.findFirst).not.toHaveBeenCalled()
    await expect(getCatalogSourceSnapshot({actorUserId:'system-admin',ref:{kind:'FORM',sourceId:'private',sourceVersion:'1'}},db as never)).rejects.toThrow('ORGANIZATION_REQUIRED')
  })
  it('lists a bounded page and never includes private Form rows without explicit organization',async()=>{
    const db={$queryRaw:vi.fn().mockResolvedValue([{platformRole:'SYSTEM_ADMIN'}]),
      scale:{findMany:vi.fn().mockResolvedValue([])},sjtAuthorRelease:{findMany:vi.fn().mockResolvedValue([])},
      cognitiveTestConfig:{findMany:vi.fn().mockResolvedValue([])},huiteacherFormInstrument:{findMany:vi.fn()}}
    const result=await listCatalogSources({actorUserId:'admin',kind:'SCALE',limit:500,page:1},db as never)
    expect(result.list.length).toBeLessThanOrEqual(25)
    expect(db.scale.findMany).toHaveBeenCalledWith(expect.objectContaining({take:26}))
    expect(db.huiteacherFormInstrument.findMany).not.toHaveBeenCalled()
  })
  it('rechecks multiple frozen grants with one query per family and rejects changed source',async()=>{
    const definition=scale(),ref=scaleRef
    const row={id:ref.sourceId,instrumentVersion:ref.sourceVersion,status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',code:'custom_source',name:'Source',definition,definitionHash:hashScaleDefinition(definition)}
    const db={$queryRaw:vi.fn().mockResolvedValue([]),scale:{findFirst:vi.fn().mockResolvedValue(row),findMany:vi.fn().mockResolvedValue([row])}}
    const frozen=await getCatalogSourceSnapshot({actorUserId:'admin',ref},db as never)
    await assertCatalogSourcesCurrent([{snapshot:frozen,actorUserId:'admin'},{snapshot:frozen,actorUserId:'admin'}],db as never)
    expect(db.scale.findMany).toHaveBeenCalledTimes(1)
    expect(db.$queryRaw).toHaveBeenCalledTimes(2) // one getter lock plus one batched family lock
    const lock=db.$queryRaw.mock.calls[1][0] as {strings:string[]}
    expect(lock.strings.join(' ')).toContain('FOR SHARE')
    expect(db.scale.findFirst).toHaveBeenCalledTimes(1)
    db.scale.findMany.mockResolvedValue([])
    await expect(assertCatalogSourcesCurrent([{snapshot:frozen,actorUserId:'admin'}],db as never)).rejects.toThrow('NOT_PUBLISHED')
    const noReads={scale:{findMany:vi.fn()}}
    await assertCatalogSourcesCurrent([],noReads as never)
    expect(noReads.scale.findMany).not.toHaveBeenCalled()
  })
  it('copies compatible published Form only under its own product authority and exact digest',async()=>{
    const definition={schemaVersion:2,pages:[{pageKey:'page',title:'Page',questions:[{itemKey:'item',type:'SHORT_TEXT',prompt:'Question',required:true,options:[],rows:[]}]}]}
    const row={id:'form',organizationId:'org',title:'Form',revision:3,definition,definitionDigest:canonicalHash({kind:'FORM',definition}),createdByUserId:'owner'}
    const db={$queryRaw:vi.fn().mockResolvedValue([{organizationId:'org',productAdmin:true}]),huiteacherFormInstrument:{findFirst:vi.fn().mockResolvedValue(row)}}
    const ref={kind:'FORM' as const,sourceId:'form',sourceVersion:'3',organizationId:'org'}
    const result=await getCatalogSourceSnapshot({actorUserId:'org-admin',ref},db as never)
    expect(result.compiledDefinition).toEqual(definition)
    expect(result.provenance.organizationId).toBe('org')
    db.huiteacherFormInstrument.findFirst.mockResolvedValue({...row,definitionDigest:'bad'})
    await expect(getCatalogSourceSnapshot({actorUserId:'org-admin',ref},db as never)).rejects.toThrow('DIGEST_MISMATCH')
  })

  it('lists 25 real-shaped source candidates with one family query and no per-row database lookup',async()=>{
    const definition=scale(),rows=Array.from({length:26},(_,i)=>({id:'source-'+i,instrumentVersion:'1',status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',code:'custom-'+i,name:'Source '+i,definition,definitionHash:hashScaleDefinition(definition)}))
    const db={scale:{findMany:vi.fn().mockResolvedValue(rows),findFirst:vi.fn()},$queryRaw:vi.fn()}
    const result=await listCatalogSources({actorUserId:'admin',kind:'SCALE',page:2,limit:25},db as never)
    expect(result.list).toHaveLength(25);expect(result.hasMore).toBe(true)
    expect(result.list.every(r=>r.available)).toBe(true)
    expect(db.scale.findMany).toHaveBeenCalledTimes(1)
    expect(db.scale.findMany).toHaveBeenCalledWith(expect.objectContaining({skip:25,take:26}))
    expect(db.scale.findFirst).not.toHaveBeenCalled();expect(db.$queryRaw).not.toHaveBeenCalled()
  })

  it('reuses an actual published owner Questionnaire Form section with exact content version and provenance',async()=>{
    const at=new Date('2026-10-17T00:00:00Z')
    const row={id:'section-id',questionnaireId:'questionnaire-id',title:'Questionnaire Form',description:'Answer for the last 7 days',position:0,contextSection:false,createdAt:at,updatedAt:at,
      questionnaire:{id:'questionnaire-id',name:'Published parent',creatorId:'admin',status:'PUBLISHED',updatedAt:at},
      items:[{id:'original-item-id',questionnaireId:'questionnaire-id',sectionId:'section-id',type:'single_choice',label:'Choose one',placeholder:null,required:true,position:0,sectionPosition:0,contextKey:null,createdAt:at,updatedAt:at,
        options:[{value:'Original Value A',label:'First'},{value:'Original Value B',label:'Second'}]}]} as QuestionnaireCatalogForm
    const ref={kind:'FORM' as const,sourceId:'questionnaire:section-id',sourceVersion:questionnaireFormSourceVersion(row)}
    const result=adaptCatalogQuestionnaireForm(ref,row,'admin')
    expect(result.provenance).toMatchObject({reuseAuthority:'OWNER_AUTHORIZED_REUSE',questionnaireId:'questionnaire-id',sectionId:'section-id',creatorId:'admin',formItemMapping:{i_0:{itemId:'original-item-id',options:{o_0:'Original Value A',o_1:'Original Value B'}}}})
    expect(result.compiledDefinition).toEqual(result.displayDefinition)
    expect((result.displayDefinition as any).pages[0].description).toBe('Answer for the last 7 days')
    const media=structuredClone(row);(media.items[0].options as any[])[0].images=[{url:'https://example.test/stimulus.png'}]
    expect(()=>adaptCatalogQuestionnaireForm({...ref,sourceVersion:questionnaireFormSourceVersion(media)},media,'admin')).toThrow('OPTION_MEDIA_OR_METADATA_UNSUPPORTED')
    expect(result.definitionDigest).toBe(ref.sourceVersion)
    expect(()=>adaptCatalogQuestionnaireForm(ref,row,'other')).toThrow('OWNER_REQUIRED')
    expect(()=>adaptCatalogQuestionnaireForm({...ref,sourceVersion:'old'},row,'admin')).toThrow('VERSION_CHANGED')
    expect(()=>adaptCatalogQuestionnaireForm({...ref,sourceVersion:questionnaireFormSourceVersion({...row,contextSection:true})},{...row,contextSection:true},'admin')).toThrow('CONTEXT_UNSUPPORTED')
    const db={$queryRaw:vi.fn().mockResolvedValue([]),questionnaireFormSection:{findMany:vi.fn().mockResolvedValue([row]),findFirst:vi.fn().mockResolvedValue(row)}}
    const listed=await listCatalogSources({actorUserId:'admin',kind:'FORM'},db as never)
    expect(listed.list).toEqual([{ref,title:row.title,available:true,unsupportedReason:null,definitionDigest:ref.sourceVersion}])
    expect(db.$queryRaw).not.toHaveBeenCalled();expect(db.questionnaireFormSection.findFirst).not.toHaveBeenCalled()
    expect(db.questionnaireFormSection.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{contextSection:false,items:{every:{contextKey:null}},questionnaire:{creatorId:'admin',status:'PUBLISHED'}}}))
    await expect(getCatalogSourceSnapshot({actorUserId:'admin',ref},db as never)).resolves.toEqual(result)
    expect(db.$queryRaw).toHaveBeenCalledTimes(3)
    await assertCatalogSourcesCurrent([{snapshot:result,actorUserId:'admin'}],db as never)
    expect(db.questionnaireFormSection.findMany).toHaveBeenCalledTimes(2)
  })

})
