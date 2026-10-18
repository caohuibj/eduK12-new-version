import { describe,expect,it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { compileTrainingFlow,evaluateTrainingFlowCondition,parseTrainingFlowDraft,scanTrainingFlow,
  trainingFlowUnitKey,trainingFlowItemKey,TrainingFlowError,TRAINING_FLOW_POLICY,
  type TrainingFlowUnit,type TrainingFlowDraft,type TrainingFlowFacts,type TrainingFlowAcceptedFact,
} from '../../modules/assessment-core/flow/training'
import { compileSurveyFlow,evaluateFlowCondition as surveyEvaluate,flowConditionSchema as surveySchema,
  type FrozenSurveyFlow } from '../../modules/survey/flow.definition'
import { flowConditionSchema,evaluateFlowCondition,type FlowCondition } from '../../modules/assessment-core/flow/definition'
import type { ResearchFrozenUnit } from '../../modules/survey/publication.service'

const form=(instrumentKey:string,type='SINGLE'):TrainingFlowUnit=>({
  instrumentKey,kind:'FORM',required:true,definitionHash:canonicalHash({instrumentKey,type}),
  displayDefinition:{pages:[{questions:[{itemKey:'answer',type,options:[{optionKey:'yes'},{optionKey:'no'}]}]}]},
})
const units=[form('first'),form('branch'),{instrumentKey:'scale',kind:'SCALE' as const,required:true,
  definitionHash:canonicalHash('scale')}]
const equals=(instrumentKey='first',value='yes'):FlowCondition=>({op:'EQUALS',
  field:{source:'ANSWER',instrumentKey,itemKey:'answer'},value})
const missing=(instrumentKey='first'):FlowCondition=>({op:'IS_MISSING',
  field:{source:'ANSWER',instrumentKey,itemKey:'answer'}})
const accepted=(answer:unknown='yes',changes:Partial<TrainingFlowAcceptedFact>={}):TrainingFlowAcceptedFact=>({
  status:'ACCEPTED',acceptedHash:canonicalHash(answer),requirementSatisfied:true,hasValidMeasurement:true,
  answers:{answer},...changes,
})
const draft=():TrainingFlowDraft=>({schemaVersion:1,blocks:[
  {blockKey:'opening',kind:'MATERIAL',title:'开始',body:'只展示'},
  {blockKey:'first_block',kind:'INSTRUMENT',instrumentKey:'first'},
  {blockKey:'branch_material',kind:'MATERIAL',body:'此前已接受 yes',when:equals()},
  {blockKey:'branch_block',kind:'INSTRUMENT',instrumentKey:'branch',when:equals()},
  {blockKey:'scale_block',kind:'INSTRUMENT',instrumentKey:'scale'},
  {blockKey:'closing',kind:'MATERIAL',body:'已完成'},
]})
const freeze=(flow=draft(),candidateUnits=units)=>compileTrainingFlow(flow,candidateUnits)

describe('shared Survey Flow compiler compatibility',()=>{
  it('reexports exactly the shared schema and evaluator without changing Survey semantics',()=>{
    expect(surveySchema).toBe(flowConditionSchema)
    expect(surveyEvaluate).toBe(evaluateFlowCondition)
    expect(surveyEvaluate(missing(),{},{})).toBe(true)
    expect(surveyEvaluate({op:'NOT',term:equals()}, {},{})).toBe(true)
  })
  it('retains Survey numeric, embedded, trim/default, flow and variant hashes exactly',()=>{
    const surveyUnits=[form('first','NUMBER'),form('branch')] as unknown as ResearchFrozenUnit[]
    const flow={schemaVersion:1,embeddedData:[{key:'year',type:'NUMBER',source:'STATIC',value:2026}],
      experiment:{experimentKey:'arms',linkedPolicy:'RERANDOMIZE',mode:'QUESTIONNAIRE_VARIANTS',groups:[
        {groupKey:'all',weight:2,variantLabel:'完整版',materialTitle:'',materialBody:'',instrumentKeys:['first','branch']},
        {groupKey:'short',weight:1,variantLabel:'短版',materialTitle:'',materialBody:'',instrumentKeys:['first']},
      ]},blocks:[
        {blockKey:'a',kind:'INSTRUMENT',instrumentKey:'first'},
        {blockKey:'material',kind:'MATERIAL',body:'年份{{year}}',when:{op:'GT',
          field:{source:'ANSWER',instrumentKey:'first',itemKey:'answer'},value:3}},
        {blockKey:'b',kind:'INSTRUMENT',instrumentKey:'branch'},
      ]}
    const frozen=compileSurveyFlow(flow,surveyUnits,'SINGLE_UNLINKED')
    const groups=flow.experiment.groups.map(group=>({...group,variantDigest:canonicalHash({schemaVersion:1,
      groupKey:group.groupKey,variantLabel:group.variantLabel,
      units:surveyUnits.filter(u=>group.instrumentKeys.includes(u.instrumentKey)),
      blocks:flow.blocks.filter(b=>b.kind!=='INSTRUMENT'||group.instrumentKeys.includes(b.instrumentKey!)),
      embeddedData:flow.embeddedData,materialTitle:group.materialTitle,materialBody:group.materialBody,
    })}))
    expect(frozen).toEqual({...flow,experiment:{...flow.experiment,groups},
      flowDigest:canonicalHash({...flow,experiment:{...flow.experiment,groups}})})
    const trimmed=compileSurveyFlow({schemaVersion:1,blocks:[
      {blockKey:'a',kind:'INSTRUMENT',instrumentKey:'first'},
      {blockKey:'m',kind:'MATERIAL',body:'  展示  '},
    ]},[surveyUnits[0]],'SINGLE_UNLINKED')
    expect(trimmed.flowDigest).toBe(canonicalHash({schemaVersion:1,embeddedData:[],blocks:[
      {blockKey:'a',kind:'INSTRUMENT',instrumentKey:'first'},
      {blockKey:'m',kind:'MATERIAL',body:'展示'},
    ]}))
  })
})

describe('Training Flow compilation and frozen candidate union',()=>{
  it('freezes stable typed section/item keys, policy and full candidate definitions',()=>{
    const id='079a943b-aa1c-48b8-968b-70a412f38642'
    expect(trainingFlowUnitKey(id)).toBe('section_079a943b_aa1c_48b8_968b_70a412f38642')
    expect(trainingFlowItemKey(id)).toBe('item_079a943b_aa1c_48b8_968b_70a412f38642')
    const frozen=freeze()
    expect(frozen.policy).toEqual(TRAINING_FLOW_POLICY)
    expect(frozen.unionDigest).toBe(canonicalHash(units))
    const {flowDigest,...content}=frozen
    expect(flowDigest).toBe(canonicalHash(content))
    expect(freeze(draft(),units.map(u=>({...u,definitionHash:canonicalHash(u)})))).not.toEqual(frozen)
  })
  it.each(['NUMBER','SHORT_TEXT','LONG_TEXT','SLIDER','MATRIX','DATE','SCORE'])('rejects non-choice Form %s conditions even for IS_MISSING',type=>{
    const altered=[form('first',type),...units.slice(1)]
    expect(()=>freeze(draft(),altered)).toThrow(TrainingFlowError)
    const d=draft();d.blocks[2].when=missing()
    expect(()=>freeze(d,altered)).toThrow(TrainingFlowError)
  })
  it.each(['SINGLE','MULTIPLE','LIKERT'])('supports prior %s with legal operator and options',type=>{
    const d=draft()
    if(type==='MULTIPLE')for(const i of [2,3])d.blocks[i].when={op:'INCLUDES',
      field:{source:'ANSWER',instrumentKey:'first',itemKey:'answer'},value:'yes'}
    expect(()=>freeze(d,[form('first',type),...units.slice(1)])).not.toThrow()
  })
  it('rejects self/future/unknown/non-Form/embedded/score sources and invalid operators',()=>{
    for(const when of [equals('branch'),equals('unknown'),equals('scale'),
      {op:'EQUALS',field:{source:'EMBEDDED',key:'x'},value:'yes'},
      {op:'GT',field:{source:'ANSWER',instrumentKey:'first',itemKey:'answer'},value:1},
      {op:'INCLUDES',field:{source:'ANSWER',instrumentKey:'first',itemKey:'answer'},value:'yes'},
      {op:'EQUALS',field:{source:'ANSWER',instrumentKey:'first',itemKey:'answer'},value:'unknown'},
      {op:'EQUALS',field:{source:'SCORE',instrumentKey:'first',itemKey:'answer'},value:1},
    ]){
      const d=draft();d.blocks[2].when=when as FlowCondition
      expect(()=>freeze(d)).toThrow(TrainingFlowError)
    }
    const self=draft();self.blocks[1].when=equals()
    expect(()=>freeze(self)).toThrow(TrainingFlowError)
  })
  it('rejects unknown fields, missing/duplicate candidates, invalid material and unconditional END',()=>{
    for(const input of [ {...draft(),embeddedData:[]},{...draft(),experiment:{}},
      {...draft(),blocks:draft().blocks.filter(b=>b.instrumentKey!=='scale')},
      {...draft(),blocks:[...draft().blocks,{blockKey:'duplicate',kind:'INSTRUMENT',instrumentKey:'first'}]},
      {...draft(),blocks:[...draft().blocks,{blockKey:'empty',kind:'MATERIAL',body:'  '}]},
      {...draft(),blocks:[...draft().blocks,{blockKey:'end',kind:'END',termination:'COMPLETE_EARLY'}]},
    ])expect(()=>compileTrainingFlow(input,units)).toThrow(TrainingFlowError)
    expect(()=>freeze(draft(),[...units,units[0]])).toThrow(TrainingFlowError)
  })
  it('bounds blocks at 64, all condition nodes at 64, logical depth at six and cycles before Zod',()=>{
    const base:TrainingFlowDraft={schemaVersion:1,blocks:[{blockKey:'a',kind:'INSTRUMENT',instrumentKey:'first'}]}
    for(let i=0;i<63;i++)base.blocks.push({blockKey:'m'+i,kind:'MATERIAL',body:'x',when:equals()})
    expect(()=>freeze(base,[units[0]])).not.toThrow()
    base.blocks[1].when={op:'NOT',term:equals()}
    expect(()=>freeze(base,[units[0]])).not.toThrow()
    base.blocks[2].when={op:'NOT',term:equals()}
    expect(()=>freeze(base,[units[0]])).toThrow(TrainingFlowError)
    const tooMany={...base,blocks:[...base.blocks,{blockKey:'overflow',kind:'MATERIAL',body:'x'}]}
    expect(()=>compileTrainingFlow(tooMany,[units[0]])).toThrow(TrainingFlowError)
    const deep=draft();let condition=equals()
    for(let i=0;i<6;i++)condition={op:'AND',terms:[condition]}
    deep.blocks[2].when=condition
    expect(()=>freeze(deep)).not.toThrow()
    deep.blocks[2].when={op:'NOT',term:condition}
    expect(()=>freeze(deep)).toThrow(TrainingFlowError)
    const cyclic:any={op:'NOT'};cyclic.term=cyclic
    expect(()=>parseTrainingFlowDraft({...draft(),blocks:[{blockKey:'x',kind:'MATERIAL',body:'x',when:cyclic}]})).toThrow(TrainingFlowError)
    let huge:unknown=equals();for(let i=0;i<80;i++)huge={op:'NOT',term:huge}
    expect(()=>parseTrainingFlowDraft({...draft(),blocks:[{blockKey:'x',kind:'MATERIAL',body:'x',when:huge}]})).toThrow(TrainingFlowError)
  })
})

describe('Training accepted/pending/skipped facts and path scan',()=>{
  it('does not turn pending into missing, false, or true through NOT',()=>{
    for(const condition of [equals(),missing(),{op:'NOT',term:equals()} as FlowCondition,
      {op:'NOT',term:missing()} as FlowCondition]){
      expect(evaluateTrainingFlowCondition(condition,{})).toBe('PENDING')
      expect(evaluateTrainingFlowCondition(condition,{first:{status:'PENDING'}})).toBe('PENDING')
      expect(evaluateTrainingFlowCondition(condition,{first:{status:'SKIPPED'}})).toBe('SKIPPED')
    }
    expect(evaluateTrainingFlowCondition(missing(),{first:accepted(null)})).toBe('TRUE')
    expect(evaluateTrainingFlowCondition(missing(),{first:accepted('yes')})).toBe('FALSE')
    expect(evaluateTrainingFlowCondition({op:'IS_MISSING',field:{source:'ANSWER',instrumentKey:'first',itemKey:'constructor'}},{first:accepted(null,{answers:{}})})).toBe('TRUE')
  })
  it('suppresses the entire NOT/OR expression when any source was skipped',()=>{
    expect(evaluateTrainingFlowCondition({op:'NOT',term:equals('branch')},{branch:{status:'SKIPPED'}})).toBe('SKIPPED')
    expect(evaluateTrainingFlowCondition({op:'OR',terms:[equals(),equals('branch')]},
      {first:accepted(),branch:{status:'SKIPPED'}})).toBe('SKIPPED')
  })
  it('stops at the first unaccepted tool, reveals only reached material and never future tool or END',()=>{
    const path=scanTrainingFlow(freeze(),units,{})
    expect(path.currentInstrumentKey).toBe('first')
    expect(path.reachedInstrumentKeys).toEqual(['first'])
    expect(path.materials.map(m=>m.blockKey)).toEqual(['opening'])
    expect(path.shownBlocks).toEqual(['opening','first_block'])
    expect(path.skipped).toEqual([])
    expect(path.taskSatisfaction).toBe('PENDING')
    const advanced=scanTrainingFlow(freeze(),units,{first:accepted()})
    expect(advanced.currentInstrumentKey).toBe('branch')
    expect(advanced.reachedInstrumentKeys).toEqual(['first','branch'])
    expect(advanced.materials.map(m=>m.blockKey)).toEqual(['opening','branch_material'])
  })
  it('derives skipped facts from false prior choices and does not delete any frozen candidate',()=>{
    const flow=freeze(),before=canonicalHash(flow)
    const path=scanTrainingFlow(flow,units,{first:accepted('no')})
    expect(path.currentInstrumentKey).toBe('scale')
    expect(path.reachedInstrumentKeys).toEqual(['first','scale'])
    expect(path.skipped).toEqual([{instrumentKey:'branch',reason:'CONDITION_FALSE'}])
    expect(path.materials.map(m=>m.blockKey)).toEqual(['opening'])
    expect(canonicalHash(flow)).toBe(before)
    expect(flow.blocks.filter(b=>b.kind==='INSTRUMENT')).toHaveLength(3)
  })
  it('does not execute a NOT dependent tool after its source was skipped',()=>{
    const d=draft();d.blocks[4].when={op:'NOT',term:missing('branch')}
    const path=scanTrainingFlow(freeze(d),units,{first:accepted('no')})
    expect(path.skipped).toEqual([{instrumentKey:'branch',reason:'CONDITION_FALSE'},
      {instrumentKey:'scale',reason:'DEPENDENCY_SKIPPED'}])
    expect(path.termination).toBe('COMPLETE')
  })
  it('rejects accepted hidden/future facts, forged skip flags and digest/candidate tampering',()=>{
    const flow=freeze()
    for(const facts of [{branch:accepted()},{first:accepted('no'),branch:accepted()},
      {first:{status:'SKIPPED'}},{unknown:accepted()}] as TrainingFlowFacts[])
      expect(()=>scanTrainingFlow(flow,units,facts)).toThrow(TrainingFlowError)
    expect(()=>scanTrainingFlow({...flow,flowDigest:'bad'},units,{})).toThrow(TrainingFlowError)
    expect(()=>scanTrainingFlow(flow,units.slice(0,2),{})).toThrow(TrainingFlowError)
    expect(()=>scanTrainingFlow({...flow,policy:{...flow.policy,material:'OTHER'} as any},units,{})).toThrow(TrainingFlowError)
  })
  it('binds immutable accepted hashes into deterministic path evidence',()=>{
    const flow=freeze(),facts={first:accepted()}
    const path=scanTrainingFlow(flow,units,facts)
    expect(scanTrainingFlow(flow,units,facts)).toEqual(path)
    const {pathDigest,...evidence}=path
    expect(pathDigest).toBe(canonicalHash(evidence))
    expect(scanTrainingFlow(flow,units,{first:accepted('yes',{acceptedHash:'different'})}).pathDigest).not.toBe(pathDigest)
  })
  it.each(['SCREEN_OUT','COMPLETE_EARLY'] as const)('separates %s terminal state from task satisfaction',termination=>{
    const d=draft();d.blocks.splice(2,0,{blockKey:'end',kind:'END',termination,when:equals()})
    const flow=freeze(d)
    const path=scanTrainingFlow(flow,units,{first:accepted()})
    expect(path.termination).toBe(termination)
    expect(path.endBlockKey).toBe('end')
    expect(path.currentInstrumentKey).toBeNull()
    expect(path.reachedInstrumentKeys).toEqual(['first'])
    expect(path.materials.map(m=>m.blockKey)).toEqual(['opening'])
    expect(path.skipped).toEqual(['branch','scale'].map(instrumentKey=>({instrumentKey,reason:'END_'+termination})))
    expect(path.taskSatisfaction).toBe(termination==='SCREEN_OUT'?'NOT_SATISFIED':'SATISFIED')
    for(const changes of [{requirementSatisfied:false},{hasValidMeasurement:false}])
      expect(scanTrainingFlow(flow,units,{first:accepted('yes',changes)}).taskSatisfaction).toBe('NOT_SATISFIED')
  })
  it('complete terminal remains NOT_SATISFIED when an accepted required tool failed or no valid measurement exists',()=>{
    const flow=freeze()
    expect(scanTrainingFlow(flow,units,{first:accepted('no'),scale:accepted()}).taskSatisfaction).toBe('SATISFIED')
    expect(scanTrainingFlow(flow,units,{first:accepted('no',{requirementSatisfied:false}),scale:accepted()}).taskSatisfaction).toBe('NOT_SATISFIED')
    expect(scanTrainingFlow(flow,units,{first:accepted('no',{hasValidMeasurement:false}),scale:accepted(null,{hasValidMeasurement:false})}).taskSatisfaction).toBe('NOT_SATISFIED')
  })
})

describe('hidden accepted Form dependencies',()=>{
  it.each([missing(),{op:'NOT',term:equals()} as FlowCondition,{op:'OR',terms:[equals(),missing()]} as FlowCondition])('suppresses the whole condition for NOT_SHOWN: %j',condition=>{
    expect(evaluateTrainingFlowCondition(condition,{first:accepted(null,{unavailableItemKeys:['answer']})})).toBe('SKIPPED')
  })
  it('keeps explicitly missing or refused accepted answers distinct from hidden and pending',()=>{
    expect(evaluateTrainingFlowCondition(missing(),{first:accepted(null)})).toBe('TRUE')
    expect(evaluateTrainingFlowCondition(missing(),{first:{status:'PENDING'}})).toBe('PENDING')
    expect(evaluateTrainingFlowCondition(equals(),{first:accepted('yes',{unavailableItemKeys:['another']})})).toBe('TRUE')
  })
})
