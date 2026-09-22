import type { DeclarativePackage } from './contract'
/** Example is experimental content, never a scientific release approval. */
export function scaffoldPackage(bundleKey:string): DeclarativePackage {
  return {
    schemaVersion:1,
    manifest:{definition:{schemaVersion:1,bundleKey,bundleVersion:'1.0.0',status:'DRAFT',category:'integrated',name:'描述性测评包示例',description:'仅展示规则接入，不代表经过联合科学验证。',respondentTypes:['SELF'],initiationModes:['TEACHER_ASSIGNMENT','STUDENT_COURSE'],population:{subjectPopulation:'unspecified'},
      slots:[{slotKey:'situational',unitType:'SITUATIONAL',position:0,required:true,instrumentKey:'sjt-assertiveness-golden',instrumentVersion:'1.0.0',respondentType:'SELF',valueSelectors:['bfi2.assertiveness.behavior']}],
      engine:{key:'declarative-evidence-v1',version:'1.0.0'},contextDefinitionKey:null,contextDefinitionVersion:null,reportDefinitionKey:bundleKey+'_report',reportDefinitionVersion:'1.0.0',publicationRequirements:{scientificGate:true,rightsGate:true,languageGate:true,reportGate:true,safetyGate:false,nonCommercialOnly:false},rightsRequirements:{required:false,instrumentKeys:[]},safetyCapability:{safetyCapable:false,productionTriggerEnabled:false},limitations:['仅为本次任务的描述性摘要，不构成诊断或常模判断。']},
      files:{evidence:'evidence-map.json',rules:'rules.json',report:'report.json',scientific:'scientific.json',publication:'publication.json'},cognitiveDependencies:[]},
    evidence:[{evidenceKey:'sjt.observation',slotKey:'situational',selector:'bfi2.assertiveness.behavior',valueType:'number',unit:'points',construct:'assertiveness',role:'PRIMARY',direction:'neutral',qualityPolicy:'interpretable_only'}],
    rules:{version:'1.0.0',items:[{ruleId:'observed',when:{op:'present',evidenceKey:'sjt.observation'},kind:'independent_summary',text:'本次情境任务提供了可读取的描述性结果。',evidenceKeys:['sjt.observation'],supportRefs:[]}]},
    report:{key:bundleKey+'_report',version:'1.0.0',locale:'zh-CN',blocks:[{blockId:'summary',kind:'conclusions',title:'描述性结果',audience:['student','teacher','admin'],ruleIds:['observed']}],states:{missing:'缺少结果',limited:'结果质量有限',unavailable:'不能生成有依据的结论'}},
    fixtures:Object.fromEntries(['valid','missing','invalid','not-applicable'].map(name=>[name,{values:{'sjt.observation':name==='valid'?{state:'present',value:1}:{state:name==='not-applicable'?'not_applicable':name}},expectedRuleIds:name==='valid'?['observed']:[],expectedKind:'COMPUTED'}])) as any,
    scientific:{maturity:'EXPERIMENTAL',scope:'接入示例，无联合科学效度声明。',references:[]},publication:{requestedStatus:'DRAFT'},
  }
}
