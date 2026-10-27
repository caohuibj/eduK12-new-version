export type SchoolUnit={id:string;unitKind:'GRADE'|'CLASS';name:string;parentUnitId:string|null}
export type StructureImportKind=SchoolUnit['unitKind']
export type StructureImportRow={line:number;name:string;gradeName?:string;parentUnitId?:string;state:'add'|'skip'|'error';message:string}
export type StructureImportPreview={rows:StructureImportRow[];errors:string[]}
export const STRUCTURE_IMPORT_LIMIT=100

// Small, bounded CSV/TSV reader. Physical line numbers remain attached to records.
export function readSchoolDelimitedRecords(source:string):Array<{line:number;cells:string[]}>{
 const text=source.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n')
 const first=text.split('\n').find(line=>line.trim())??''
 const delimiter=first.includes('\t')?'\t':','
 const rows:Array<{line:number;cells:string[]}>=[]
 let cells:string[]=[],field='',quoted=false,closed=false,line=1,start=1
 const cell=()=>{cells.push(field.trim());field='';closed=false}
 const row=()=>{cell();if(cells.some(Boolean))rows.push({line:start,cells});cells=[];start=line+1}
 for(let i=0;i<text.length;i++){
  const ch=text[i]
  if(quoted){
   if(ch==='"'&&text[i+1]==='"'){field+='"';i++}
   else if(ch==='"'){quoted=false;closed=true}
   else{field+=ch;if(ch==='\n')line++}
  }else if(ch===delimiter)cell()
  else if(ch==='\n'){row();line++}
  else if(ch==='"'){
   if(field.trim()||closed)throw Error(`第 ${line} 行引号位置不正确。`)
   field='';quoted=true
  }else if(closed){if(ch.trim())throw Error(`第 ${line} 行引号后有多余内容。`)}
  else field+=ch
 }
 if(quoted)throw Error(`第 ${start} 行引号未闭合。`)
 row()
 return rows
}
const gradeHeaders=new Set(['年级','年级名称','grade','grade_name','name'])
const classHeaders=new Set(['班级','班级名称','class','class_name','name'])
export function previewSchoolStructure(text:string,kind:StructureImportKind,units:SchoolUnit[],defaultGradeId=''):StructureImportPreview{
 const errors:string[]=[],rows:StructureImportRow[]=[]
 if(new TextEncoder().encode(text).length>64000)return {rows,errors:['内容过长，请分批导入（每批最多 100 条）。']}
 let parsed:ReturnType<typeof readSchoolDelimitedRecords>
 try{parsed=readSchoolDelimitedRecords(text)}catch(error){return {rows,errors:[(error as Error).message]}}
 const first=parsed[0]?.cells.map(value=>value.toLowerCase())
 if(first&&(kind==='GRADE'?first.length===1&&gradeHeaders.has(first[0]):first.length===1&&classHeaders.has(first[0])||first.length===2&&gradeHeaders.has(first[0])&&classHeaders.has(first[1])))parsed.shift()
 if(!parsed.length)return {rows,errors:['请先填写要导入的名称。']}
 if(parsed.length>STRUCTURE_IMPORT_LIMIT)return {rows,errors:['每批最多 100 条，请拆分后重新预览。']}
 const seen=new Set<string>()
 for(const record of parsed){
  const {cells,line}=record
  let name=cells[0]??'',grade:SchoolUnit|undefined,message='待新增'
  if(kind==='GRADE'&&cells.length!==1||kind==='CLASS'&&(cells.length<1||cells.length>2))message='列数不正确；年级一列，班级可用“年级,班级”两列。'
  if(kind==='CLASS'){
   name=cells[cells.length-1]??''
   const matches=cells.length===2?units.filter(unit=>unit.unitKind==='GRADE'&&unit.name.trim()===cells[0]):units.filter(unit=>unit.unitKind==='GRADE'&&unit.id===defaultGradeId)
   grade=matches[0]
   if(matches.length!==1)message=matches.length>1?'存在同名年级，请改为单列班级并明确选择所属年级。':'找不到所属年级，请先导入年级或选择已有年级。'
  }
  if(!name||name.length>200||[...name].some(char=>char.charCodeAt(0)<32||char==='\uFFFD'))message='名称须为 1–200 个字符，不能包含换行或无法识别的字符。'
  const key=JSON.stringify([kind,grade?.id??'',name])
  if(seen.has(key))message='本批次存在重复名称，请删除重复行。'
  seen.add(key)
  const existing=units.filter(unit=>unit.unitKind===kind&&unit.name.trim()===name&&(kind==='GRADE'||unit.parentUnitId===grade?.id))
  if(existing.length>1)message='已有多个同名项，请先核对学校结构。'
  const state=message!=='待新增'?'error':existing.length===1?'skip':'add'
  rows.push({line,name,gradeName:grade?.name,parentUnitId:grade?.id,state,message:state==='skip'?'已存在，跳过':message})
 }
 return {rows,errors}
}
