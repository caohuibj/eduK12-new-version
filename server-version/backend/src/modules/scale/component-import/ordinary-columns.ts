export const legacyColumns={
 基本信息:['toolKey','configurationName','baseCombinationId','baseCombinationHash','contentVersion','parametersVersion','reportVersion','parametersMode','reportMode','definitionJson','metadataJson'],
 题目:['toolKey','itemJson'],选项:['toolKey','responseSetJson'],计分:['toolKey','scoringJson'],参数:['toolKey','parametersJson'],报告:['toolKey','reportJson'],结构片段:['toolKey','jsonKey','part','text'],
}
const definitionColumns=['来源标题','来源引用','来源网址','发表年份','授权状态','再分发','授权说明','作答者类型','题目随机']
const metadataColumns=['名称','指导语','语言','指导语版本','指导语来源','适用作答者','最小月龄','最大月龄不含','适用年级','披露受众','披露能力']
const scoringColumns=['计分版本','缺失策略','最少作答数']
export const ordinaryColumns={
 基本信息:[...definitionColumns,...metadataColumns,...scoringColumns],
 题目:['题号','题干','顺序','选项组','题型','必答','选项随机','用途','注意检测目标'],
 选项:['选项组','选项值','选项文字','分值'],
 计分:['指标','类型','名称','方向','主要指标','小数位','来源','题号或指标','权重','聚合','反向'],
 参数:['参考版本','指标','内容版本','计分版本','参考类型','分档标识','分档名称','下限含','上限含','参考人群','引用','证据级别','来源类型'],
 报告:['指标','标题','解释','解释来源','参考版本','参考类型','分档标识','分档名称','分档解释','建议','建议类别','局限','免责声明','主要指标'],结构片段:[],
}
export type ComponentSheet=keyof typeof legacyColumns
export const componentColumns=Object.fromEntries(Object.keys(legacyColumns).map(k=>[k,[...legacyColumns[k as ComponentSheet],...ordinaryColumns[k as ComponentSheet]]])) as Record<ComponentSheet,string[]>
export type TableRow={number:number;data:Record<string,unknown>}
export const emptyCell=(v:unknown)=>v===undefined||v===null||v===''
export class ColumnInputError extends Error{
 constructor(public sheet:string,public row:number,public path:string,message:string){super(message)}
}
const aliases:Record<string,string>={
 自编:'self_authored',已核实:'verified',已授权:'authorized',未知:'unknown',允许:'allowed',受限:'restricted',本人自评:'participant_self_report',
 本人:'SELF',家长:'PARENT',教师:'TEACHER',观察者:'OBSERVER',临床人员:'CLINICIAN',
 总分:'total',维度:'dimension',越高越好:'higher_is_better',越高越差:'higher_is_worse',越高越多:'higher_is_more',越低越好:'lower_is_better',双极:'bipolar',描述:'descriptive',
 求和:'sum',平均:'mean',加权求和:'weighted_sum',加权平均:'weighted_mean',题目:'items',指标:'scores',
 全部必答:'complete_required',允许缺失不折算:'allow_missing_without_proration',最低作答折算:'prorate_if_min_answered',来源定义:'source_defined',
 准则阈值:'criterion_threshold',分数:'score_only',选定参数:'reference_context',精确参考:'reference',
 理论:'theoretical',文献试用:'literature_beta',本地试测:'local_pilot',本地常模:'local_norm',已验证常模:'validated_norm',
 理论分数范围:'theoretical_score_range',文献报告:'literature_reported',文献估计:'literature_derived_estimate',本地观察:'local_observed',
 反思:'reflection',策略:'strategy',环境:'environment',支持:'support',作答者:'respondent',被评者:'subject',研究者:'researcher',
 数值分数:'numericScores',参考结果:'references',个体解释:'individualInterpretations',分档标签:'scoreDerivedLabels',质量详情:'resultQualityDetails',
 原始答案:'rawAnswers',逐题分数:'itemScores',方法:'methods',教育内容:'educationalContent',
}
const mapped=(v:string)=>aliases[v]??v
const lines=(v:string)=>v.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
const tokens=(v:string)=>v.split(/[|,，、\n]/).map(s=>s.trim()).filter(Boolean).map(mapped)

