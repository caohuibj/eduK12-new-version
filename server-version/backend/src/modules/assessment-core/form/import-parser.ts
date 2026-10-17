import type { FormQuestion } from './definition'

export type ImportRow={type:FormQuestion['type'];
  prompt:string;required:boolean;options:string[];rows:string[];dimensionKey?:string;reverse:boolean;
  min?:number;max?:number;step?:number;precision?:number;total?:number;
  minSelections?:number;maxSelections?:number;integerOnly?:boolean;timeZone?:'UTC'|'Asia/Shanghai';
  /** One-based physical source line, preserved through quoted multiline CSV. */
  sourceLine:number}
export type ImportIssue={line:number;message:string}
const types:Record<string,ImportRow['type']>={
  single:'SINGLE',choice:'SINGLE',select:'SINGLE',单选:'SINGLE',
  multiple:'MULTIPLE',多选:'MULTIPLE',likert:'LIKERT',量表:'LIKERT',
  text:'SHORT_TEXT',文本:'SHORT_TEXT',long_text:'LONG_TEXT',长文本:'LONG_TEXT',
  number:'NUMBER',数值:'NUMBER',matrix:'MATRIX',矩阵:'MATRIX',
  date:'DATE',日期:'DATE',time:'TIME',时间:'TIME',
  rank_order:'RANK_ORDER',ranking:'RANK_ORDER',排序:'RANK_ORDER',
  slider:'SLIDER',滑块:'SLIDER',
  constant_sum:'CONSTANT_SUM',恒定总和:'CONSTANT_SUM',
  matrix_multiple:'MATRIX_MULTIPLE',矩阵多选:'MATRIX_MULTIPLE',
}
const clean=(s:string)=>s.replace(/^\uFEFF/,'').trim()
const splitOptions=(s:string)=>s.split('||').map(clean).filter(Boolean)
const parseBoolean=(s:string,defaultValue:boolean):boolean|null=>{
  if(!s.trim())return defaultValue
  if(['true','yes','1','是','必答'].includes(s.trim().toLowerCase()))return true
  if(['false','no','0','否','选答'].includes(s.trim().toLowerCase()))return false
  return null
}
export const parseText=(input:string):{rows:ImportRow[];issues:ImportIssue[]}=>{
  const rows:ImportRow[]=[],issues:ImportIssue[]=[]
  const blocks=input.replace(/\r\n?/g,'\n').trim().split(/\n\s*\n/)
  let startLine=1
  for(let i=0;i<blocks.length;i++){
    const lines=blocks[i].split('\n').map(clean).filter(Boolean)
    if(!lines.length)continue
    const prompt=lines[0]
    const options=lines.slice(1).map(x=>x.replace(/^(?:[A-Za-z0-9]{1,3}[.．)、:]\s*)/,'').trim())
    if(!prompt){issues.push({line:i+1,message:'缺少题干'});continue}
    const type=options.length?'SINGLE':'SHORT_TEXT'
    if(options.length===1)issues.push({line:i+1,message:'选择题至少需要两个选项'})
    rows.push({type,prompt,required:true,options,rows:[],reverse:false,sourceLine:startLine})
    startLine+=blocks[i].split('\n').length+1
  }
  if(!rows.length)issues.push({line:1,message:'没有识别到可导入题目'})
  return {rows,issues}
}
/** Quoted CSV, including embedded commas/newlines and doubled quote escaping. */
const parseCsvRows=(content:string):Array<{cells:string[];sourceLine:number}>=>{
  const rows:Array<{cells:string[];sourceLine:number}>=[]
  let line:string[]=[],field='',quoted=false
  let currentLine=1,rowLine=1
  const s=content.replace(/^\uFEFF/,'')
  for(let i=0;i<s.length;i++){
    const c=s[i]
    if(quoted){
      if(c==='"'&&s[i+1]==='"'){field+='"';i++}
      else if(c==='"')quoted=false
      else field+=c
      if(c==='\n')currentLine++
      continue
    }
    if(c==='"'){
      if(field)throw new Error('CSV 引号只能包裹完整单元格')
      quoted=true
    }else if(c===','){line.push(field);field=''}
    else if(c==='\n'){
      line.push(field);rows.push({cells:line,sourceLine:rowLine})
      line=[];field='';currentLine++;rowLine=currentLine
    }
    else if(c==='\r'){
      if(s[i+1]==='\n')continue
      line.push(field);rows.push({cells:line,sourceLine:rowLine})
      line=[];field='';currentLine++;rowLine=currentLine
    }
    else field+=c
  }
  if(quoted)throw new Error('CSV 引号未闭合')
  if(field||line.length){line.push(field);rows.push({cells:line,sourceLine:rowLine})}
  return rows
}
export const parseCsv=(content:string):{rows:ImportRow[];issues:ImportIssue[]}=>{
  const rows:ImportRow[]=[],issues:ImportIssue[]=[]
  let matrix:Array<{cells:string[];sourceLine:number}>
  try{matrix=parseCsvRows(content)}catch(error){return {rows,issues:[{line:1,message:error instanceof Error?error.message:'CSV 格式错误'}]}}
  if(!matrix.length)return {rows,issues:[{line:1,message:'CSV 为空'}]}
  const header=matrix[0].cells.map(s=>clean(s).toLowerCase())
  for(const required of ['type','prompt'])if(!header.includes(required))
    issues.push({line:1,message:'缺少必需表头：'+required})
  if(new Set(header).size!==header.length)issues.push({line:1,message:'表头不能重复'})
  if(issues.length)return {rows,issues}
  const field=(cells:string[],name:string)=>cells[header.indexOf(name)]??''
  for(let i=1;i<matrix.length;i++){
    const {cells,sourceLine}=matrix[i]
    if(cells.every(x=>!x.trim()))continue
    const type=types[clean(field(cells,'type')).toLowerCase()]
    if(!type){issues.push({line:sourceLine,message:'未知题型'});continue}
    const prompt=clean(field(cells,'prompt'))
    if(!prompt){issues.push({line:sourceLine,message:'题干不能为空'});continue}
    const required=parseBoolean(field(cells,'required'),true)
    const reverse=parseBoolean(field(cells,'reverse'),false)
    if(required===null||reverse===null){issues.push({line:sourceLine,message:'required/reverse 应填 true 或 false'});continue}
    const options=splitOptions(field(cells,'options'))
    const matrixRows=splitOptions(field(cells,'rows'))
    const numeric=(key:string):number|undefined=>{
      const value=clean(field(cells,key))
      return value?Number(value):undefined
    }
    const attributes={
      min:numeric('min'),max:numeric('max'),step:numeric('step'),
      precision:numeric('precision'),total:numeric('total'),
      minSelections:numeric('min_selections'),maxSelections:numeric('max_selections'),
    }
    if(Object.values(attributes).some(v=>v!==undefined&&!Number.isFinite(v))){
      issues.push({line:sourceLine,message:'数值配置必须为合法有限数字'});continue
    }
    const rawInteger=clean(field(cells,'integer_only'))
    const integerOnly=rawInteger?parseBoolean(rawInteger,false):undefined
    if(integerOnly===null){issues.push({line:sourceLine,message:'integer_only 必须为 true 或 false'});continue}
    const rawZone=clean(field(cells,'time_zone'))
    if(rawZone&&!['UTC','Asia/Shanghai'].includes(rawZone)){
      issues.push({line:sourceLine,message:'time_zone 仅支持 UTC 或 Asia/Shanghai'});continue
    }
    rows.push({type,prompt,required,options,rows:matrixRows,
      reverse,dimensionKey:clean(field(cells,'dimension'))||undefined,sourceLine,
      ...attributes,...(integerOnly===undefined?{}:{integerOnly}),
      ...((type==='TIME')?{timeZone:(rawZone||'Asia/Shanghai') as 'Asia/Shanghai'|'UTC'}:{})})
  }
  if(!rows.length)issues.push({line:1,message:'未识别有效数据行'})
  return {rows,issues}
}
