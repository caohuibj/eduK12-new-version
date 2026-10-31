import {describe,it,expect} from 'vitest'
import ExcelJS from 'exceljs'
import {componentTemplateWorkbook,parseComponentWorkbook} from '../../modules/scale/component-import/excel'

async function workbook(){const b=new ExcelJS.Workbook();await b.xlsx.load(await componentTemplateWorkbook() as never);return b}
const parse=async(b:ExcelJS.Workbook)=>parseComponentWorkbook(Buffer.from(await b.xlsx.writeBuffer()))
describe('administrator Excel component imports',()=>{
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
})
