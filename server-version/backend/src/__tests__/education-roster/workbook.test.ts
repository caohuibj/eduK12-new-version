import {describe,it,expect} from 'vitest'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import {createRosterWorkbook,readRosterWorkbook,rosterKinds} from '../../modules/education-roster/workbook'
async function bytes(rows:unknown[][],configure?:(wb:ExcelJS.Workbook)=>void){const wb=new ExcelJS.Workbook();wb.addWorksheet('名单').addRows(rows);configure?.(wb);return Buffer.from(await wb.xlsx.writeBuffer())}
describe('bounded shared education roster workbooks',()=>{
 it.each(rosterKinds)('reads the %s template and keeps identity text',async kind=>{
  const data=await createRosterWorkbook(kind),result=await readRosterWorkbook(data)
  expect(data.length).toBeLessThan(64000);expect(result.sheets).toHaveLength(1);expect(result.sheets[0].rows).toHaveLength(3)
  expect(result.sheets[0].rows[1].numeric).toEqual([])
  if(kind==='STUDENT')expect(result.sheets[0].rows[1].cells[0]).toBe('0001')
 })
 it('accepts 5000 textual identities only under the explicit job profile',async()=>{
  const file=await bytes([['学号','姓名'],...Array.from({length:5000},(_,i)=>[String(i).padStart(5,'0'),'合成'])])
  const result=await readRosterWorkbook(file,'job');expect(result.sheets[0].rows).toHaveLength(5001);expect(result.sheets[0].rows[1].cells[0]).toBe('00000')
  await expect(readRosterWorkbook(file)).rejects.toThrow();await expect(readRosterWorkbook(Buffer.alloc(1000001),'job')).rejects.toThrow('1 MB')
 },60000)
 it('rejects too many job rows and bounds actual decompression in the larger profile',async()=>{
  await expect(readRosterWorkbook(await bytes([['年级'],...Array.from({length:5001},(_,i)=>[String(i)])]),'job')).rejects.toThrow(/5000/)
  const zip=new JSZip();zip.file('xl/workbook.xml','x'.repeat(4*1024*1024+1));await expect(readRosterWorkbook(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),'job')).rejects.toThrow()
 },60000)
 it('marks numeric cells for explicit identifier rejection instead of inventing zeros',async()=>{
  const result=await readRosterWorkbook(await bytes([['学号','姓名'],[12,'合成']],wb=>{wb.worksheets[0].getCell('A2').numFmt='0000'}))
  expect(result.sheets[0].rows[1]).toMatchObject({cells:['12','合成'],numeric:[0]})
 })
 it.each([{formula:'1+1',result:2},new Date(),{text:'链接',hyperlink:'https://invalid.example'}])('rejects formulas, dates and linked cells',async value=>{
  await expect(readRosterWorkbook(await bytes([['工号','姓名'],['T1',value]]))).rejects.toThrow()
 })
 it('rejects hidden sheets, oversized inputs and excessive rows without truncating',async()=>{
  await expect(readRosterWorkbook(await bytes([['年级'],['一']],wb=>{wb.worksheets[0].state='hidden'}))).rejects.toThrow(/隐藏/)
  await expect(readRosterWorkbook(Buffer.alloc(64001))).rejects.toThrow(/64 KB/)
  await expect(readRosterWorkbook(await bytes([['年级'],...Array.from({length:101},(_,i)=>[String(i)])]))).rejects.toThrow(/100 行/)
 })
 it('bounds actual decompression even when ZIP declarations lie',async()=>{
  const zip=new JSZip();zip.file('xl/workbook.xml','x'.repeat(600000))
  const data=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})
  const dir=data.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));data.writeUInt32LE(10,dir+24)
  await expect(readRosterWorkbook(data)).rejects.toThrow()
 })
 it('rejects external relationships and entity declarations before ExcelJS',async()=>{
  for(const [name,value] of [['xl/_rels/workbook.xml.rels','<Relationship TargetMode="External" Target="https://invalid.example"/>'],['xl/workbook.xml','<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><workbook/>']]){
   const zip=new JSZip();zip.file('xl/workbook.xml','<workbook/>');zip.file(name,value)
   await expect(readRosterWorkbook(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}))).rejects.toThrow()
  }
 })
})
