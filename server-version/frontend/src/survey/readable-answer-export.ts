/** A readable view of the already authorized, frozen raw artifact.
 * Never fetches data, joins other exports, or changes the original CSV/manifest. */
type Variable={columnKey:string;title:string;prompt:string;responseType:string;
  options:{code:string;label:string}[];valueEncoding?:string;waveOrdinal?:number;publicationVersion?:number}
const threatPrefix=/^(?:\s|\u200B|\u200C|\u200D|[\u202A-\u202E]|\uFEFF)*[=+@-]/
const cell=(value:string)=>'"'+(threatPrefix.test(value)?"'"+value:value).replace(/"/g,'""')+'"'
const missing:Record<string,string>={REFUSED:'不愿回答',UNABLE_TO_JUDGE:'无法判断',
  NOT_SHOWN:'未呈现',SHOWN_MISSING:'未作答',NO_WAVE:'未参加',ABANDONED:'未完成',
  WITHDRAWN:'已撤回',QUALITY_EXCLUDED:'未纳入分析',NOT_COMPARABLE:'不可比较',FREE_TEXT_EXCLUDED:'未包含文字回答'}
function parseCsv(text:string):string[][]{
  if(text.length>4_000_000)throw new Error('文件过大，请按批次下载中文答卷')
  const rows:string[][]=[];let row:string[]=[],value='',quoted=false,closed=false
  const field=()=>{row.push(value);value='';closed=false;if(row.length>512)throw new Error('导出列数超出范围')}
  const line=()=>{field();rows.push(row);row=[];if(rows.length>25001)throw new Error('导出行数超出范围')}
  text=text.replace(/^\uFEFF/,'')
  for(let i=0;i<text.length;i++){
    const ch=text[i]
    if(quoted){if(ch==='"'){if(text[i+1]==='"'){value+='"';i++}else{quoted=false;closed=true}}else value+=ch;continue}
    if(ch===','){field();continue}
    if(ch==='\r'||ch==='\n'){if(ch==='\r'&&text[i+1]==='\n')i++;line();continue}
    if(closed)throw new Error('CSV 引号后的内容无效')
    if(ch==='"'){if(value)throw new Error('CSV 引号格式无效');quoted=true}else value+=ch
  }
  if(quoted)throw new Error('CSV 引号未闭合')
  if(row.length||value||closed)line()
  return rows
}
function dictionary(value:unknown):Map<string,Variable>{
  if(!Array.isArray(value))throw new Error('此文件缺少中文题目说明，请下载原始数据')
  const result=new Map<string,Variable>()
  for(const item of value){
    if(!item||typeof item!=='object'||typeof item.columnKey!=='string'||typeof item.title!=='string'
      ||typeof item.prompt!=='string'||typeof item.responseType!=='string'||!Array.isArray(item.options)
      ||item.options.some((option:unknown)=>!option||typeof option!=='object'
        ||typeof (option as {code?:unknown}).code!=='string'||typeof (option as {label?:unknown}).label!=='string')
      ||result.has(item.columnKey))throw new Error('中文题目说明不完整或存在重复，已停止下载')
    result.set(item.columnKey,item as Variable)
  }
  return result
}
function displayAnswer(raw:string,variable:Variable):string{
  const options=new Map(variable.options.map(option=>[option.code,option.label]))
  const optionLabel=(code:string)=>{
    const label=options.get(code)??(code.startsWith("'")&&threatPrefix.test(code.slice(1))?options.get(code.slice(1)):undefined)
    if(label===undefined)throw new Error('回答与当前批次的题目选项不一致，已停止下载')
    return label
  }
  if(variable.valueEncoding==='JSON_STRING_ARRAY'||['MULTIPLE','MATRIX_MULTIPLE','SJT_MULTIPLE','RANK_ORDER'].includes(variable.responseType)){
    const values:unknown=JSON.parse(raw)
    if(!Array.isArray(values)||values.some(value=>typeof value!=='string'))throw new Error('多选回答格式无效')
    return values.map((value,index)=>variable.responseType==='RANK_ORDER'?(index+1)+'. '+optionLabel(value):optionLabel(value)).join('；')
  }
  if(variable.valueEncoding==='JSON_NUMBER_OBJECT'||variable.responseType==='CONSTANT_SUM'){
    const values:unknown=JSON.parse(raw)
    if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('分配回答格式无效')
    return Object.entries(values).map(([key,value])=>{
      if(typeof value!=='number'||!Number.isFinite(value))throw new Error('分配回答数值无效')
      return optionLabel(key)+'：'+value
    }).join('；')
  }
  return options.size?optionLabel(raw):raw
}
export function readableAnswerCsv(csv:string,codebook:unknown):string{
  const table=parseCsv(csv),header=table.shift()??[]
  const keys=['research_code_or_attempt','variable_code','value','missing_reason','final_completed_at_utc']
  if(new Set(header).size!==header.length||keys.some(key=>!header.includes(key)))throw new Error('此数据格式暂不支持中文答卷，请使用原始文件')
  const variables=dictionary(codebook)
  if(variables.size>510)throw new Error('中文横向表格最多包含 510 道题，请缩小导出范围')
  const columns=[...variables.values()]
  const fixed=['匿名答卷编号','最近提交时间（UTC）']
  const promptCounts=new Map<string,number>()
  for(const variable of columns)promptCounts.set(variable.prompt,(promptCounts.get(variable.prompt)??0)+1)
  const labelIdentity=(text:string)=>threatPrefix.test(text)?"'"+text:text
  const usedLabels=new Set(fixed.map(labelIdentity))
  const labels=columns.map(variable=>{
    let label=variable.prompt||'未命名题目'
    if((promptCounts.get(variable.prompt)??0)>1||usedLabels.has(labelIdentity(label))){
      const context=[variable.title||'问卷部分',
        typeof variable.waveOrdinal==='number'?'第 '+variable.waveOrdinal+' 轮':'',
        typeof variable.publicationVersion==='number'?'版本 '+variable.publicationVersion:''].filter(Boolean).join(' · ')
      label+='（'+context+'）'
    }
    const baseLabel=label;let suffix=2
    while(usedLabels.has(labelIdentity(label)))label=baseLabel+'（题目 '+(suffix++)+'）'
    usedLabels.add(labelIdentity(label));return label
  })
  const get=(row:string[],key:string)=>row[header.indexOf(key)]
  const participants=new Map<string,{completedAt:string;answers:Map<string,string>}>()
  for(const row of table){
    if(row.length!==header.length)throw new Error('CSV 行与列不一致')
    const key=get(row,'variable_code'),variable=variables.get(key)
    if(!variable)throw new Error('未找到本批次题目说明，已停止下载')
    const id=get(row,'research_code_or_attempt')
    if(!id)throw new Error('答卷缺少匿名编号，已停止下载')
    const completedAt=get(row,'final_completed_at_utc')
    let participant=participants.get(id)
    if(!participant){participant={completedAt,answers:new Map()};participants.set(id,participant)}
    if(participant.answers.has(key))throw new Error('同一答卷同一题出现重复记录，已停止下载')
    if(completedAt>participant.completedAt)participant.completedAt=completedAt
    const reason=get(row,'missing_reason'),raw=get(row,'value')
    participant.answers.set(key,reason?(missing[reason]??'未提供回答'):raw===''?'':displayAnswer(raw,variable))
  }
  const rows=[fixed.concat(labels),...[...participants].map(([id,participant])=>[
    id,participant.completedAt,...columns.map(variable=>participant.answers.get(variable.columnKey)??''),
  ])]
  let size=0
  return rows.map(row=>{
    const line=row.map(cell).join(',');size+=line.length
    if(size>4_000_000)throw new Error('中文表格过大，请按批次下载')
    return line
  }).join('\r\n')+'\r\n'
}
