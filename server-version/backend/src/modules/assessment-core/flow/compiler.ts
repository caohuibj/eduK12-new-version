import type { FlowBlock,FlowCompileIssue,FlowCondition } from './definition'

export type FlowFormDefinition={pages:Array<{questions:Array<{
  itemKey:string;type:string;options:Array<{optionKey:string}>
}>}>}
export type FlowCompileUnit={instrumentKey:string;kind:string;displayDefinition?:unknown}
export type FlowStaticData={key:string;type:'STRING'|'NUMBER'|'BOOLEAN';value:string|number|boolean}
export const flowError=(issues:FlowCompileIssue[],path:string,message:string)=>issues.push({path,message})
const error=flowError
export const strictFlowKeys=(values:string[],path:string,issues:FlowCompileIssue[])=>{
  const seen=new Set<string>()
  for(let i=0;i<values.length;i++){
    if(seen.has(values[i]))error(issues,path+'.'+i,'流程标识必须唯一')
    seen.add(values[i])
  }
}
export const checkFlowText=(raw:string|undefined,staticVars:Map<string,FlowStaticData>,path:string,issues:FlowCompileIssue[])=>{
  if(!raw)return
  for(const match of raw.matchAll(/\{\{([a-z][a-z0-9_-]*)\}\}/g)){
    if(!staticVars.has(match[1]))error(issues,path,'受控文案引用了未声明的静态变量 '+match[1])
  }
  if(/\{\{|\}\}/.test(raw.replace(/\{\{[a-z][a-z0-9_-]*\}\}/g,'')))
    error(issues,path,'文案变量必须使用 {{变量编码}}，不允许执行表达式')
}
/** Shared Survey/Training compiler: forward-only references, typed comparisons,
 * finite AST budget, complete candidate union and explicit conditional END. */