/** Spreadsheet columns normalize into the existing C/P/R contract, never a
 * second scoring/report model. Each tool and table chooses ordinary or JSON. */
export class ComponentColumnReader{
 private locations=new Map<string,{sheet:string;row:number}>()
 constructor(private basic:TableRow,private own:(sheet:string)=>TableRow[],private decode:(value:unknown)=>unknown){}
 private fail(sheet:string,row:TableRow,path:string,message:string):never{throw new ColumnInputError(sheet,row.number,path,message)}
 private text(sheet:string,row:TableRow,key:string,fallback?:string){
  const v=row.data[key]
  if(emptyCell(v)){if(fallback!==undefined)return fallback;return this.fail(sheet,row,key,'请填写'+key)}
  if(typeof v!=='string'&&typeof v!=='number')return this.fail(sheet,row,key,'请填写纯文本或数字')
  const value=String(v).trim();if(!value&&fallback===undefined)return this.fail(sheet,row,key,'请填写'+key)
  return value||fallback!
 }
 private number(sheet:string,row:TableRow,key:string,fallback?:number){
  if(emptyCell(row.data[key])){if(fallback!==undefined)return fallback;return this.fail(sheet,row,key,'请填写数值')}
  const v=row.data[key],n=typeof v==='number'?v:typeof v==='string'&&v.trim()!==''?Number(v):NaN
  if(!Number.isFinite(n))return this.fail(sheet,row,key,'请填写有限数值')
  return n
 }
 private bool(sheet:string,row:TableRow,key:string,fallback:boolean){
  const v=row.data[key];if(emptyCell(v))return fallback
  if([true,1,'1','true','是'].includes(v as never))return true
  if([false,0,'0','false','否'].includes(v as never))return false
  return this.fail(sheet,row,key,'仅填写是/否或true/false')
 }
 private choice(sheet:string,row:TableRow,key:string,allowed:readonly string[],fallback?:string){
  const value=mapped(this.text(sheet,row,key,fallback));if(!allowed.includes(value))return this.fail(sheet,row,key,'不支持此值；可选：'+allowed.join(' / '))
  return value
 }
 private json(sheet:string,row:TableRow,key:string){try{return this.decode(row.data[key])}catch(e){return this.fail(sheet,row,key,e instanceof SyntaxError?'JSON 格式错误':e instanceof Error?e.message:'JSON 格式错误')}}
 private conflict(sheet:string,row:TableRow,jsonKey:string,fields:readonly string[]){
  if(!emptyCell(row.data[jsonKey]))for(const key of fields)if(!emptyCell(row.data[key]))this.fail(sheet,row,key,'普通列与 '+jsonKey+' 不能同时供值；请选择一种填写方式')
 }
 private table(sheet:Exclude<ComponentSheet,'基本信息'|'结构片段'>,jsonKey:string){
  const rows=this.own(sheet),jsonRows=rows.filter(r=>!emptyCell(r.data[jsonKey]))
  for(const row of rows)this.conflict(sheet,row,jsonKey,ordinaryColumns[sheet])
  if(jsonRows.length&&jsonRows.length!==rows.length){const row=rows.find(r=>emptyCell(r.data[jsonKey]))!;this.fail(sheet,row,jsonKey,'同一量表的同一工作表不能混用普通行与高级JSON行')}
  return {rows,advanced:jsonRows.length>0}
 }
 private remember(path:string,sheet:string,row:TableRow){this.locations.set(path,{sheet,row:row.number})}
 locate(path:string){for(let p=path;p;p=p.includes('.')?p.slice(0,p.lastIndexOf('.')):''){const found=this.locations.get(p);if(found)return found}return null}
 private consistent(sheet:string,rows:TableRow[],key:string){
  const filled=rows.filter(r=>!emptyCell(r.data[key]));if(!filled.length)return
  if(emptyCell(rows[0].data[key]))this.fail(sheet,filled[0],key,'请在该组首行填写共享字段；后续行留空或重复相同值')
  const first=String(filled[0].data[key]);for(const row of filled.slice(1))if(String(row.data[key])!==first)this.fail(sheet,row,key,'同一组的 '+key+' 不一致；后续行留空或重复相同值')
 }
 private group(sheet:string,rows:TableRow[],key:string){
  const groups=new Map<string,TableRow[]>();for(const row of rows){const id=this.text(sheet,row,key);groups.set(id,[...(groups.get(id)??[]),row])}return groups
 }
 definition(){
  const b=this.basic;this.conflict('基本信息',b,'definitionJson',definitionColumns)
  if(!emptyCell(b.data.definitionJson))return this.json('基本信息',b,'definitionJson')
  const source:Record<string,unknown>={title:this.text('基本信息',b,'来源标题'),citation:this.text('基本信息',b,'来源引用')}
  if(!emptyCell(b.data['来源网址']))source.url=this.text('基本信息',b,'来源网址')
  if(!emptyCell(b.data['发表年份']))source.publicationYear=this.number('基本信息',b,'发表年份')
  return {schemaVersion:2,respondentType:mapped(this.text('基本信息',b,'作答者类型','participant_self_report')),source,
   license:{status:this.choice('基本信息',b,'授权状态',['verified','authorized','self_authored','unknown'],'unknown'),redistribution:this.choice('基本信息',b,'再分发',['allowed','restricted','unknown'],'unknown'),...(!emptyCell(b.data['授权说明'])?{note:this.text('基本信息',b,'授权说明')}:{})},
   display:{randomizeItems:this.bool('基本信息',b,'题目随机',false)}}
 }
 metadata(){
  const b=this.basic;this.conflict('基本信息',b,'metadataJson',metadataColumns)
  if(!emptyCell(b.data.metadataJson))return this.json('基本信息',b,'metadataJson')
  const policyVersion=this.text('基本信息',b,'contentVersion'),respondentTypes=tokens(this.text('基本信息',b,'适用作答者'))
  const ageMonths:Record<string,number>={}
  if(!emptyCell(b.data['最小月龄']))ageMonths.minInclusive=this.number('基本信息',b,'最小月龄')
  if(!emptyCell(b.data['最大月龄不含']))ageMonths.maxExclusive=this.number('基本信息',b,'最大月龄不含')
  const grades=tokens(this.text('基本信息',b,'适用年级',''))
  const capabilities=['numericScores','references','individualInterpretations','scoreDerivedLabels','resultQualityDetails','rawAnswers','itemScores','methods','educationalContent']
  const selected=tokens(this.text('基本信息',b,'披露能力','')),audiences=tokens(this.text('基本信息',b,'披露受众','')).map(a=>a==='TEACHER'?'teacher':a)
  for(const v of selected)if(!capabilities.includes(v))this.fail('基本信息',b,'披露能力','未知披露能力：'+v)
  for(const v of audiences)if(!['respondent','subject','teacher','researcher'].includes(v))this.fail('基本信息',b,'披露受众','未知披露受众：'+v)
  if(selected.length&&!audiences.length||audiences.length&&!selected.length)this.fail('基本信息',b,'披露受众','披露受众与披露能力须同时填写；均空表示不披露')
  const meta:Record<string,unknown>={title:this.text('基本信息',b,'名称'),applicability:{schemaVersion:1,policyVersion,respondentTypes,requiredContextKeys:[],
   ...(Object.keys(ageMonths).length||grades.length?{subject:{...(Object.keys(ageMonths).length?{ageMonths}:{}),...(grades.length?{grades}:{})}}:{})},
   disclosure:{schemaVersion:1,policyVersion,audiences:Object.fromEntries(audiences.map(a=>[a,Object.fromEntries(capabilities.map(c=>[c,selected.includes(c)]))])),unknownAudience:'DENY'}}
  if(!emptyCell(b.data['指导语']))meta.instruction={schemaVersion:1,text:this.text('基本信息',b,'指导语'),language:this.text('基本信息',b,'语言','zh-CN'),version:this.text('基本信息',b,'指导语版本',policyVersion),source:this.text('基本信息',b,'指导语来源',this.text('基本信息',b,'来源引用','管理员填写'))}
  else if(['语言','指导语版本','指导语来源'].some(k=>!emptyCell(b.data[k])))this.fail('基本信息',b,'指导语','填写指导语版本/语言/来源时也需填写指导语')
  return meta
 }
 items(){
  const {rows,advanced}=this.table('题目','itemJson')
  return rows.map((r,i)=>{this.remember('changedParts.CONTENT.definition.items.'+i,'题目',r);if(advanced)return this.json('题目',r,'itemJson')
   return {itemCode:this.text('题目',r,'题号'),content:this.text('题目',r,'题干'),sortOrder:this.number('题目',r,'顺序',i),responseSetKey:this.text('题目',r,'选项组'),
    type:this.text('题目',r,'题型','single')==='单选'?'single':this.text('题目',r,'题型','single'),required:this.bool('题目',r,'必答',true),randomizeOptions:this.bool('题目',r,'选项随机',false),
    ...(!emptyCell(r.data['用途'])?{purpose:this.text('题目',r,'用途')}:{}),...(!emptyCell(r.data['注意检测目标'])?{attentionTarget:r.data['注意检测目标']}:{})}
  })
 }
 options(){
  const {rows,advanced}=this.table('选项','responseSetJson')
  if(advanced)return rows.map((r,i)=>{this.remember('changedParts.CONTENT.definition.responseSets.'+i,'选项',r);return this.json('选项',r,'responseSetJson')})
  return [...this.group('选项',rows,'选项组')].map(([key,group],i)=>{
   this.remember('changedParts.CONTENT.definition.responseSets.'+i,'选项',group[0])
   return {key,options:group.map((r,j)=>{this.remember(`changedParts.CONTENT.definition.responseSets.${i}.options.${j}`,'选项',r)
    if(emptyCell(r.data['选项值']))this.fail('选项',r,'选项值','请填写选项值；数字和文本保持原类型')
    return {value:r.data['选项值'],label:this.text('选项',r,'选项文字'),score:this.number('选项',r,'分值')}
   })}
  })
 }
 scoring(items:unknown[]){
  const {rows,advanced}=this.table('计分','scoringJson'),b=this.basic
  if(advanced){if(rows.length!==1)this.fail('计分',rows[1]??b,'scoringJson','每个 C 只提供一行完整计分JSON')
   for(const key of scoringColumns)if(!emptyCell(b.data[key]))this.fail('基本信息',b,key,'普通计分列与 scoringJson 不能同时供值')
   return this.json('计分',rows[0],'scoringJson')}
  const type=this.choice('基本信息',b,'缺失策略',['complete_required','allow_missing_without_proration','prorate_if_min_answered','source_defined'],'complete_required')
  const defaultMissingPolicy=type==='prorate_if_min_answered'?{type,minimumAnswered:this.number('基本信息',b,'最少作答数')}:{type}
  if(type!=='prorate_if_min_answered'&&!emptyCell(b.data['最少作答数']))this.fail('基本信息',b,'最少作答数','仅最低作答折算策略使用此列')
  const transforms=new Map<string,{reverse:boolean;row:TableRow}>()
  const scores=[...this.group('计分',rows,'指标')].map(([key,group],i)=>{
   const r=group[0];this.remember('changedParts.CONTENT.definition.scoring.scores.'+i,'计分',r)
   for(const column of ['类型','名称','方向','主要指标','小数位','来源','聚合'])this.consistent('计分',group,column)
   const sourceType=this.choice('计分',r,'来源',['items','scores'],'items')
   const members=group.map((row,j)=>{
    this.remember(`changedParts.CONTENT.definition.scoring.scores.${i}.source.${sourceType}.${j}`,'计分',row)
    const member=this.text('计分',row,'题号或指标'),weight=this.number('计分',row,'权重',1)
    if(sourceType==='items'&&!emptyCell(row.data['反向'])){const reverse=this.bool('计分',row,'反向',false),old=transforms.get(member);if(old&&old.reverse!==reverse)this.fail('计分',row,'反向','同一道题的反向设置冲突（计分变换属于题目）');transforms.set(member,{reverse,row})}
    else if(sourceType==='scores'&&!emptyCell(row.data['反向']))this.fail('计分',row,'反向','指标聚合不支持反向；请在来源题目配置或使用高级计分JSON')
    return {[sourceType==='items'?'itemCode':'scoreKey']:member,weight}
   })
   return {key,type:this.choice('计分',r,'类型',['total','dimension']),label:this.text('计分',r,'名称'),direction:this.choice('计分',r,'方向',['higher_is_better','higher_is_worse','higher_is_more','lower_is_better','bipolar','descriptive'],'descriptive'),
    canonical:this.bool('计分',r,'主要指标',i===0),displayPrecision:this.number('计分',r,'小数位',1),source:{type:sourceType,[sourceType]:members,aggregation:this.choice('计分',r,'聚合',['sum','mean','weighted_sum','weighted_mean'],'sum')}}
  })
  const itemRules=items.flatMap((item,i)=>{
   const code=(item as {itemCode?:string}|null)?.itemCode;if(!code)return []
   const t=transforms.get(code);this.remember('changedParts.CONTENT.definition.scoring.itemRules.'+i,t?'计分':'题目',t?.row??this.own('题目')[i])
   return [{itemCode:code,transform:{type:t?.reverse?'reverse':'identity'}}]
  })
  return {scoringVersion:this.text('基本信息',b,'计分版本',this.text('基本信息',b,'contentVersion')),defaultMissingPolicy,itemRules,scores}
 }
 parameters(){
  const {rows,advanced}=this.table('参数','parametersJson'),b=this.basic
  if(!rows.length)this.fail('参数',b,'指标','提供 P 时需要参数行；不配置请在基本信息明确选择 NONE')
  if(advanced){if(rows.length!==1)this.fail('参数',rows[1]??b,'parametersJson','每份 P 只提供一行完整参数JSON');return this.json('参数',rows[0],'parametersJson')}
  const references:Array<{schemaVersion:1;instrumentType:'scale';instrumentKey:string;referenceVersion:string;status:'ACTIVE';entries:unknown[]}>=[],selections:unknown[]=[]
  const versions=new Map<string,TableRow[]>();for(const row of rows){const version=this.text('参数',row,'参考版本',this.text('基本信息',b,'parametersVersion'));versions.set(version,[...(versions.get(version)??[]),row])}
  for(const [referenceVersion,versionRows] of versions){
   const entries:unknown[]=[],refIndex=references.length
   for(const [scoreKey,group] of this.group('参数',versionRows,'指标')){
    const r=group[0],entryIndex=entries.length
    for(const key of ['内容版本','计分版本','参考类型','参考人群','引用','证据级别','来源类型'])this.consistent('参数',group,key)
    this.choice('参数',r,'参考类型',['criterion_threshold'],'criterion_threshold')
    this.remember(`changedParts.PARAMETERS.payload.references.${refIndex}.entries.${entryIndex}`,'参数',r)
    const thresholds=group.map((row,j)=>{this.remember(`changedParts.PARAMETERS.payload.references.${refIndex}.entries.${entryIndex}.statistics.thresholds.${j}`,'参数',row)
     return {key:this.text('参数',row,'分档标识'),label:this.text('参数',row,'分档名称'),...(!emptyCell(row.data['下限含'])?{minInclusive:this.number('参数',row,'下限含')}:{}),...(!emptyCell(row.data['上限含'])?{maxInclusive:this.number('参数',row,'上限含')}:{})}
    })
    entries.push({scoreKey,referenceKind:'criterion_threshold',instrumentVersion:this.text('参数',r,'内容版本',this.text('基本信息',b,'contentVersion','')),scoringVersion:this.text('参数',r,'计分版本',this.text('基本信息',b,'计分版本',this.text('基本信息',b,'contentVersion',''))),
     population:{description:this.text('参数',r,'参考人群')},source:{citation:this.text('参数',r,'引用')},evidenceLevel:this.choice('参数',r,'证据级别',['theoretical','literature_beta','local_pilot','local_norm','validated_norm']),
     provenanceType:this.choice('参数',r,'来源类型',['theoretical_score_range','literature_reported','literature_derived_estimate','local_observed']),statistics:{thresholds}})
    selections.push({scoreKey,referenceVersion,referenceKind:'criterion_threshold'})
   }
   references.push({schemaVersion:1,instrumentType:'scale',instrumentKey:String(b.data.toolKey),referenceVersion,status:'ACTIVE',entries})
  }
  return {referencePolicy:{type:'declared',selections},references}
 }
 report(){
  const {rows,advanced}=this.table('报告','reportJson'),b=this.basic
  if(advanced){if(rows.length!==1)this.fail('报告',rows[1]??b,'reportJson','每份 R 只提供一行完整报告JSON');return this.json('报告',rows[0],'reportJson')}
  this.consistent('报告',rows,'免责声明')
  const scoreOrder:string[]=[],primaryScoreKeys:string[]=[],interpretations:unknown[]=[]
  for(const [scoreKey,group] of this.group('报告',rows,'指标')){
   const r=group[0],index=interpretations.length;this.remember('changedParts.REPORT.payload.interpretations.'+index,'报告',r)
   for(const key of ['标题','解释','解释来源','参考版本','参考类型','主要指标'])this.consistent('报告',group,key)
   const sourceType=this.choice('报告',r,'解释来源',['score_only','reference_context','reference'],group.some(r=>!emptyCell(r.data['分档标识']))?'reference_context':'score_only')
   const source=sourceType==='reference'?{type:sourceType,referenceVersion:this.text('报告',r,'参考版本'),referenceKind:this.choice('报告',r,'参考类型',['criterion_threshold','normative_distribution','descriptive_sample','theoretical_range'])}:{type:sourceType}
   if(sourceType!=='reference'&&group.some(r=>!emptyCell(r.data['参考版本'])||!emptyCell(r.data['参考类型'])))this.fail('报告',r,'解释来源','指定参考版本/类型时请使用精确参考解释来源')
   const bands:unknown[]=[],guidance:unknown[]=[]
   for(const row of group){
    const advice=lines(this.text('报告',row,'建议','')).map(text=>({category:this.choice('报告',row,'建议类别',['reflection','strategy','environment','support'],'reflection'),text}))
    if(!emptyCell(row.data['分档标识'])){this.remember(`changedParts.REPORT.payload.interpretations.${index}.bands.${bands.length}`,'报告',row);bands.push({key:this.text('报告',row,'分档标识'),label:this.text('报告',row,'分档名称'),summary:this.text('报告',row,'分档解释'),guidance:advice})}
    else {if(['分档名称','分档解释'].some(k=>!emptyCell(row.data[k])))this.fail('报告',row,'分档标识','分档文字须同时填写分档标识');guidance.push(...advice)}
   }
   scoreOrder.push(scoreKey);if(this.bool('报告',r,'主要指标',index===0))primaryScoreKeys.push(scoreKey)
   interpretations.push({scoreKey,headline:this.text('报告',r,'标题'),summary:this.text('报告',r,'解释'),source,bands,guidance})
  }
  const disclaimerRow=rows.find(r=>!emptyCell(r.data['免责声明']))??b
  return {reportVersion:this.text('基本信息',b,'reportVersion'),scoreOrder,primaryScoreKeys,interpretations,
   limitations:[...new Set(rows.flatMap(r=>lines(this.text('报告',r,'局限',''))))],disclaimer:this.text('报告',disclaimerRow,'免责声明')}
 }
}
