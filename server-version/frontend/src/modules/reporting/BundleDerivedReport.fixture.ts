import type {DerivedBundleView} from './BundleDerivedReport'
/** Synthetic saved DTO; maxima are recorded explicitly, not calculated here. */
export function derivedViewFixture():DerivedBundleView{
 const domains=[['leadership','带领与影响',12,3],['organization','组织与安排',13,4],['altruism','助人与照顾',13,3],['creativity','艺术与创作',14,4],['analysis','分析与探究',10,2],['production','动手与自然',10,3],['adventure','运动与冒险',10,3],['erudition','语言与阅读',10,3]] as const
 return {schemaVersion:'bundle-derived-view-v1',rows:[...domains.map(([key,label,count,value],order)=>({rowKey:key,label,value,order,state:'present' as const,quality:'interpretable' as const,unit:'mean' as const,range:{min:1,max:5},itemCount:count,denominator:null,timeframe:null,evidenceKeys:['orvis.'+key]})),
  {rowKey:'nfc',label:'认知需求',value:38,order:8,state:'present',quality:'interpretable',unit:'sum',range:{min:10,max:50},itemCount:10,denominator:null,timeframe:'通常的自我感受',evidenceKeys:['nfc.need_for_cognition']}],
  maxSets:[{key:'interest_max',state:'present',maximum:4,maxKeys:['orvis.organization','orvis.creativity'],orderedKeys:['orvis.organization','orvis.creativity','orvis.leadership','orvis.altruism','orvis.production','orvis.adventure','orvis.erudition','orvis.analysis']}],theme:null,
  conclusions:[{ruleId:'explore',ruleVersion:'1.0.0',kind:'independent_summary',text:'自行选择两项活动做一次小尝试。',evidenceKeys:['orvis.organization','orvis.creativity'],supportRefs:[]}],
  blocks:[{blockId:'interests',kind:'evidence',title:'兴趣八域',rowKeys:domains.map(d=>d[0]),maxSetKeys:['interest_max'],ruleIds:[]},
   {blockId:'nfc',kind:'evidence',title:'独立的思考倾向',rowKeys:['nfc'],maxSetKeys:[],ruleIds:[]},
   {blockId:'actions',kind:'conclusions',title:'探索建议',rowKeys:[],maxSetKeys:[],ruleIds:['explore']}]}
}
