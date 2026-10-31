import {describe,it,expect} from 'vitest'
import ExcelJS from 'exceljs'
import {componentTemplateWorkbook,parseComponentWorkbook} from '../../modules/scale/component-import/excel'
import {scoreScale} from '../../modules/scale/scale-scoring'
import {ordinaryColumns,legacyColumns,type ComponentSheet} from '../../modules/scale/component-import/ordinary-columns'

async function workbook(){const b=new ExcelJS.Workbook();await b.xlsx.load(await componentTemplateWorkbook({advanced:true}) as never);return b}
const parse=async(b:ExcelJS.Workbook)=>parseComponentWorkbook(Buffer.from(await b.xlsx.writeBuffer()))
const cell=(b:ExcelJS.Workbook,sheet:string,row:number,column:string)=>{const s=b.getWorksheet(sheet)!;const headers=(s.getRow(1).values as unknown[]).map(String);return s.getRow(row).getCell(headers.indexOf(column))}
async function ordinaryWorkbook(){const b=new ExcelJS.Workbook();await b.xlsx.load(await componentTemplateWorkbook() as never);return b}
describe('administrator Excel component imports',()=>{
 it('downloads a usable Likert example without JSON and preserves reverse, weights, dimensions and P/R bands',async()=>{
  const b=await ordinaryWorkbook()
  for(const sheet of b.worksheets)if(!['填写说明','结构片段'].includes(sheet.name))sheet.eachRow((r,n)=>{if(n>1)for(const c of ['definitionJson','metadataJson','itemJson','responseSetJson','scoringJson','parametersJson','reportJson']){
   const headers=(sheet.getRow(1).values as unknown[]).map(String),index=headers.indexOf(c);if(index>0)expect(r.getCell(index).value).toBeNull()
  }})
  const result=await parse(b);expect(result.entries[0].issues).toEqual([])
  const d=result.entries[0].draft!,c=d.changedParts.CONTENT!
  expect(c.metadata.instruction?.text).toContain('请选择')
  expect(c.definition.scoring.itemRules).toContainEqual({itemCode:'Q2',transform:{type:'reverse'}})
  expect(scoreScale(c.definition,[{itemCode:'Q1',responseValue:5},{itemCode:'Q2',responseValue:1}]).scores.map(s=>({key:s.key,value:s.value}))).toEqual([{key:'total',value:15},{key:'dimension',value:5}])
  expect(d.changedParts.PARAMETERS?.payload).toMatchObject({references:[{entries:[{statistics:{thresholds:[{key:'low'},{key:'high'}]}}]}]})
  expect(d.changedParts.REPORT?.payload).toMatchObject({interpretations:expect.arrayContaining([expect.objectContaining({scoreKey:'total',source:{type:'reference_context'},bands:[expect.objectContaining({key:'low'}),expect.objectContaining({key:'high'})]})])})
 })
 it('builds an ordinary C-only definition with explicitly unconfigured P/R',async()=>{
  const b=await ordinaryWorkbook()
  for(const name of ['参数','报告'])b.removeWorksheet(b.getWorksheet(name)!.id)
  for(const column of ['parametersMode','reportMode'])cell(b,'基本信息',2,column).value='NONE'
  const result=await parse(b);expect(result.entries[0].issues).toEqual([])
  expect(result.entries[0].draft?.changedParts.CONTENT?.definition.items).toHaveLength(2)
  expect(result.entries[0].draft?.changedParts.PARAMETERS?.payload).toBeNull();expect(result.entries[0].draft?.changedParts.REPORT?.payload).toBeNull()
 })
 it('keeps ordinary P/R-only rows independent of a missing C',async()=>{
  const b=await ordinaryWorkbook()
  for(const name of ['题目','选项','计分'])b.removeWorksheet(b.getWorksheet(name)!.id)
  for(const column of ['contentVersion',...ordinaryColumns.基本信息])cell(b,'基本信息',2,column).value=null
  const result=await parse(b);expect(result.entries[0].issues).toEqual([])
  expect(Object.keys(result.entries[0].draft!.changedParts)).toEqual(['PARAMETERS','REPORT'])
 })
 it('locates conflicts between JSON and ordinary columns without choosing a winner',async()=>{
  const b=await ordinaryWorkbook();cell(b,'题目',2,'itemJson').value='{}'
  const result=await parse(b);expect(result.entries[0].draft).toBeNull()
  expect(result.entries[0].issues).toContainEqual(expect.objectContaining({sheet:'题目',row:2,path:'题号',message:expect.stringContaining('不能同时供值')}))
  const basic=await ordinaryWorkbook();cell(basic,'基本信息',2,'metadataJson').value='{}'
  expect((await parse(basic)).entries[0].issues).toContainEqual(expect.objectContaining({sheet:'基本信息',row:2,path:'名称',message:expect.stringContaining('不能同时供值')}))
  const mixed=await workbook();cell(mixed,'题目',3,'toolKey').value='synthetic_import_example';cell(mixed,'题目',3,'题号').value='Q2'
  expect((await parse(mixed)).entries[0].issues).toContainEqual(expect.objectContaining({sheet:'题目',row:3,path:'itemJson',message:expect.stringContaining('不能混用')}))
 })
 it('requires rows when ordinary P is PROVIDED and accepts old JSON-only headers',async()=>{
  const b=await ordinaryWorkbook();b.removeWorksheet(b.getWorksheet('参数')!.id)
  expect((await parse(b)).entries[0].issues).toContainEqual(expect.objectContaining({sheet:'参数',path:'指标',message:expect.stringContaining('需要参数行')}))
  const old=await workbook()
  for(const sheet of old.worksheets)if(sheet.name in legacyColumns){const count=legacyColumns[sheet.name as ComponentSheet].length;sheet.spliceColumns(count+1,sheet.columnCount-count)}
  expect((await parse(old)).entries[0].issues).toEqual([])
 })
 it.each([
  ['计分',3,'聚合','平均','聚合'],
  ['计分',5,'反向','否','反向'],
  ['参数',3,'下限含','不是数字','下限含'],
 ])('locates ordinary group or numeric conflicts at %s row %s',async(sheet,row,column,value,path)=>{
  const b=await ordinaryWorkbook();cell(b,sheet,row,column).value=value
  const result=await parse(b);expect(result.entries[0].draft).toBeNull()
  expect(result.entries[0].issues).toContainEqual(expect.objectContaining({sheet,row,path}))
 })
 it('round trips full definitions and installed declarative report chart structures',async()=>{
  const b=await workbook(),sheet=b.getWorksheet('报告')!,definition=JSON.parse(String(sheet.getCell('B2').value))
  sheet.getCell('B2').value=JSON.stringify({definition,template:{title:'合成报告',blocks:[{type:'CHART',metricKeys:['total'],style:'BAR'},{type:'TEXT',text:'仅合成数据'}],limitations:[]}})
  const result=await parse(b)
  expect(result.entries[0].issues).toEqual([])
  expect(result.entries[0].draft?.changedParts.CONTENT?.definition.items[0].content).toBe('这是一道合成示例题。')
  expect(result.entries[0].draft?.changedParts.REPORT?.payload).toMatchObject({template:{blocks:[{type:'CHART'},{type:'TEXT'}]}})
 })
 it('stores an R-only draft with no implicit C or P deletion',async()=>{
  const b=await workbook(),basic=b.getWorksheet('基本信息')!
  for(const c of ['E2','F2','H2','J2','K2'])basic.getCell(c).value=null
  for(const name of ['题目','选项','计分'])b.removeWorksheet(b.getWorksheet(name)!.id)
  const r=await parse(b)
  expect(r.entries[0].issues).toEqual([])
  expect(Object.keys(r.entries[0].draft!.changedParts)).toEqual(['REPORT'])
  expect(r.entries[0].draft!.baseCombination).toBeNull()
 })
 it('distinguishes absent P/R from explicit NONE in a C-only import',async()=>{
  const b=await workbook(),basic=b.getWorksheet('基本信息')!
  b.removeWorksheet(b.getWorksheet('报告')!.id)
  basic.getCell('I2').value='NONE';basic.getCell('G2').value='none-v1'
  const explicit=await parse(b)
  expect(explicit.entries[0].draft!.changedParts.REPORT?.payload).toBeNull()
  basic.getCell('I2').value=null;basic.getCell('G2').value=null;basic.getCell('H2').value=null
  const absent=await parse(b)
  expect(absent.entries[0].draft!.changedParts.REPORT).toBeUndefined()
  expect(absent.entries[0].draft!.changedParts.PARAMETERS).toBeUndefined()
  expect(absent.digest).not.toEqual(explicit.digest)
 })
 it('isolates a malformed second instrument and locates the original sheet and row',async()=>{
  const b=await workbook(),base=b.getWorksheet('基本信息')!
  base.addRow(['bad_example','合成错误','','','','','1.0.0','','PROVIDED','',''])
  b.getWorksheet('报告')!.addRow(['bad_example','{broken'])
  const r=await parse(b)
  expect(r.entries[0].draft).not.toBeNull()
  expect(r.entries[1].draft).toBeNull()
  expect(r.entries[1].issues).toContainEqual(expect.objectContaining({sheet:'报告',row:3,path:'reportJson',message:'JSON 格式错误'}))
 })
 it('never evaluates Excel formula cells',async()=>{
  const b=await workbook();b.getWorksheet('题目')!.getCell('B2').value={formula:'1+1',result:2}
  const r=await parse(b)
  expect(r.entries[0].draft).toBeNull()
  expect(r.entries[0].issues).toContainEqual(expect.objectContaining({sheet:'题目',row:2,message:expect.stringContaining('不接受公式')}))
 })
 it('reports unsupported fields rather than silently losing them',async()=>{
  const b=await workbook(),s=b.getWorksheet('题目')!,item=JSON.parse(String(s.getCell('B2').value))
  item.executableScript='ignored-but-rejected';s.getCell('B2').value=JSON.stringify(item)
  const r=await parse(b)
  expect(r.entries[0].draft).toBeNull()
  expect(r.entries[0].issues.some(i=>i.path.endsWith('executableScript'))).toBe(true)
 })
 it('requires an exact base identity and rejects contradictory NONE input',async()=>{
  const b=await workbook();b.getWorksheet('基本信息')!.getCell('C2').value='00000000-0000-4000-8000-000000000001'
  b.getWorksheet('基本信息')!.getCell('I2').value='NONE'
  const r=await parse(b)
  expect(r.entries[0].draft).toBeNull()
  expect(r.entries[0].issues.some(i=>i.message.includes('NONE'))).toBe(true)
  expect(r.entries[0].issues.some(i=>i.path.includes('combinationHash'))).toBe(true)
 })
 it('assembles long JSON fragments without truncating supported report fields',async()=>{
  const b=await workbook(),s=b.getWorksheet('报告')!,definition=JSON.parse(String(s.getCell('B2').value))
  definition.interpretations[0].summary='合成文字'.repeat(10000)
  const text=JSON.stringify(definition);s.getCell('B2').value='@json:long-report'
  const fragments=b.getWorksheet('结构片段')!
  for(let i=0;i<text.length;i+=20000)fragments.addRow(['synthetic_import_example','long-report',Math.floor(i/20000)+1,text.slice(i,i+20000)])
  const r=await parse(b)
  expect(r.entries[0].issues).toEqual([])
  expect(r.entries[0].draft?.changedParts.REPORT?.payload).toMatchObject({interpretations:[{summary:definition.interpretations[0].summary}]})
 })
 it('retains a valid instrument when an unrelated sheet row has an unknown toolKey',async()=>{
  const b=await workbook();b.getWorksheet('报告')!.addRow(['unknown_key','{}'])
  const r=await parse(b)
  expect(r.entries[0].draft).not.toBeNull()
  expect(r.entries[1]).toMatchObject({toolKey:'unknown_key',draft:null,issues:[{sheet:'报告',row:3,path:'toolKey'}]})
 })
 it('reports a misplaced report field rather than overwriting it with a C placeholder',async()=>{
  const b=await workbook(),cell=b.getWorksheet('基本信息')!.getCell('J2'),definition=JSON.parse(String(cell.value))
  definition.report={reportVersion:'must-not-be-lost'};cell.value=JSON.stringify(definition)
  const r=await parse(b)
  expect(r.entries[0].draft).toBeNull()
  expect(r.entries[0].issues).toContainEqual(expect.objectContaining({path:'definitionJson.report',message:expect.stringContaining('不能重复填写并覆盖')}))
 })
})
