import {describe,it,expect,vi} from 'vitest'
import {authoringFixture} from './fixtures'
import {parseDeclarativePackage,type DerivedPackage} from '../../modules/assessment-bundle/onboarding/contract'
import {runDerivedEvidence,runDeclarativeEvidence,mapDeclarativeEvidence} from '../../modules/assessment-bundle/onboarding/engine'
import {projectDerivedBundleView} from '../../modules/assessment-bundle/onboarding/derived-report'
import {verifyPackageFixtures} from '../../modules/assessment-bundle/onboarding/fixtures'
import {createProductBundleAnalysisEngineRegistry} from '../../modules/assessment-bundle/bootstrap'
import {freezeBundleProductionDefinition,readFrozenBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {compileBundleRuntimeFromFrozenRead} from '../../modules/assessment-bundle/compile'
import {projectBundleReportFacts} from '../../modules/assessment-bundle/report-facts'
import {validateBundleReportFacts} from '../../modules/assessment-bundle/evidence'
import {encryptCognitivePayload,decryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import type {EvidenceItemV1} from '../../modules/assessment-bundle/types'
import historicalPackages from '../../modules/assessment-bundle/generated/packages.json'

const p=(value:number)=>({state:'present' as const,value})
const all=(...conditions:any[])=>({op:'all',conditions})
const compare=(evidenceKey:string,op:string,value:number)=>({op,evidenceKey,value})
function rawPackage():any {
  const base=authoringFixture(),slots=[['beliefs',['c']],['strategies',['r']],['task',['correct','done']],['interest',Array.from({length:8},(_,i)=>'i'+(i+1))],['background',['nfc']]] as const
  const mappings=slots.flatMap(([slotKey,keys])=>keys.map(key=>({evidenceKey:key,slotKey,selector:key,valueType:'number',unit:'points',construct:'fixture.'+key,role:key==='nfc'?'SUPPORTING':'PRIMARY',direction:'higher',qualityPolicy:'interpretable_only'})))
  const rules=[...([['em1','lte',20,'gte',5.5],['em2','lte',20,'lte',2.5],['em3','gte',44,'gte',5.5],['em4','gte',44,'lte',2.5]] as const).map(([ruleId,a,b,c,d])=>({ruleId,when:all(compare('c',a,b),compare('r',c,d)),kind:'cross_source_condition',text:ruleId+' experimental own text',evidenceKeys:['c','r'],supportRefs:['design']})),
    {ruleId:'independent_r',when:{op:'present',evidenceKey:'r'},kind:'independent_summary',text:'independent strategy evidence',evidenceKeys:['r'],supportRefs:[]},
    {ruleId:'independent_nfc',when:{op:'present',evidenceKey:'nfc'},kind:'independent_summary',text:'independent supporting evidence',evidenceKeys:['nfc'],supportRefs:[]},
    {ruleId:'missing_c',when:{op:'missing',evidenceKey:'c'},kind:'limitation',text:'missing core, keep other source',evidenceKeys:['c'],supportRefs:[]}]
  const derived=[{key:'c_pos',op:'RANGE_POSITION',input:'c',min:8,max:56,orientation:'DIRECT'},{key:'r_pos',op:'RANGE_POSITION',input:'r',min:1,max:7,orientation:'DIRECT'},{key:'n',op:'SCALE',input:'done',factor:2},{key:'accuracy',op:'RATIO',numerator:'correct',denominator:'done',denominatorMultiplier:2},{key:'interest_max',op:'EXACT_MAX_SET',inputs:Array.from({length:8},(_,i)=>'i'+(i+1))}]
  const rows=[{rowKey:'c_row',valueRef:{kind:'evidence',key:'c'},label:'情绪信念合计',unit:'sum',range:{min:8,max:56},itemCount:8,order:0},{rowKey:'r_row',valueRef:{kind:'evidence',key:'r'},label:'重评均分',unit:'mean',range:{min:1,max:7},itemCount:7,order:1},{rowKey:'c_axis',valueRef:{kind:'derived',key:'c_pos'},label:'信念量尺位置',unit:'position',range:{min:0,max:1},order:2},{rowKey:'r_axis',valueRef:{kind:'derived',key:'r_pos'},label:'重评量尺位置',unit:'position',range:{min:0,max:1},order:3},{rowKey:'n_row',valueRef:{kind:'derived',key:'n'},label:'实际分母N',unit:'count',order:4},{rowKey:'accuracy_row',valueRef:{kind:'derived',key:'accuracy'},denominatorRef:{kind:'derived',key:'n'},label:'正确率',unit:'ratio',range:{min:0,max:1},order:5},...Array.from({length:8},(_,i)=>({rowKey:'interest_'+(i+1),valueRef:{kind:'evidence',key:'i'+(i+1)},label:'兴趣方向'+(i+1),unit:'mean',range:{min:1,max:5},order:i+6})),{rowKey:'nfc_row',valueRef:{kind:'evidence',key:'nfc'},label:'思考投入合计',unit:'sum',range:{min:10,max:50},order:14}]
  return {...base,schemaVersion:3,manifest:{...base.manifest,packageSchemaVersion:3,definition:{...base.manifest.definition,bundleKey:'derived_fixture',engine:{key:'declarative-evidence-v1',version:'1.2.0'},slots:slots.map(([slotKey,keys],position)=>({slotKey,unitType:'SCALE',position,required:true,instrumentKey:'synthetic_'+slotKey,instrumentVersion:'1.0.0',respondentType:'SELF',valueSelectors:[...keys]}))}},evidence:mappings,rules:{version:'1.0.0',items:rules,derivations:derived,theme:{axisKeys:['c_pos','r_pos'],ruleIds:['em1','em2','em3','em4']}},report:{...base.report,narrativeContent:'BUNDLE_OWNED_SELF',rows,blocks:[{blockId:'all',kind:'conclusions',title:'原始结果和组合',audience:['student'],ruleIds:rules.map(r=>r.ruleId),rowKeys:rows.map(r=>r.rowKey),maxSetKeys:['interest_max']}]},scientific:{maturity:'EXPERIMENTAL',scope:'Synthetic core contract only',references:[{id:'design',citation:'Original synthetic theory fixture; no empirical claims',allowedClaims:['cross_source_condition']}]}}
}
const checked=()=>parseDeclarativePackage(rawPackage()) as DerivedPackage
function values(){return {c:p(44),r:p(39/7),done:p(2),correct:p(3),nfc:p(50),...Object.fromEntries(Array.from({length:8},(_,i)=>['i'+(i+1),p(i===6?5:3)]))}}
function evidence(pack:DerivedPackage,overrides:Record<string,any>={}):EvidenceItemV1[]{const v:Record<string,any>={...values(),...overrides};return pack.evidence.map(e=>({evidenceKey:e.evidenceKey,constructKey:e.construct,role:e.role,criterionBandKey:null,source:{kind:'SCALE_SCORE',slotKey:e.slotKey,scoreKey:e.selector,sourceResultHash:'1'.repeat(64)},value:v[e.evidenceKey]??{state:'missing'},quality:v[e.evidenceKey]?.state==='invalid'?'invalid':v[e.evidenceKey]?.state==='present'?'interpretable':'unavailable'}))}
function run(pack=checked(),e=evidence(pack)):any{return runDerivedEvidence({declarativePackage:pack,snapshot:{bundleKey:'derived_fixture',bundleVersion:'1.0.0'} as any,evidence:e} as any)}
const caps={numericScores:true,references:false,individualInterpretations:true,scoreDerivedLabels:false,resultQualityDetails:true,rawAnswers:false,itemScores:false,methods:true,educationalContent:false}
function project(pack=checked(),e=evidence(pack),overrides:Record<string,unknown>={}){return projectDerivedBundleView({pack,payload:run(pack,e).payload,evidence:e,policies:new Map(pack.manifest.definition.slots.map(s=>[s.slotKey,{...caps}])),availableEvidenceKeys:new Set(pack.evidence.map(e=>e.evidenceKey)),audience:'student',...overrides} as any)!}
function sources(pack:DerivedPackage){const v=values();return pack.manifest.definition.slots.map(slot=>({slotKey:slot.slotKey,instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion,sourceResultHash:'1'.repeat(64),envelopeResultHash:null,qualityState:'interpretable',profileIdentity:{runtimeDefinitionHash:'2'.repeat(64),scoringVersion:'1.0.0',sourceResultId:'synthetic',qualityFlags:[]},scores:pack.evidence.filter(e=>e.slotKey===slot.slotKey).map(e=>({scoreKey:e.selector,value:(v as any)[e.evidenceKey].value,status:'calculated',criterionBandKey:null}))}))}

describe('versioned derived Bundle core',()=>{
  it('computes original-sum coordinates, exact ratio/count and rule-linked theme without rescoring',()=>{
    const out=run().payload.derived
    expect(out.scalars.find((s:any)=>s.key==='c_pos').value).toBe(.75)
    expect(out.scalars.find((s:any)=>s.key==='r_pos').value).toBe((39/7-1)/6)
    expect(out.scalars.find((s:any)=>s.key==='n').value).toBe(4)
    expect(out.scalars.find((s:any)=>s.key==='accuracy').value).toBe(.75)
    expect(out.theme).toMatchObject({state:'MATCHED',profileId:'em3',margin:null})
    expect(project().rows.find(r=>r.rowKey==='accuracy_row')).toMatchObject({value:.75,denominator:4})
  })
  it('keeps inclusive corners and continuous middle coordinates distinct',()=>{
    const pack=checked()
    for(const [c,r,id] of [[20,5.5,'em1'],[20,2.5,'em2'],[44,5.5,'em3'],[44,2.5,'em4']] as const)expect(run(pack,evidence(pack,{c:p(c),r:p(r)})).payload.derived.theme.profileId).toBe(id)
    const mid=run(pack,evidence(pack,{c:p(32),r:p(4)})).payload.derived
    expect(mid.theme).toMatchObject({state:'BOUNDARY',profileId:null});expect(mid.scalars.slice(0,2).map((x:any)=>x.value)).toEqual([.5,.5])
  })
  it('preserves genuine zero, abstains on zero denominator and rejects illegal proportions/ranges',()=>{
    const pack=checked(),zero=run(pack,evidence(pack,{c:p(8),r:p(1),correct:p(0)})).payload.derived
    expect(zero.scalars.filter((s:any)=>s.op==='RANGE_POSITION'||s.op==='RATIO').map((s:any)=>s.value)).toEqual([0,0,0])
    const none=run(pack,evidence(pack,{done:p(0),correct:p(0)})).payload.derived
    expect(none.scalars.find((s:any)=>s.key==='n')).toMatchObject({value:0,state:'present'});expect(none.scalars.find((s:any)=>s.key==='accuracy')).toMatchObject({value:null,state:'missing'})
    expect(run(pack,evidence(pack,{correct:p(5)})).payload.derived.scalars.find((s:any)=>s.key==='accuracy').state).toBe('invalid')
    const invalid=run(pack,evidence(pack,{c:p(57)})).payload;expect(invalid.derived.theme.state).toBe('INVALID');expect(invalid.conclusions.some((c:any)=>c.ruleId.startsWith('em'))).toBe(false)
  })
  it('retains missing/invalid/not-applicable axes and independent outputs separately',()=>{
    const pack=checked()
    for(const state of ['missing','invalid','not_applicable'] as const){
      const out=run(pack,evidence(pack,{c:{state}})).payload
      expect(out.derived.scalars[0]).toMatchObject({state,value:null});expect(out.derived.scalars[1].state).toBe('present');expect(out.derived.theme.profileId).toBeNull()
      expect(out.conclusions.map((c:any)=>c.ruleId)).toContain('independent_r')
      expect(project(pack,evidence(pack,{c:{state}})).rows.find(r=>r.rowKey==='r_row')?.value).toBe(39/7)
    }
  })
  it('computes all exact tied maxima in stable original order, excluding supporting NFC',()=>{
    const pack=checked(),unique=run().payload.derived.maxSets[0]
    expect(unique.maxKeys).toEqual(['i7']);expect(unique.maximum).toBe(5)
    const tied=run(pack,evidence(pack,{i2:p(5),i3:p(5),i7:p(5-1e-12)})).payload.derived.maxSets[0]
    expect(tied.maxKeys).toEqual(['i2','i3']);expect(tied.orderedKeys.slice(0,3)).toEqual(['i2','i3','i7'])
    const all=Object.fromEntries(Array.from({length:8},(_,i)=>['i'+(i+1),p(3)]))
    expect(run(pack,evidence(pack,all)).payload.derived.maxSets[0].maxKeys).toEqual(Array.from({length:8},(_,i)=>'i'+(i+1)))
    const partial=run(pack,evidence(pack,{i1:{state:'missing'}})).payload
    expect(partial.derived.maxSets[0]).toMatchObject({state:'missing',maximum:null,maxKeys:null,orderedKeys:null});expect(partial.conclusions.map((c:any)=>c.ruleId)).toContain('independent_nfc')
  })
  it('uses selected score completeness only with original missing-only source quality flags',()=>{
    const pack=checked(),ss=sources(pack);ss[0].qualityState='invalid';ss[0].profileIdentity.qualityFlags=['missing_items','score_not_calculable'] as never[]
    const mapped=()=>mapDeclarativeEvidence({declarativePackage:pack,scaleSources:ss,contextFacts:null} as any)
    expect(mapped().find(e=>e.evidenceKey==='c')?.quality).toBe('interpretable')
    ss[0].profileIdentity.qualityFlags=['attention_failed'] as never[];expect(mapped().find(e=>e.evidenceKey==='c')?.quality).toBe('invalid')
    delete (ss[0] as any).profileIdentity;expect(mapped().find(e=>e.evidenceKey==='c')?.quality).toBe('invalid')
    ss[0].scores[0].status='not_calculable';ss[0].scores[0].value=null as any
    expect(run(pack,mapped()).payload.derived.scalars[0].value).toBeNull()
  })
  it('permits only explicitly Bundle-owned SELF narrative, without changing leaf label/material flags',()=>{
    const pack=checked(),view=project(pack)
    expect(view.conclusions.map(c=>c.ruleId)).toContain('em3');expect(view.theme?.profileId).toBe('em3');expect(caps.scoreDerivedLabels).toBe(false);expect(caps.educationalContent).toBe(false)
    const plain=rawPackage();delete plain.report.narrativeContent
    expect(project(parseDeclarativePackage(plain) as DerivedPackage).conclusions).toEqual([])
    expect(project(pack,evidence(pack),{audience:'admin'}).conclusions).toEqual([])
    const policies=new Map(pack.manifest.definition.slots.map(s=>[s.slotKey,{...caps}]));policies.get('beliefs')!.individualInterpretations=false
    const restricted=project(pack,evidence(pack),{policies});expect(restricted.theme?.state).toBe('WITHHELD');expect(restricted.conclusions.map(c=>c.ruleId)).toContain('independent_r');expect(restricted.conclusions.map(c=>c.ruleId)).not.toContain('em3');expect(restricted.rows.find(r=>r.rowKey==='c_row')?.value).toBe(44)
  })
  it('intersects every numerical dependency, hides maximum order when one input is withheld',()=>{
    const pack=checked(),available=new Set(pack.evidence.map(e=>e.evidenceKey));available.delete('done');available.delete('i3')
    const out=project(pack,evidence(pack),{availableEvidenceKeys:available})
    expect(out.rows.find(r=>r.rowKey==='accuracy_row')).toMatchObject({state:'redacted',value:null,denominator:null});expect(out.rows.find(r=>r.rowKey==='r_row')?.value).toBe(39/7)
    expect(out.maxSets[0]).toMatchObject({state:'redacted',maximum:null,maxKeys:null,orderedKeys:null})
    const policies=new Map(pack.manifest.definition.slots.map(s=>[s.slotKey,{...caps}]));policies.get('strategies')!.numericScores=false
    expect(project(pack,evidence(pack),{policies}).rows.find(r=>r.rowKey==='r_axis')).toMatchObject({state:'redacted',value:null})
  })
  it('preserves limited independent rows and respects block audience before exposing a theme',()=>{
    const pack=checked(),e=evidence(pack);e.find(e=>e.evidenceKey==='r')!.quality='limited'
    const out=project(pack,e);expect(out.rows.find(r=>r.rowKey==='r_row')).toMatchObject({state:'present',value:39/7,quality:'limited'});expect(out.rows.find(r=>r.rowKey==='r_axis')).toMatchObject({state:'missing',value:null,quality:'limited'});expect(out.conclusions.map(c=>c.ruleId)).not.toContain('em3')
    const bad=evidence(pack,{r:p(8)});bad.find(e=>e.evidenceKey==='r')!.quality='limited'
    expect(project(pack,bad).rows.find(r=>r.rowKey==='r_row')).toMatchObject({state:'invalid',value:null,quality:'invalid'})
    const raw=rawPackage();raw.report.blocks[0].audience=['teacher'];const hidden=project(parseDeclarativePackage(raw) as DerivedPackage)
    expect(hidden.rows).toEqual([]);expect(hidden.conclusions).toEqual([]);expect(hidden.theme).toBeNull()
  })
  it('refuses scripts, unknown inputs, chains, context arithmetic and cross-source maximum sets',()=>{
    for(const mutate of [(p:any)=>p.rules.derivations.push({key:'evil',op:'eval',code:'process.exit()'}),(p:any)=>p.rules.derivations[0].input='unknown',(p:any)=>p.rules.derivations[0].input='n',(p:any)=>p.rules.derivations[4].inputs[0]='nfc',(p:any)=>p.report.blocks[0].rowKeys.push('unknown')]){const p=rawPackage();mutate(p);expect(()=>parseDeclarativePackage(p)).toThrow()}
    const p=rawPackage();p.evidence[0].role='CONTEXT';expect(()=>parseDeclarativePackage(p)).toThrow()
    expect(()=>runDeclarativeEvidence({declarativePackage:checked()} as any)).toThrow('VERSION_MISMATCH')
  })
  it('validates fixtures for the new version and keeps the old V1 output unchanged',()=>{
    const old=authoringFixture(),before=verifyPackageFixtures(old),after=verifyPackageFixtures(JSON.parse(JSON.stringify(old)))
    expect(after).toEqual(before)
    const p=rawPackage();for(const f of Object.values(p.fixtures) as any[]){f.values=values();f.expectedRuleIds=['em3','independent_r','independent_nfc'];f.expectedKind='COMPUTED';f.expectedDerived={scalars:{c_pos:.75,accuracy:.75},maxSets:{interest_max:['i7']},theme:{state:'MATCHED',profileId:'em3'}}}
    expect(verifyPackageFixtures(p)).toHaveLength(4);p.fixtures.valid.expectedDerived.scalars.c_pos=.5;expect(()=>verifyPackageFixtures(p)).toThrow('DERIVED_FIXTURE_MISMATCH')
  })
  it('keeps historical V2 declarations and their frozen golden outputs compatible',()=>{
    for(const raw of historicalPackages.filter(p=>p.schemaVersion===2)){
      expect(parseDeclarativePackage(raw)).toEqual(raw)
      expect(verifyPackageFixtures(raw)).toHaveLength(4)
    }
  })
  it('freezes FINAL facts, reopens encrypted saved results without dispatch or current catalog evaluation',()=>{
    const pack=checked(),frozen=freezeBundleProductionDefinition(packageEntry(pack),{frozenAt:'2026-11-01T00:00:00.000Z',sourceReference:'synthetic-core-test'}),read=readFrozenBundleProductionDefinition(JSON.parse(JSON.stringify(frozen)))
    const runtime=compileBundleRuntimeFromFrozenRead({family:'ASSESSMENT_BUNDLE',snapshotVersion:3,snapshot:read.bundleSnapshot}),registry=createProductBundleAnalysisEngineRegistry()
    const facts=projectBundleReportFacts({registry,engineInput:{snapshot:read.bundleSnapshot,compiledRuntime:runtime,evidence:[],contextFacts:null,aggregateInputHash:null,scaleSources:sources(pack) as any,declarativePackage:read.declarativePackage}})
    const originalKey=process.env.DATA_ENCRYPTION_KEY;process.env.DATA_ENCRYPTION_KEY='12'.repeat(32)
    try{
      const saved=encryptCognitivePayload(facts),dispatch=vi.spyOn(registry,'dispatch').mockImplementation(()=>{throw new Error('must not recalculate on reopen')})
      const reopened=validateBundleReportFacts(decryptCognitivePayload(saved)),payload=reopened.enginePayload.kind==='COMPUTED'?reopened.enginePayload.payload:null
      const out=project(pack,reopened.evidence,{payload})
      expect(out.theme?.profileId).toBe('em3');expect(out.rows.find(r=>r.rowKey==='accuracy_row')?.denominator).toBe(4);expect(dispatch).not.toHaveBeenCalled();dispatch.mockRestore()
      const wrong=JSON.parse(JSON.stringify(payload));wrong.identity.templateVersion='9.9.9';expect(()=>project(pack,reopened.evidence,{payload:wrong})).toThrow('SAVED_PACKAGE_IDENTITY')
    }finally{if(originalKey===undefined)delete process.env.DATA_ENCRYPTION_KEY;else process.env.DATA_ENCRYPTION_KEY=originalKey}
  })
})
