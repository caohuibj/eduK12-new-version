import ExcelJS from 'exceljs'
import {validateBoundedXlsxContainer} from '../../utils/bounded-xlsx'
export const rosterKinds=['GRADE','CLASS','STUDENT','STAFF','ASSIGNMENT'] as const
export type RosterKind=typeof rosterKinds[number]
const templates:Record<RosterKind,string[][]>={
 GRADE:[['年级'],['一年级'],['二年级']], CLASS:[['年级','班级'],['一年级','一班'],['一年级','二班']],
 STUDENT:[['学号','年级','班级','姓名','已有校园用户名'],['0001','一年级','一班','',''],['0002','一年级','一班','示例学生','']],
 STAFF:[['工号','姓名','身份','已有校园用户名'],['T001','示例教师','普通教师',''],['T002','示例心理教师','心理教师','']],
 ASSIGNMENT:[['工号','年级','班级','任教角色'],['T001','一年级','一班','班主任'],['T001','一年级','二班','任课教师']],
}
export async function createRosterWorkbook(kind:RosterKind){
 const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('名单',{views:[{state:'frozen',ySplit:1}]})
 for(const values of templates[kind])sheet.addRow(values)
 for(let i=1;i<=templates[kind][0].length;i++){sheet.getColumn(i).numFmt='@';sheet.getColumn(i).width=24}
 sheet.getRow(1).font={bold:true}
 return Buffer.from(await wb.xlsx.writeBuffer())
}
export type RosterSheet={name:string;rows:{line:number;cells:string[];numeric:number[]}[]}
/** Bounded inert OOXML, decoded in memory only; no upload retention. */
export async function readRosterWorkbook(bytes:Buffer):Promise<{sheets:RosterSheet[]}>{
 if(bytes.length>64000)throw Error('文件超过 64 KB，请拆分后导入。')
 const files=validateBoundedXlsxContainer(bytes,{bytes:64000,entries:100,part:512*1024,total:2*1024*1024})
 for(const [name,value] of files)if(/\.xml$|\.rels$/.test(name)&&/<!DOCTYPE|<!ENTITY/i.test(value.toString('utf8')))throw Error('Excel 文件不能包含实体或外部定义。')
 const wb=new ExcelJS.Workbook()
 try{await wb.xlsx.load(Uint8Array.from(bytes).buffer)}catch{throw Error('无法读取此 Excel 文件，请另存为普通 .xlsx 文件。')}
 if(!wb.worksheets.length||wb.worksheets.length>5)throw Error('每份文件需要 1–5 个工作表，请分开导入。')
 const sheets:RosterSheet[]=[]
 for(const sheet of wb.worksheets){
  if(sheet.state!=='visible')throw Error('文件包含隐藏工作表，请移除后重选。')
  if(sheet.rowCount>1000||sheet.columnCount>20)throw Error('工作表范围过大；每批最多 100 条、20 列。')
  const rows:RosterSheet['rows']=[]
  for(let row=1;row<=sheet.rowCount;row++){
   const cells:string[]=[],numeric:number[]=[]
   for(let col=1;col<=sheet.columnCount;col++){
    const cell=sheet.getCell(row,col),value=cell.value
    if(value===null||value===undefined)cells.push('')
    else if(typeof value==='string')cells.push(value.trim())
    else if(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER){cells.push(String(value));numeric.push(col-1)}
    else throw Error(`${sheet.name}!${cell.address} 只接受文本或普通数值；请移除公式、日期、链接或特殊单元格。`)
    if(cells[col-1].length>1000||cells[col-1].includes('\uFFFD'))throw Error(`${sheet.name}!${cell.address} 内容过长或编码无效。`)
   }
   if(cells.some(Boolean))rows.push({line:row,cells,numeric})
  }
  if(rows.length>101)throw Error(`${sheet.name} 每批最多 100 行名单，请拆分后导入。`)
  if(rows.length)sheets.push({name:sheet.name,rows})
 }
 if(!sheets.length)throw Error('文件没有可读取的名单。')
 if(Buffer.byteLength(JSON.stringify(sheets),'utf8')>128000)throw Error('工作表内容过大，请分开导入。')
 return {sheets}
}
