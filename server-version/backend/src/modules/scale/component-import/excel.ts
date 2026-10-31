import ExcelJS from 'exceljs'
import {z} from 'zod'
import {canonicalHash} from '../../assessment-runtime/canonical'
import {parseComponentDraft,emptyReport,type ImportEntry,type ImportIssue} from './contract'
import {SCALE_BATCH_TEMPLATE} from './synthetic-template'
import {componentColumns as columns,legacyColumns,ordinaryColumns,ComponentColumnReader,ColumnInputError,type TableRow as Row} from './ordinary-columns'

const sheets=['基本信息','题目','选项','计分','参数','报告','结构片段'] as const
const issue=(sheet:string,row:number,path:string,message:string):ImportIssue=>({sheet,row,path,message})
const blank=(v:unknown)=>v===undefined||v===null||v===''
const json=(v:unknown)=>typeof v==='string'?JSON.parse(v):v
export async function componentTemplateWorkbook(options:{advanced?:boolean}={}){
 const book=new ExcelJS.Workbook()
 for(const name of sheets){const s=book.addWorksheet(name);s.addRow(columns[name]);s.getRow(1).font={bold:true};s.views=[{state:'frozen',ySplit:1}];s.columns.forEach((c,i)=>{c.width=24;if(!options.advanced&&columns[name][i].endsWith('Json'))c.hidden=true});if(name==='结构片段'&&!options.advanced)s.state='hidden'}
 const s=SCALE_BATCH_TEMPLATE.sources[0],{items,responseSets,scoring,report,referencePolicy,...definition}=s.executable.definition
 if(options.advanced){
 book.getWorksheet('基本信息')!.addRow([s.identity.instrumentKey,'合成配置 v1','','','1.0.0','none-v1','1.0.0','NONE','PROVIDED',JSON.stringify(definition),JSON.stringify({title:s.catalog.identity.canonicalName,catalog:s.catalog,applicability:s.applicability,disclosure:s.disclosure,instruction:s.instruction})])
 items.forEach(item=>book.getWorksheet('题目')!.addRow([s.identity.instrumentKey,JSON.stringify(item)]))
 responseSets.forEach(set=>book.getWorksheet('选项')!.addRow([s.identity.instrumentKey,JSON.stringify(set)]))
 book.getWorksheet('计分')!.addRow([s.identity.instrumentKey,JSON.stringify(scoring)])
 book.getWorksheet('报告')!.addRow([s.identity.instrumentKey,JSON.stringify(report)])
 }else{
  const add=(name:typeof sheets[number],data:Record<string,unknown>)=>book.getWorksheet(name)!.addRow(columns[name].map(k=>data[k]??null)),toolKey=s.identity.instrumentKey
  add('基本信息',{toolKey,configurationName:'合成Likert配置 v1',contentVersion:'1.0.0',parametersVersion:'P1',reportVersion:'1.0.0',parametersMode:'PROVIDED',reportMode:'PROVIDED',
   名称:'合成Likert示例（无测量效度）',来源标题:'合成工程示例',来源引用:'无真实量表或个人数据',授权状态:'自编',再分发:'允许',指导语:'请选择最符合的一项；仅用于工程示例。',语言:'zh-CN',作答者类型:'本人自评',适用作答者:'本人',披露受众:'研究者',披露能力:'数值分数|参考结果|个体解释|分档标签',计分版本:'1.0.0',缺失策略:'全部必答'})
  add('题目',{toolKey,题号:'Q1',题干:'这是一道合成正向题。',顺序:1,选项组:'likert',题型:'单选',必答:'是'})
  add('题目',{toolKey,题号:'Q2',题干:'这是一道合成反向题。',顺序:2,选项组:'likert',题型:'单选',必答:'是'})
  for(let n=1;n<=5;n++)add('选项',{toolKey,选项组:'likert',选项值:n,选项文字:['完全不符合','不太符合','一般','比较符合','完全符合'][n-1],分值:n})
  add('计分',{toolKey,指标:'total',类型:'总分',名称:'合成加权总分',方向:'描述',主要指标:'是',小数位:0,来源:'题目',题号或指标:'Q1',权重:1,聚合:'加权求和',反向:'否'})
  add('计分',{toolKey,指标:'total',题号或指标:'Q2',权重:2,反向:'是'})
  add('计分',{toolKey,指标:'dimension',类型:'维度',名称:'合成维度均分',方向:'描述',主要指标:'否',小数位:1,来源:'题目',题号或指标:'Q1',权重:1,聚合:'平均'})
  add('计分',{toolKey,指标:'dimension',题号或指标:'Q2',权重:1})
  add('参数',{toolKey,参考版本:'P1',指标:'total',内容版本:'1.0.0',计分版本:'1.0.0',参考类型:'准则阈值',分档标识:'low',分档名称:'合成较低分档',下限含:3,上限含:9,参考人群:'仅合成示例，无真实参考人群',引用:'仅合成阈值，不用于真实解释',证据级别:'理论',来源类型:'理论分数范围'})
  add('参数',{toolKey,参考版本:'P1',指标:'total',分档标识:'high',分档名称:'合成较高分档',下限含:10,上限含:15})
  add('报告',{toolKey,指标:'total',标题:'合成总分',解释:'仅演示分档解释，不作真实判断。',解释来源:'选定参数',分档标识:'low',分档名称:'合成较低分档',分档解释:'合成分数位于所填较低分档。',建议:'仅核对示例填写结果。',建议类别:'反思',局限:'无测量效度，仅为工程示例。',免责声明:'不得用于真实测量或决策。',主要指标:'是'})
  add('报告',{toolKey,指标:'total',分档标识:'high',分档名称:'合成较高分档',分档解释:'合成分数位于所填较高分档。'})
  add('报告',{toolKey,指标:'dimension',标题:'合成维度',解释:'只显示合成均分。',解释来源:'分数',主要指标:'否'})
 }
 const help=book.addWorksheet('填写说明')
 help.addRows([
  ['格式版本',1],['工作表','默认样例使用普通列，不用编写JSON。基本信息始终必需；C 需要题目/选项/计分；P/R 可以独立导入。'],
  ['高级模式与冲突','隐藏的 *Json 列及结构片段可取消隐藏使用。同一量表的同一工作表使用普通行或JSON行之一，不混用；基本信息 definitionJson/metadataJson 与各自普通字段互斥，scoringJson 与基本信息普通计分字段互斥。冲突会报原始行，不覆盖。'],
  ['普通基本信息','名称、来源标题/引用、指导语直接填文本。contentVersion 为C版本；参数/报告模式使用 PROVIDED/NONE/INHERIT。作答者类型默认本人自评；适用作答者明确填写本人/家长/教师/观察者/临床人员，多个用 | 分隔。'],
  ['普通题目与选项','每题一行；题型填单选（高级题型使用既有定义JSON）。每选项一行，以选项组归组；选项值保留Excel数字/文本类型，分值是数字。顺序为空按行顺序；必答默认是，随机默认否。'],
  ['普通计分','每指标成员一行；同指标首行填类型（总分/维度）、名称、方向、聚合（求和/平均/加权求和/加权平均）。来源填题目或指标；题号或指标填精确编码，权重默认1。反向按题全局生效，同题不同设置报错。'],
  ['组内共享字段','同选项组/计分指标/参数参考版本+指标/报告指标的共享字段在首行填写，后续行留空或重复相同值；不同值报冲突。题号/指标编码不可重名冒充另一实体。'],
  ['普通缺失策略','默认全部必答；可选允许缺失不折算、最低作答折算（填写最少作答数）、来源定义。高级计分映射、custom scorer及嵌套规则使用scoringJson。'],
  ['普通参数','每个分档一行；当前普通列支持准则阈值。首行填参考人群、引用、证据级别、来源类型；范围上下限均含。参考版本默认parametersVersion，内容/计分版本默认本次C（P-only须明确填写）。复杂常模/人群匹配用parametersJson。'],
  ['普通报告','每指标/分档一行。标题、解释、免责声明为文字；分档需填标识、名称、解释，与P精确匹配。建议/局限每行一条。解释来源可填分数、选定参数、精确参考；精确参考需参考版本/类型。复杂图表/素材/布局用reportJson。'],
  ['普通默认值','方向默认描述；计分版本默认C版本；聚合默认求和；主要指标默认首指标；小数位默认1。缺省授权状态/再分发为未知，不声明已获授权。均空的披露受众/能力表示不披露，不影响独立使用授权。'],
  ['常用取值','方向：描述/越高越好/越高越差/越高越多/越低越好/双极；授权状态：自编/已核实/已授权/未知；再分发：允许/受限/未知。证据级别：理论/文献试用/本地试测/本地常模/已验证常模；来源类型：理论分数范围/文献报告/文献估计/本地观察（由填写者声明，不是新增审核）。'],
  ['披露与适用','披露受众：作答者/被评者/教师/研究者；能力：数值分数/参考结果/个体解释/分档标签/质量详情/原始答案/逐题分数/方法/教育内容。多值用 | 分隔。适用年龄用月龄，最大值不含；复杂策略用metadataJson。'],
  ['JSON 列','UTF-8 JSON 对象；完整保留现有题目、素材身份、计分、参数和报告字段。不执行公式或代码。每个 JSON 单元格最多 32767 字符。'],
  ['长JSON','超过单元格上限时填写 @json:自定key；在结构片段表按同一toolKey/jsonKey填写part=1,2,...和text，拼接为一个完整JSON，不截断内容。'],
  ['definitionJson','ScaleDefinitionV2 除 items/responseSets/scoring/report/referencePolicy 外所有字段，包含 source/license/display/versionAxes。'],
  ['metadataJson','title 必需；可填写 instruction、applicability、disclosure、catalog、localization、usageRequirements、educationApplicability、educationExpertApplicability、educationalFeedback。'],
  ['parametersMode / reportMode','PROVIDED=提供对应表内容，NONE=明确不配置，INHERIT或空白=未提供，继承精确base。无base时不自动视为NONE。'],
  ['parametersJson','{"referencePolicy":{...},"references":[完整现有reference set]}'],
  ['reportJson','完整 ScaleDefinitionV2.report；或 {"definition":完整report,"template":现有声明式报告模板（含blocks/CHART/ASSET）,"assetRefs":[{"assetId":"已上传资源ID","sha256":"资源摘要","mediaType":"image/png"}]}。'],
  ['素材','仅填写已上传且获准的assetId/contentHash/mimeType等既有资源身份；本地文件名不代表已上传。'],
  ['版本','contentVersion=x.y.z；参数/报告版本明确填写；同正式版本不能改内容。'],
  ['限制','每批10份，压缩文件2MiB，展开最多20000个非空行。特殊计分仅引用服务器已安装scorerKey，不上传脚本。'],
 ])
 help.columns=[{width:30},{width:120}]
 return Buffer.from(await book.xlsx.writeBuffer())
}
export async function parseComponentWorkbook(buffer:Buffer){
 if(buffer.length>2*1024*1024)throw new Error('Excel 文件不能超过 2 MiB')
 // Check ZIP metadata before expanding XML in memory; this is a synchronous,
 // bounded request on the existing API, not a background import service.
 const end=buffer.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]))
 if(end<0||end+22>buffer.length)throw new Error('请选择有效的xlsx工作簿')
 const countEntries=buffer.readUInt16LE(end+10);let offset=buffer.readUInt32LE(end+16),expanded=0
 if(countEntries>1000)throw new Error('Excel归档条目过多')
 for(let i=0;i<countEntries;i++){
  if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==0x02014b50)throw new Error('Excel归档目录不完整')
  expanded+=buffer.readUInt32LE(offset+24)
  if(expanded>32*1024*1024)throw new Error('Excel展开内容不能超过32 MiB')
  offset+=46+buffer.readUInt16LE(offset+28)+buffer.readUInt16LE(offset+30)+buffer.readUInt16LE(offset+32)
 }
 const book=new ExcelJS.Workbook();await book.xlsx.load(buffer as never)
 const records=new Map<string,Row[]>(),global:ImportIssue[]=[]
 let count=0
 for(const name of sheets){
  const sheet=book.getWorksheet(name);if(!sheet){records.set(name,[]);continue}
  const expected=columns[name],header=sheet.getRow(1).values as unknown[],names=header.slice(1).map(v=>String(v??'').trim())
  const legacy=legacyColumns[name],active=names.length===legacy.length?legacy:expected
  if(active.some((v,i)=>names[i]!==v)||names.slice(active.length).some(Boolean))global.push(issue(name,1,'header','列名或顺序与模板不一致'))
  const rows:Row[]=[]
  sheet.eachRow((row,n)=>{if(n===1)return;if(++count>20000)throw new Error('Excel 非空行超过20000行')
   const data:Record<string,unknown>={}
   row.eachCell((cell,i)=>{
    const value=cell.value
    if(value!==null&&typeof value==='object')global.push(issue(name,n,names[i-1]??String(i),'不接受公式、超链接或富文本单元格；请填写纯文本/数字'))
    if(i>active.length&&!blank(value))global.push(issue(name,n,String(i),'模板未定义的列'))
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
  const reader=new ComponentColumnReader(row,own,decode)
  try{
   const b=row.data,parts:Record<string,unknown>={}
   if(!blank(b.contentVersion)){
    const definition=reader.definition()
    if(!definition||typeof definition!=='object'||Array.isArray(definition))throw new Error('definitionJson 必须是JSON对象')
    for(const field of ['items','responseSets','scoring','report','referencePolicy'])if(Object.prototype.hasOwnProperty.call(definition,field))issues.push(issue('基本信息',row.number,'definitionJson.'+field,'请在对应组分工作表提供此字段，不能重复填写并覆盖'))
    const itemRows=reader.items(),responseRows=reader.options(),scoring=reader.scoring(itemRows) as {scores:Parameters<typeof emptyReport>[0]}|undefined
    parts.CONTENT={version:String(b.contentVersion),definition:{...definition,items:itemRows,responseSets:responseRows,scoring,report:emptyReport(scoring?.scores??[]),referencePolicy:{type:'none'}},metadata:reader.metadata()}
   }else if(['题目','选项','计分'].some(n=>own(n).length)||!blank(b.definitionJson)||!blank(b.metadataJson)||ordinaryColumns.基本信息.some(k=>!blank(b[k])))issues.push(issue('基本信息',row.number,'contentVersion','提供C内容时必须填写contentVersion'))
   for(const [axis,name,column,modeKey,versionKey] of [['PARAMETERS','参数','parametersJson','parametersMode','parametersVersion'],['REPORT','报告','reportJson','reportMode','reportVersion']] as const){
    const rows=own(name),mode=String(b[modeKey]??'').trim()
    if(mode==='NONE'){if(rows.length)issues.push(issue(name,rows[0].number,column,'NONE不能同时提供组分内容'));parts[axis]={version:String(b[versionKey]??'none-v1'),payload:null}}
    else if(mode==='PROVIDED'||rows.length){
     if(mode&&mode!=='PROVIDED')issues.push(issue('基本信息',row.number,modeKey,'继承模式不能同时提供组分内容'))
     parts[axis]={version:String(b[versionKey]??''),payload:axis==='PARAMETERS'?reader.parameters():reader.report()}
    }else if(mode&&mode!=='INHERIT')issues.push(issue('基本信息',row.number,modeKey,'仅支持PROVIDED、NONE、INHERIT或空白'))
   }
   const base=blank(b.baseCombinationId)&&blank(b.baseCombinationHash)?null:{releaseId:b.baseCombinationId,combinationHash:b.baseCombinationHash}
   const draft=parseComponentDraft({toolKey,configurationName:b.configurationName,baseCombination:base,changedParts:parts})
   return {index,row:row.number,toolKey,draft:issues.length?null:draft,issues}
  }catch(e){
   if(e instanceof ColumnInputError)issues.push(issue(e.sheet,e.row,e.path,e.message))
   else if(e instanceof z.ZodError)issues.push(...e.issues.map(i=>{
    const path=i.path.join('.'),field=i.path[3],sheet=i.path[1]==='CONTENT'?(field==='items'?'题目':field==='responseSets'?'选项':field==='scoring'?'计分':'基本信息'):i.path[1]==='PARAMETERS'?'参数':i.path[1]==='REPORT'?'报告':'基本信息'
    const actualRow=sheet==='基本信息'?row.number:own(sheet)[Number.isInteger(Number(i.path[4]))?Number(i.path[4]):0]?.number??row.number
    const location=reader.locate(path)
    return issue(location?.sheet??sheet,location?.row??actualRow,path,i.message)
   }))
   else issues.push(issue('基本信息',row.number,'JSON',e instanceof SyntaxError?'JSON 格式错误':e instanceof Error?e.message:'组分解析失败'))
   return {index,row:row.number,toolKey,draft:null,issues}
  }
 })
 for(const entry of entries)if(entries.filter(e=>e.toolKey===entry.toolKey).length>1){entry.issues.push(issue('基本信息',basics[entry.index].number,'toolKey','同批toolKey重复'));entry.draft=null}
 const known=new Set(entries.map(e=>e.toolKey))
 for(const name of sheets)if(name!=='基本信息')for(const row of records.get(name)!)if(!known.has(String(row.data.toolKey??'')))entries.push({index:entries.length,row:row.number,toolKey:String(row.data.toolKey??''),draft:null,issues:[issue(name,row.number,'toolKey','未在基本信息声明此量表，未保存此行')]})
 return {digest:canonicalHash({schemaVersion:1,entries}),entries}
}