export function validateFlowBlocks(input:{blocks:FlowBlock[];units:readonly FlowCompileUnit[];
  staticVars?:Map<string,FlowStaticData>;choiceAnswersOnly?:boolean},issues:FlowCompileIssue[]):void{
  const unitMap=new Map(input.units.map(unit=>[unit.instrumentKey,unit]))
  const allUnitKeys=input.units.map(unit=>unit.instrumentKey)
  const staticVars=input.staticVars??new Map<string,FlowStaticData>()
  const visited=new Set<string>()
  let terminalFound=false
  let guaranteedStarted=false
  let totalPredicates=0
  const checkText=(raw:string|undefined,path:string)=>checkFlowText(raw,staticVars,path,issues)
  const checkCondition=(condition:FlowCondition,at:number,depth:number,path:string)=>{
    totalPredicates++
    if(totalPredicates>64||depth>6){error(issues,path,'条件表达式节点或深度超过上限');return}
    if('terms' in condition){
      condition.terms.forEach((term,i)=>checkCondition(term,at,depth+1,path+'.terms.'+i))
      return
    }
    if('term' in condition){checkCondition(condition.term,at,depth+1,path+'.term');return}
    const compare=condition.op
    const v=condition.value
    if(compare==='IS_MISSING'&&v!==undefined)
      error(issues,path,'空值判断不得包含比较值')
    if(compare!=='IS_MISSING'&&v===undefined)
      error(issues,path,'比较条件必须包含明确的比较值')
    let valueType:'choice'|'choices'|'number'|'text'|'boolean'|null=null
    let validOptions:string[]=[]
    if(condition.field.source==='EMBEDDED'){
      if(input.choiceAnswersOnly){error(issues,path,'课程流程不支持嵌入变量');return}
      const e=staticVars.get(condition.field.key)
      if(!e){error(issues,path,'条件引用了未知嵌入变量');return}
      valueType=e.type==='NUMBER'?'number':e.type==='BOOLEAN'?'boolean':'text'
    }else{
      if(!visited.has(condition.field.instrumentKey)){
        error(issues,path,'条件只能引用流程中此前已定义的 Form 工具，不能引用自身或未来答案')
        return
      }
      const unit=unitMap.get(condition.field.instrumentKey)
      if(!unit||unit.kind!=='FORM'){
        error(issues,path,'研究条件仅可引用已验证的 Form 答案');return
      }
      const form=unit.displayDefinition as FlowFormDefinition
      if(!form||!Array.isArray(form.pages)){error(issues,path,'被引用的表单定义无效');return}
      const itemKey=condition.field.itemKey
      const item=form.pages.flatMap(p=>p.questions)
        .find(q=>q.itemKey===itemKey)
      if(!item){error(issues,path,'被引用的表单题目不存在');return}
      if(input.choiceAnswersOnly&&!['SINGLE','MULTIPLE','LIKERT'].includes(item.type)){
        error(issues,path,'课程流程仅支持此前 Form SINGLE/MULTIPLE/LIKERT 题目');return
      }
      if(['NUMBER','SLIDER'].includes(item.type))valueType='number'
      else if(item.type==='MULTIPLE')valueType='choices'
      else if(['SINGLE','LIKERT'].includes(item.type))valueType='choice'
      else if(['SHORT_TEXT','LONG_TEXT','DATE','TIME'].includes(item.type))valueType='text'
      else{error(issues,path,'不支持用矩阵、排序或恒定总和直接决定流程分支');return}
      validOptions=item.options.map(o=>o.optionKey)
    }
    if(compare==='IS_MISSING')return
    if(compare==='GT'||compare==='GTE'||compare==='LT'||compare==='LTE'){
      if(valueType!=='number'||typeof v!=='number')
        error(issues,path,'数值比较只允许 NUMBER/SLIDER 或数字型嵌入变量')
    }else if(compare==='INCLUDES'){
      if(valueType!=='choices'||typeof v!=='string'||!validOptions.includes(v))
        error(issues,path,'INCLUDES 必须引用多选题及其合法选项编码')
    }else if(compare==='EQUALS'){
      if(valueType==='choices'||typeof v!==(valueType==='number'?'number':
        valueType==='boolean'?'boolean':'string'))
        error(issues,path,'比较值类型与 Form/变量字段不一致')
      if(valueType==='choice'&&!validOptions.includes(String(v)))
        error(issues,path,'选项编码不属于被引用的题目')
    }
  }
  input.blocks.forEach((b,i)=>{
    const path='flow.blocks.'+i
    if(terminalFound)error(issues,path,'END 之后的流程块不可执行，请删除')
    if(b.when)checkCondition(b.when,i,0,path+'.when')
    if(b.kind==='INSTRUMENT'){
      if(!b.instrumentKey||!unitMap.has(b.instrumentKey))
        error(issues,path+'.instrumentKey','工具块须引用此波次选中的研究工具编码')
      if(b.instrumentKey&&visited.has(b.instrumentKey))
        error(issues,path+'.instrumentKey','同一个工具不能重复执行')
      if(b.instrumentKey)visited.add(b.instrumentKey)
      if(!b.when&&b.instrumentKey&&unitMap.has(b.instrumentKey))guaranteedStarted=true
      if(b.title!==undefined||b.body!==undefined||b.termination!==undefined)
        error(issues,path,'工具块不允许携带素材或结束参数')
    }else if(b.kind==='MATERIAL'){
      if(b.instrumentKey!==undefined||b.termination!==undefined||!b.body?.trim())
        error(issues,path,'素材块只允许标题和非空正文')
      checkText(b.title,path+'.title');checkText(b.body,path+'.body')
    }else{
      if(!b.termination||b.instrumentKey!==undefined||b.body!==undefined)
        error(issues,path,'END 必须声明终止类别，且不可执行工具或素材')
      if(!b.when)error(issues,path+'.when','END 必须包含明确条件，避免意外终止全部被试')
      if(!guaranteedStarted)
        error(issues,path,'提前结束或资格筛除前必须有至少一个无条件执行的研究工具')
      if(b.termination==='SCREEN_OUT'&&![...visited].some(key=>unitMap.get(key)?.kind==='FORM'))
        error(issues,path,'筛除必须依据先前已收集的 Form 条件')
      terminalFound=!b.when // conditional END can be followed by another block
    }
  })
  for(const unit of allUnitKeys)if(!visited.has(unit))
    error(issues,'flow.blocks','所有冻结研究工具必须在流程中准确出现一次：'+unit)
}
