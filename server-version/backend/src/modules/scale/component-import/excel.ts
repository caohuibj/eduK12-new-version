import ExcelJS from 'exceljs'
import {z} from 'zod'
import {canonicalHash} from '../../assessment-runtime/canonical'
import {parseComponentDraft,emptyReport,type ImportEntry,type ImportIssue} from './contract'
import {SCALE_BATCH_TEMPLATE} from './synthetic-template'

const sheets=['基本信息','题目','选项','计分','参数','报告','结构片段'] as const
const columns:Record<typeof sheets[number],string[]>={
  基本信息:['toolKey','configurationName','baseCombinationId','baseCombinationHash','contentVersion','parametersVersion','reportVersion','parametersMode','reportMode','definitionJson','metadataJson'],
  题目:['toolKey','itemJson'],选项:['toolKey','responseSetJson'],计分:['toolKey','scoringJson'],参数:['toolKey','parametersJson'],报告:['toolKey','reportJson'],
  结构片段:['toolKey','jsonKey','part','text'],
}
type Row={number:number;data:Record<string,unknown>}
const issue=(sheet:string,row:number,path:string,message:string):ImportIssue=>({sheet,row,path,message})
const blank=(v:unknown)=>v===undefined||v===null||v===''
const json=(v:unknown)=>typeof v==='string'?JSON.parse(v):v
export async function componentTemplateWorkbook(){
 const book=new ExcelJS.Workbook()
 for(const name of sheets){const s=book.addWorksheet(name);s.addRow(columns[name]);s.getRow(1).font={bold:true};s.columns.forEach(c=>{c.width=28})}
 const s=SCALE_BATCH_TEMPLATE.sources[0],{items,responseSets,scoring,report,referencePolicy,...definition}=s.executable.definition
 book.getWorksheet('基本信息')!.addRow([s.identity.instrumentKey,'合成配置 v1','','','1.0.0','none-v1','1.0.0','NONE','PROVIDED',JSON.stringify(definition),JSON.stringify({title:s.catalog.identity.canonicalName,catalog:s.catalog,applicability:s.applicability,disclosure:s.disclosure,instruction:s.instruction})])
 items.forEach(item=>book.getWorksheet('题目')!.addRow([s.identity.instrumentKey,JSON.stringify(item)]))
 responseSets.forEach(set=>book.getWorksheet('选项')!.addRow([s.identity.instrumentKey,JSON.stringify(set)]))
 book.getWorksheet('计分')!.addRow([s.identity.instrumentKey,JSON.stringify(scoring)])
 book.getWorksheet('报告')!.addRow([s.identity.instrumentKey,JSON.stringify(report)])
 const help=book.addWorksheet('填写说明')
 help.addRows([
  ['格式版本',1],['工作表','基本信息始终必需；C 需要题目/选项/计分；P/R 可以独立导入。'],
  ['JSON 列','UTF-8 JSON 对象；完整保留现有题目、素材身份、计分、参数和报告字段。不执行公式或代码。每个 JSON 单元格最多 32767 字符。'],
  ['长JSON','超过单元格上限时填写 @json:自定key；在结构片段表按同一toolKey/jsonKey填写part=1,2,...和text，拼接为一个完整JSON，不截断内容。'],
  ['definitionJson','ScaleDefinitionV2 除 items/responseSets/scoring/report/referencePolicy 外所有字段，包含 source/license/display/versionAxes。'],
  ['metadataJson','title 必需；可填写 instruction、applicability、disclosure、catalog、localization、usageRequirements、educationApplicability、educationExpertApplicability、educationalFeedback。'],
  ['parametersMode / reportMode','PROVIDED=提供对应表内容，NONE=明确不配置，INHERIT或空白=未提供，继承精确base。无base时不自动视为NONE。'],
  ['parametersJson','{"referencePolicy":{...},"references":[完整现有reference set]}'],
  ['reportJson','完整 ScaleDefinitionV2.report；或 {"definition":完整report,"template":现有声明式报告模板（含blocks/CHART/ASSET）}。'],
  ['素材','仅填写已上传且获准的assetId/contentHash/mimeType等既有资源身份；本地文件名不代表已上传。'],
  ['版本','contentVersion=x.y.z；参数/报告版本明确填写；同正式版本不能改内容。'],
  ['限制','每批10份，压缩文件2MiB，展开最多20000个非空行。特殊计分仅引用服务器已安装scorerKey，不上传脚本。'],
 ])
 help.columns=[{width:30},{width:120}]
 return Buffer.from(await book.xlsx.writeBuffer())
}
export async function parseComponentWorkbook(buffer:Buffer){
 if(buffer.length>2*1024*1024)throw new Error('Excel 文件不能超过 2 MiB')
 const book=new ExcelJS.Workbook();await book.xlsx.load(buffer as never)
 const records=new Map<string,Row[]>(),global:ImportIssue[]=[]
 let count=0
 for(const name of sheets){
  const sheet=book.getWorksheet(name);if(!sheet){records.set(name,[]);continue}
  const expected=columns[name],header=sheet.getRow(1).values as unknown[],names=header.slice(1).map(v=>String(v??'').trim())
  if(expected.some((v,i)=>names[i]!==v)||names.slice(expected.length).some(Boolean))global.push(issue(name,1,'header','列名或顺序与模板不一致'))
  const rows:Row[]=[]
  sheet.eachRow((row,n)=>{if(n===1)return;if(++count>20000)throw new Error('Excel 非空行超过20000行')
   const data:Record<string,unknown>={}
   row.eachCell((cell,i)=>{
    const value=cell.value
    if(value!==null&&typeof value==='object')global.push(issue(name,n,names[i-1]??String(i),'不接受公式、超链接或富文本单元格；请填写纯文本/数字'))
    if(i>expected.length&&!blank(value))global.push(issue(name,n,String(i),'模板未定义的列'))
    if(names[i-1])data[names[i-1]]=value
   })
   rows.push({number:n,data})
  });records.set(name,rows)
 }
 const basics=records.get('基本信息')!
 if(!basics.length||basics.length>10)throw new Error('基本信息必须包含1至10份量表')
 const entries:ImportEntry[]=basics.map((row,index)=>{
  const toolKey=String(row.data.toolKey??''),issues=global.filter(i=>i.row===1||i.sheet==='基本信息'&&i.row===row.number)
  const own=(name:string)=>records.get(name)!.filter(r=>r.data.toolKey===toolKey)
  const decode=(value:unknown)=>{
   if(typeof value!=='string'||!value.startsWith('@json:'))return json(value)
   const key=value.slice(6),chunks=own('结构片段').filter(r=>r.data.jsonKey===key).sort((a,b)=>Number(a.data.part)-Number(b.data.part))
   if(!chunks.length||chunks.some((r,i)=>Number(r.data.part)!==i+1||typeof r.data.text!=='string'))throw new Error('结构片段 '+key+' 缺失、重复或顺序不连续')
   return JSON.parse(chunks.map(r=>r.data.text).join(''))
  }
  for(const name of sheets)for(const r of own(name))issues.push(...global.filter(i=>i.sheet===name&&i.row===r.number&&i.row!==1))
  try{
   const b=row.data,parts:Record<string,unknown>={}
   const parseRows=(name:string,column:string)=>own(name).map(r=>{try{return decode(r.data[column])}catch(e){issues.push(issue(name,r.number,column,e instanceof SyntaxError?'JSON 格式错误':e instanceof Error?e.message:'JSON 格式错误'));return null}})
   if(!blank(b.contentVersion)){
    const itemRows=parseRows('题目','itemJson'),responseRows=parseRows('选项','responseSetJson'),scoreRows=parseRows('计分','scoringJson')
    if(scoreRows.length!==1)issues.push(issue('计分',row.number,'scoringJson','每个 C 需要且只需一行完整计分定义'))
    const scoring=scoreRows[0] as {scores:Parameters<typeof emptyReport>[0]}|undefined
    parts.CONTENT={version:String(b.contentVersion),definition:{...decode(b.definitionJson),items:itemRows,responseSets:responseRows,scoring,report:emptyReport(scoring?.scores??[]),referencePolicy:{type:'none'}},metadata:decode(b.metadataJson)}
   }else if(['题目','选项','计分'].some(n=>own(n).length)||!blank(b.definitionJson)||!blank(b.metadataJson))issues.push(issue('基本信息',row.number,'contentVersion','提供C内容时必须填写contentVersion'))
   for(const [axis,name,column,modeKey,versionKey] of [['PARAMETERS','参数','parametersJson','parametersMode','parametersVersion'],['REPORT','报告','reportJson','reportMode','reportVersion']] as const){
    const rows=own(name),mode=String(b[modeKey]??'').trim()
    if(mode==='NONE'){if(rows.length)issues.push(issue(name,rows[0].number,column,'NONE不能同时提供组分内容'));parts[axis]={version:String(b[versionKey]??'none-v1'),payload:null}}
    else if(mode==='PROVIDED'||rows.length){
     if(mode&&mode!=='PROVIDED')issues.push(issue('基本信息',row.number,modeKey,'继承模式不能同时提供组分内容'))
     if(rows.length!==1)issues.push(issue(name,row.number,column,'每份量表需要且只需一行完整组分JSON'))
     parts[axis]={version:String(b[versionKey]??''),payload:parseRows(name,column)[0]}
    }else if(mode&&mode!=='INHERIT')issues.push(issue('基本信息',row.number,modeKey,'仅支持PROVIDED、NONE、INHERIT或空白'))
   }
   const base=blank(b.baseCombinationId)&&blank(b.baseCombinationHash)?null:{releaseId:b.baseCombinationId,combinationHash:b.baseCombinationHash}
   const draft=parseComponentDraft({toolKey,configurationName:b.configurationName,baseCombination:base,changedParts:parts})
   return {index,toolKey,draft:issues.length?null:draft,issues}
  }catch(e){
   if(e instanceof z.ZodError)issues.push(...e.issues.map(i=>{
    const path=i.path.join('.'),field=i.path[3],sheet=i.path[1]==='CONTENT'?(field==='items'?'题目':field==='responseSets'?'选项':field==='scoring'?'计分':'基本信息'):i.path[1]==='PARAMETERS'?'参数':i.path[1]==='REPORT'?'报告':'基本信息'
    const actualRow=sheet==='基本信息'?row.number:own(sheet)[typeof i.path[4]==='number'?i.path[4]:0]?.number??row.number
    return issue(sheet,actualRow,path,i.message)
   }))
   else issues.push(issue('基本信息',row.number,'JSON',e instanceof SyntaxError?'JSON 格式错误':e instanceof Error?e.message:'组分解析失败'))
   return {index,toolKey,draft:null,issues}
  }
 })
 for(const entry of entries)if(entries.filter(e=>e.toolKey===entry.toolKey).length>1){entry.issues.push(issue('基本信息',basics[entry.index].number,'toolKey','同批toolKey重复'));entry.draft=null}
 const known=new Set(entries.map(e=>e.toolKey))
 for(const name of sheets)if(name!=='基本信息')for(const row of records.get(name)!)if(!known.has(String(row.data.toolKey??'')))throw new Error(`${name} 第${row.number}行 toolKey 未在基本信息声明`)
 return {digest:canonicalHash({schemaVersion:1,entries}),entries}
}
