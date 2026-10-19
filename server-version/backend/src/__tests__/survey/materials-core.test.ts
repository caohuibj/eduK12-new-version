import { describe,it,expect,vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { compileSurveyFlow,parseSurveyFlowDraft } from '../../modules/survey/flow.definition'
import { compileGroupQuotaPolicy } from '../../modules/survey/operations.definition'
import { materialExperimentSchema,materialOnlyExperimentSchema,validateMaterialExperiment,
  assignedMaterial,compileMaterialQuotaPolicy,type MaterialExperiment } from '../../modules/assessment-core/materials/definition'
import { chooseMaterialGroup,findLinkedMaterialAssignment,planMaterialAllocation } from '../../modules/assessment-core/materials/allocation'
const experiment=():MaterialExperiment=>({experimentKey:'materials',linkedPolicy:'KEEP_LINKED',groups:[
  {groupKey:'a',weight:1,materialTitle:'A',materialBody:'Alpha'},
  {groupKey:'b',weight:3,materialTitle:'B',materialBody:'Bravo'},
  {groupKey:'c',weight:2,materialTitle:'C',materialBody:'Charlie'},
]})
const capture=(fn:()=>unknown)=>{try{return {ok:true,value:fn()}}catch(e:any){return {ok:false,name:e.constructor.name,message:e.message,...(e.issues?{issues:e.issues}:{})}}}
const golden=JSON.parse(readFileSync(new URL('./fixtures/materials-survey-legacy.json',import.meta.url),'utf8'))
describe('Shared material core preserves pre-C20 Survey contracts',()=>{
  for(const c of golden.flows)it('legacy parse, errors and exact hash: '+c.name,()=>{
    expect(JSON.parse(JSON.stringify(capture(()=>parseSurveyFlowDraft(c.input))))).toEqual(c.parse)
    expect(JSON.parse(JSON.stringify(capture(()=>compileSurveyFlow(c.input,[],c.mode))))).toEqual(c.compile)
  })
  for(const [i,c] of golden.quotas.entries())it('legacy quota schema/compiler: '+i,()=>{
    const flow=compileSurveyFlow(golden.flows[0].input,[],'LINKED_WAVES')
    expect(JSON.parse(JSON.stringify(capture(()=>compileGroupQuotaPolicy(c.input,flow))))).toEqual(c.result)
  })
  it('keeps material schema strict and distinct from instrument subset variants',()=>{
    const e=experiment()
    expect(materialOnlyExperimentSchema.parse(e)).toEqual(e)
    expect(materialExperimentSchema.parse({...e,mode:'QUESTIONNAIRE_VARIANTS'}).mode).toBe('QUESTIONNAIRE_VARIANTS')
    expect(()=>materialOnlyExperimentSchema.parse({...e,mode:'QUESTIONNAIRE_VARIANTS'})).toThrow()
    expect(()=>materialOnlyExperimentSchema.parse({...e,groups:e.groups.map(g=>({...g,instrumentKeys:['unit']}))})).toThrow()
    expect(()=>compileMaterialQuotaPolicy({schemaVersion:1,groupLimits:{a:1,b:1,c:1}}, {...e,mode:'QUESTIONNAIRE_VARIANTS'})).toThrow(/不支持条件配额/)
  })
  it('uses durable linked identity capability and disallows undeclared templates',()=>{
    const e=experiment();e.groups[0].materialBody='{{secret}}'
    const issues:Array<{path:string;message:string}>=[]
    validateMaterialExperiment(e,{linked:true},issues)
    expect(issues).toEqual([{path:'flow.experiment.groups.0.materialBody',message:'受控文案引用了未声明的静态变量 secret'}])
  })
  it('projects only the persisted material and applies a controlled renderer',()=>{
    expect(assignedMaterial(experiment(),'b',s=>s+'!')).toEqual({blockKey:'assigned_material',title:'B!',body:'Bravo!'})
    expect(assignedMaterial(undefined,null)).toBeUndefined()
    expect(assignedMaterial(experiment(),'missing')).toBeUndefined()
  })
})
describe('Material selection and quota reservations are deterministic pure plans',()=>{
  it('maps every integer boundary to its exact weighted interval',()=>{
    const e=experiment()
    expect(Array.from({length:6},(_,i)=>chooseMaterialGroup(e,max=>{expect(max).toBe(6);return i})))
      .toEqual(['a','b','b','b','c','c'])
    const draw=vi.fn(()=>0)
    expect(chooseMaterialGroup(undefined,draw)).toBeNull();expect(draw).not.toHaveBeenCalled()
  })
  it.each([-1,6,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])('rejects invalid injected draw %s',n=>{
    expect(()=>chooseMaterialGroup(experiment(),()=>n)).toThrow('实验随机数源超出受控范围')
  })
  it('uses earliest matching history and never consumes later/decrypts unused records',()=>{
    const visited:string[]=[]
    function* history(){
      visited.push('old');yield {id:'old',schemaVersion:1,experimentKey:'other',groupKey:'a'}
      visited.push('first');yield {id:'first',schemaVersion:1,experimentKey:'materials',groupKey:'b'}
      throw new Error('must not decrypt later records')
    }
    expect(findLinkedMaterialAssignment(experiment(),history())).toEqual({groupKey:'b',inheritedFromAttemptId:'first'})
    expect(visited).toEqual(['old','first'])
    expect(()=>findLinkedMaterialAssignment(experiment(),[{id:'bad',schemaVersion:1,experimentKey:'materials',groupKey:'removed'}])).toThrow(/组别定义不一致/)
    expect(findLinkedMaterialAssignment({...experiment(),linkedPolicy:'RERANDOMIZE'},history())).toBeUndefined()
  })
  const policy={schemaVersion:1 as const,groupLimits:{a:1,b:2,c:3}}
  const buckets=()=>[{groupKey:'a',maxAssigned:1,assignedCount:1},{groupKey:'b',maxAssigned:2,assignedCount:0},{groupKey:'c',maxAssigned:3,assignedCount:0}]
  it('renormalizes weights over available candidates without modifying counters',()=>{
    const b=buckets(),before=structuredClone(b)
    expect([0,2,3,4].map(n=>planMaterialAllocation({experiment:experiment(),policy,buckets:b,draw:max=>{expect(max).toBe(5);return n}}).groupKey)).toEqual(['b','b','c','c'])
    expect(b).toEqual(before)
    expect(planMaterialAllocation({experiment:experiment(),policy,buckets:b,draw:()=>3})).toEqual({groupKey:'c',algorithm:'CRYPTO_QUOTA_WEIGHTED_V1',quotaBucket:b[2]})
  })
  it('does not rerandomize full linked groups and never draws for inherited assignments',()=>{
    const draw=vi.fn(()=>0),inherited={groupKey:'b',inheritedFromAttemptId:'prior'}
    expect(planMaterialAllocation({experiment:experiment(),policy,buckets:buckets(),inherited,draw})).toEqual({groupKey:'b',algorithm:'LINKED_INHERIT_V1',inheritedFromAttemptId:'prior',quotaBucket:buckets()[1]})
    expect(()=>planMaterialAllocation({experiment:experiment(),policy,buckets:buckets(),inherited:{...inherited,groupKey:'a'},draw})).toThrow(/不允许随机改变纵向分组/)
    expect(draw).not.toHaveBeenCalled()
  })
  it('fails closed on exhaustion or mismatched frozen limits',()=>{
    expect(()=>planMaterialAllocation({experiment:experiment(),policy,buckets:buckets().map(b=>({...b,assignedCount:b.maxAssigned})),draw:()=>0})).toThrow(/全部实验组名额已用尽/)
    expect(()=>planMaterialAllocation({experiment:experiment(),policy,buckets:buckets().slice(1),draw:()=>0})).toThrow(/计数器与冻结发布定义不一致/)
    expect(()=>planMaterialAllocation({experiment:experiment(),policy,buckets:buckets().map(b=>({...b,maxAssigned:100})),draw:()=>0})).toThrow(/计数器与冻结发布定义不一致/)
  })
  it('preserves ordinary no-experiment and non-quota assignment algorithms',()=>{
    expect(planMaterialAllocation({experiment:undefined,draw:()=>0})).toEqual({groupKey:null,algorithm:'NO_EXPERIMENT'})
    expect(planMaterialAllocation({experiment:{...experiment(),linkedPolicy:'RERANDOMIZE'},draw:()=>4})).toEqual({groupKey:'c',algorithm:'CRYPTO_RANDOM_INT_V1'})
  })
})
