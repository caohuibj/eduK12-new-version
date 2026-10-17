import {describe,expect,it} from 'vitest'
import {compileFrozenResearchUnit,type ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {compileSurveyFlow,type SurveyFlowDraft,surveyVariantProvenance} from '../../modules/survey/flow.definition'
import {chooseSurveyGroup,assertSurveyFlowAssignment,assignedSurveySnapshot,type SurveyFlowAssignment} from '../../modules/survey/flow.assignment'
import {buildSurveyFlowPublicProjection} from '../../modules/survey/flow.runtime'
import {computeSurveyFinal} from '../../modules/survey/final.compute'
import {initialCognitiveDefinition} from '../../modules/survey/cognitive.definition'
import {surveyImageRefs} from '../../modules/survey/media.references'
import {compileGroupQuotaPolicy} from '../../modules/survey/operations.definition'
const units=['version_a','version_b'].map(instrumentKey=>compileFrozenResearchUnit({
  id:instrumentKey,instrumentKey,kind:'FORM',title:instrumentKey,revision:1,
  definition:{schemaVersion:1,pages:[{pageKey:'page',title:'Questionnaire',questions:[{
    itemKey:'answer',type:'SINGLE',prompt:instrumentKey,required:true,rows:[],
    options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],
  }]}]},
}))
const draft=():SurveyFlowDraft=>({schemaVersion:1,embeddedData:[],
  experiment:{experimentKey:'versions',mode:'QUESTIONNAIRE_VARIANTS',linkedPolicy:'RERANDOMIZE',groups:[
    {groupKey:'a',variantLabel:'A',weight:1,instrumentKeys:['version_a'],materialTitle:'',materialBody:''},
    {groupKey:'b',variantLabel:'B',weight:3,instrumentKeys:['version_b'],materialTitle:'',materialBody:''},
  ]},blocks:units.map(u=>({blockKey:u.instrumentKey,kind:'INSTRUMENT',instrumentKey:u.instrumentKey})),
})
function fixture(){
  const flow=compileSurveyFlow(draft(),units,'SINGLE_UNLINKED')
  const assignment:SurveyFlowAssignment={schemaVersion:1,flowDigest:flow.flowDigest,experimentKey:'versions',
    groupKey:'a',algorithm:'CRYPTO_RANDOM_INT_V1',assignedAt:'2026-10-17T00:00:00.000Z',
    variant:surveyVariantProvenance(flow,'a')}
  const snapshot:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'project',waveId:'wave',
    collectionMode:'SINGLE_UNLINKED',consentVersion:1,linkageNoticeConfirmed:false,consentDigest:'consent',
    units,flow,runtimeStatus:'SURVEY_FINAL_V1'}
  return {flow,assignment,snapshot}
}
describe('Frozen questionnaire variants',()=>{
  it('freezes independent versions with cryptographic integer weight boundaries and exact provenance',()=>{
    const {flow,assignment}=fixture()
    expect([0,1,2,3].map(draw=>chooseSurveyGroup(flow,()=>draw))).toEqual(['a','b','b','b'])
    expect(()=>chooseSurveyGroup(flow,()=>4)).toThrow()
    expect(assignment.variant).toMatchObject({variantKey:'a',variantLabel:'A',weight:1,totalWeight:4,
      probability:0.25,allocationConfigId:flow.flowDigest})
    expect(flow.experiment!.groups[0].variantDigest).not.toEqual(flow.experiment!.groups[1].variantDigest)
    expect(()=>assertSurveyFlowAssignment(flow,assignment)).not.toThrow()
    expect(()=>assertSurveyFlowAssignment(flow,{...assignment,variant:{...assignment.variant!,weight:2}})).toThrow()
  })
  it('projects only assigned blocks and preserves union NOT_SHOWN results',()=>{
    const {flow,assignment,snapshot}=fixture()
    const publicFlow=buildSurveyFlowPublicProjection(flow,assignment)
    expect(publicFlow.blocks.map(b=>b.instrumentKey)).toEqual(['version_a'])
    expect(publicFlow.selectedMaterial).toBeUndefined()
    expect(JSON.stringify(publicFlow)).not.toContain('version_b')
    const result=computeSurveyFinal(snapshot,{version_a:{answer:'yes'}},assignment,['version_a'])
    expect(result.units[1]).toMatchObject({instrumentKey:'version_b',notExecuted:true,
      missing:[{itemKey:'answer',reason:'NOT_SHOWN'}]})
    expect(result.executionTrace?.variant).toEqual(assignment.variant)
    expect(()=>computeSurveyFinal(snapshot,{version_a:{answer:'yes'},version_b:{answer:'no'}},assignment,['version_a'])).toThrow()
  })
  it('rejects invalid memberships, weights, inheritance, quotas and cross-arm conditions',()=>{
    for(const weight of [0,NaN,Infinity,101,1.5]){
      const d=draft();d.experiment!.groups[0].weight=weight
      expect(()=>compileSurveyFlow(d,units,'SINGLE_UNLINKED')).toThrow()
    }
    const duplicate=draft();duplicate.experiment!.groups[0].instrumentKeys=['version_a','version_a']
    expect(()=>compileSurveyFlow(duplicate,units,'SINGLE_UNLINKED')).toThrow()
    const omitted=draft();omitted.experiment!.groups[1].instrumentKeys=['version_a']
    expect(()=>compileSurveyFlow(omitted,units,'SINGLE_UNLINKED')).toThrow()
    const unknown=draft();unknown.experiment!.groups[1].instrumentKeys=['unknown']
    expect(()=>compileSurveyFlow(unknown,units,'SINGLE_UNLINKED')).toThrow()
    const linked=draft();linked.experiment!.linkedPolicy='KEEP_LINKED'
    expect(()=>compileSurveyFlow(linked,units,'LINKED_WAVES')).toThrow()
    const cross=draft();cross.blocks[1].when={op:'EQUALS',field:{source:'ANSWER',instrumentKey:'version_a',itemKey:'answer'},value:'yes'}
    expect(()=>compileSurveyFlow(cross,units,'SINGLE_UNLINKED')).toThrow()
    expect(()=>compileGroupQuotaPolicy({schemaVersion:1,groupLimits:{a:10,b:10}},fixture().flow)).toThrow()
  })
  it('allows explicitly shared identical instruments and binds changed revisions to new digests',()=>{
    const d=draft();d.experiment!.groups[1].instrumentKeys=['version_a','version_b']
    const original=compileSurveyFlow(d,units,'SINGLE_UNLINKED')
    const changed=compileSurveyFlow(d,units.map(u=>({...u,draftRevision:2})),'SINGLE_UNLINKED')
    expect(original.experiment!.groups[0].variantDigest).not.toEqual(changed.experiment!.groups[0].variantDigest)
    expect(original.flowDigest).not.toEqual(changed.flowDigest)
  })
  it('rejects absent metadata and wrong arm digests, and scopes frozen image authorization',()=>{
    const {snapshot,flow,assignment}=fixture()
    expect(()=>assertSurveyFlowAssignment(flow,{...assignment,variant:undefined})).toThrow()
    expect(()=>assertSurveyFlowAssignment(flow,{...assignment,groupKey:'b'})).toThrow()
    const withImages={...snapshot,units:snapshot.units.map((unit,i)=>({...unit,displayDefinition:{schemaVersion:1,pages:[{
      pageKey:'p',title:'P',questions:[{image:{asset:{assetId:'asset_'+i,contentHash:String(i),mimeType:'image/png'},
        altText:'Image',rightsStatus:'self_authored',rightsNote:'Test'}}],
    }]}}))}
    const selected=assignedSurveySnapshot(withImages,assignment)
    expect(surveyImageRefs(selected.units.map(u=>({kind:u.kind,definition:u.displayDefinition})))
      .map(ref=>ref.asset.assetId)).toEqual(['asset_0'])
  })
  it('rejects per-arm cognitive feedback policy differences',()=>{
    const definitions=[initialCognitiveDefinition(),initialCognitiveDefinition()]
    definitions[1].feedback={...definitions[1].feedback,release:'AFTER_COLLECTION'}
    const cognitive=definitions.map((definition,i)=>compileFrozenResearchUnit({id:'c'+i,instrumentKey:'c'+i,
      title:'Cognitive',kind:'COGNITIVE',revision:1,definition}))
    const d=draft()
    d.experiment!.groups.forEach((group,i)=>{group.instrumentKeys!.push('c'+i)})
    d.blocks.push(...cognitive.map(u=>({blockKey:u.instrumentKey,kind:'INSTRUMENT' as const,instrumentKey:u.instrumentKey})))
    expect(()=>compileSurveyFlow(d,[...units,...cognitive],'SINGLE_UNLINKED')).toThrow()
  })

})
