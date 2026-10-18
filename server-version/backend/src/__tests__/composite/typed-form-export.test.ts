import {beforeEach,describe,expect,it,vi} from 'vitest'
const db=vi.hoisted(()=>({$queryRaw:vi.fn(),compositeAssessment:{findUnique:vi.fn()},compositeFormSection:{findMany:vi.fn()},compositeAssessmentAttempt:{count:vi.fn()},assessmentUnitSnapshot:{findMany:vi.fn()}}))
vi.mock('../../config/database',()=>({prisma:db}))
import {typedFormExportColumns} from '../../modules/composite/typed-form-export'
import {getExportData,exportToCSV,saveExportFiles} from '../../modules/composite/composite-export.service'
import {mapCompositeSection} from '../../modules/assessment-runtime/form-section-definition'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {formSectionSlotKey} from '../../modules/assessment-runtime/slot-set'
import {wideExportPackage} from '../../services/wideExportPackage'
const options=[{optionKey:'b',label:'乙'},{optionKey:'a',label:'甲'}]
const item=(type:string,extra:Record<string,unknown>={})=>({id:'item',type:'FORM',formType:({SINGLE:'single_choice',MULTIPLE:'multiple_choice',SHORT_TEXT:'text_input'} as Record<string,string>)[type]??type.toLowerCase(),formLabel:'题目',required:false,formOptions:['SINGLE','MULTIPLE'].includes(type)?((extra.options??[]) as typeof options).map(o=>({value:o.optionKey,label:o.label})):null,position:0,contextKey:null,placeholder:null,formSectionPosition:0,formDefinition:{itemKey:'stable',type,prompt:'题目',required:false,options:[],rows:[],...extra}})
const project=(type:string,value:any,extra:Record<string,unknown>={},metadata?:any)=>{
 const columns=typedFormExportColumns(item(type,extra),0,'full')
 return {fields:columns.map(c=>c.field),row:Object.fromEntries(columns.map(c=>[c.field.name,c.read(value,metadata)]))}
}
beforeEach(()=>{vi.clearAllMocks();process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);db.$queryRaw.mockResolvedValue([]);db.compositeAssessmentAttempt.count.mockResolvedValue(2)})
describe('C07 typed CSV and dictionary independent values',()=>{
 it.each([0,-2.5,-12.34567891,1e308,null])('preserves number %s without string conversion',value=>{
  const {fields,row}=project('NUMBER',value);expect(row).toEqual({F001_value:value,F001_state:null});expect(fields[0].type).toBe('numeric')
 })
 it('preserves array order and explicitly labels JSON encoding',()=>{
  for(const type of ['MULTIPLE','RANK_ORDER']) {
   const {fields,row}=project(type,['b','a'],{options});expect(row.F001_value).toBe('["b","a"]');expect(JSON.parse(row.F001_value as string)).toEqual(['b','a']);expect(fields[0].formSource?.encoding).toBe('JSON_STRING_ARRAY')
  }
 })
 it('expands frozen matrix rows and never turns missing or refusal into 0',()=>{
  const {fields,row}=project('MATRIX_MULTIPLE',{r1:['b','a']},{options,rows:[{rowKey:'r1',label:'行甲'},{rowKey:'r2',label:'行乙'},{rowKey:'r3',label:'行丙'}]},
   {state:'ANSWERED',rowStates:{r1:'ANSWERED',r2:'REFUSED',r3:'SHOWN_MISSING'}})
  expect(row).toEqual({F001_value:'{"r1":["b","a"]}',F001_state:'ANSWERED',F001_R001_value:'["b","a"]',F001_R001_state:'ANSWERED',F001_R002_value:null,F001_R002_state:'REFUSED',F001_R003_value:null,F001_R003_state:'SHOWN_MISSING'})
  expect(fields[2].formSource?.rowKey).toBe('r1');expect(fields[2].label).toContain('行甲')
 })
 it('uses true numeric constant sum columns including zero and independent frozen option order',()=>{
  const {fields,row}=project('CONSTANT_SUM',{a:0,b:100},{options,total:100})
  expect(row).toEqual({F001_value:'{"a":0,"b":100}',F001_state:null,F001_O001_value:100,F001_O002_value:0})
  expect(fields.slice(2).map(f=>f.type)).toEqual(['numeric','numeric']);expect(fields[2].formSource?.optionKey).toBe('b')
 })
 it.each(['SHORT_TEXT','LONG_TEXT'])('excludes new %s from summary and keeps full',type=>{
  expect(typedFormExportColumns(item(type),0,'summary')).toEqual([])
  expect(typedFormExportColumns(item(type),0,'full')).toHaveLength(2)
 })
 it('distinguishes null and empty matrix with absent V2 status',()=>{
  const extra={options,rows:[{rowKey:'r1',label:'一'}]}
  expect(project('MATRIX',null,extra).row.F001_value).toBeNull();expect(project('MATRIX',{},extra).row.F001_value).toBe('{}')
  expect(project('MATRIX',{},extra).fields[1].missingMeaning).toContain('NOT_RECORDED')
 })
 it.each(['=SUM(1,2)','+cmd','-cmd','@cmd',' \t=1','\u200B=1','\uFEFF@x',"'=1+1",'=1+1'])('protects only typed formula text %s while preserving canonical data',value=>{
  const {fields,row}=project('LONG_TEXT',value);const data={assessmentId:'id',assessmentName:'n',detail:'full' as const,trialCount:0,fields,rows:[row]}
  const csv=exportToCSV(data);expect(csv).toContain(JSON.stringify(value).replace(/"/g,'""'));expect(row.F001_value).toBe(JSON.stringify(value));expect(JSON.parse(row.F001_value as string)).toBe(value);expect(fields[0].formSource?.encoding).toBe('JSON_STRING')
 })
 it('retains legacy CSV bytes, negative numeric and exact escaped text',()=>{
  const data={assessmentId:'id',assessmentName:'n',detail:'full' as const,trialCount:0,fields:[...project('LONG_TEXT','').fields,...project('NUMBER',0).fields.map(f=>({...f,name:'N_'+f.name}))],rows:[{F001_value:JSON.stringify('中文, "字"\n尾 🐈'),F001_state:null,N_F001_value:-2.5,N_F001_state:null}]}
  expect(exportToCSV(data)).toBe('F001_value,F001_state,N_F001_value,N_F001_state\n'+ '"'+JSON.stringify('中文, "字"\n尾 🐈').replace(/"/g,'""')+'",,-2.5,')
  expect(exportToCSV({...data,fields:[{name:'old',label:'Old',type:'string'}],rows:[{old:'\u200B=1'}]})).toBe('old\n\u200B=1')
 })
 it('packages dictionary alongside the exact supplied authorized CSV without live reads',()=>{
  const {fields,row}=project('CONSTANT_SUM',{a:0,b:100},{options,total:100});const csv='independent csv'
  const zip=wideExportPackage(csv,fields,{resourceType:'COMPOSITE',resourceId:'id',detail:'full'})
  expect(zip.includes(Buffer.from('\uFEFF'+csv))).toBe(true)
  expect(zip.includes(Buffer.from('"encoding": "NUMBER"'))).toBe(true);expect(zip.includes(Buffer.from('"label": "乙"'))).toBe(true)
  expect(zip.includes(Buffer.from('EXCEL_APOSTROPHE_PREFIX'))).toBe(true);expect(db.compositeAssessment.findUnique).not.toHaveBeenCalled();expect(row.F001_O002_value).toBe(0)
 })
})
function fixture(){
 const definition=item('NUMBER'),section=mapCompositeSection({id:'section',title:'Form',position:0,items:[definition]})
 const attempts=[0,1].map((i)=>({id:'attempt-'+i,attemptEpoch:1,runtimeGeneration:'UNIFIED_V1',formAnswers:[{itemId:'item',value:'POISON SHADOW'}],scaleAssessments:[],cognitiveSessions:[]}))
 const snapshots=attempts.map((a,i)=>({compositeAttemptId:a.id,attemptEpoch:1,slotKey:formSectionSlotKey(section.id),terminalState:'COMPLETED',payloadKind:'COLLECTION_FACTS',unitType:'FORM_SECTION',sourceType:'COMPOSITE_FORM_SECTION',sourceDefinitionHash:canonicalHash(section),collectionFactsEncrypted:encryptUnifiedRuntimePayload({schemaVersion:2,sectionKey:'section',items:[{key:'item',label:'题目',value:i===0?0:null}]})}))
 const template={id:'parent',name:'名字',items:[definition],formSections:[{...section,items:[definition]}],attempts}
 db.compositeAssessment.findUnique.mockResolvedValue(template);db.compositeFormSection.findMany.mockResolvedValue(template.formSections);db.assessmentUnitSnapshot.findMany.mockResolvedValue(snapshots)
 return {template,snapshots}
}
describe('C07 canonical source and batch shape',()=>{
 it('loads snapshots once for multiple attempts and ignores String shadows',async()=>{
  fixture();const data=await getExportData('parent');expect(data.rows.map(r=>r.F001_value)).toEqual([0,null]);expect(db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1);expect(data.rows.some(r=>Object.values(r).includes('POISON SHADOW'))).toBe(false)
 })
 it.each(['epoch','hash','missing','unknown-version'])('fails closed on %s facts',async mode=>{
  const {snapshots}=fixture()
  if(mode==='epoch')snapshots[0].attemptEpoch=2
  if(mode==='hash')snapshots[0].sourceDefinitionHash='wrong'
  if(mode==='missing')snapshots.splice(0,1)
  if(mode==='unknown-version')snapshots[0].collectionFactsEncrypted=encryptUnifiedRuntimePayload({schemaVersion:4,sectionKey:'section',items:[]})
  await expect(getExportData('parent')).rejects.toThrow()
 })
 it('has identical frozen fields in empty and populated export',async()=>{
  const {template}=fixture();const populated=await getExportData('parent');template.attempts=[];const empty=await getExportData('parent');expect(empty.fields).toEqual(populated.fields);expect(empty.rows).toEqual([])
 })
 it('binds every mixed-section column to V3 even for a no-policy item',async()=>{
  const {template,snapshots}=fixture()
  const second={...item('NUMBER'),id:'item2',position:1,formSectionPosition:1,formPolicy:{version:3,requiredRefusal:'BLOCK_SUBMIT',hiddenRequired:'EXEMPT'},formDefinition:{...item('NUMBER').formDefinition,itemKey:'second'}}
  template.items.push(second);template.formSections[0].items.push(second)
  const section=mapCompositeSection(template.formSections[0])
  for(const snapshot of snapshots){const original=decryptUnifiedRuntimePayload<any>(snapshot.collectionFactsEncrypted);snapshot.sourceDefinitionHash=canonicalHash(section);snapshot.collectionFactsEncrypted=encryptUnifiedRuntimePayload({schemaVersion:3,sectionKey:'section',items:[{...original.items[0],state:original.items[0].value===null?'SHOWN_MISSING':'ANSWERED'},{key:'item2',label:'题目',value:2,state:'ANSWERED'}]})}
  const data=await getExportData('parent');expect(data.fields.find(f=>f.name==='F001_value')?.formSource?.factsSchemaVersion).toBe(3);expect(data.fields.find(f=>f.name==='F002_value')?.formSource?.factsSchemaVersion).toBe(3)
  template.attempts=[];expect((await getExportData('parent')).fields).toEqual(data.fields)
 })
 it('keeps canonical legacy multiple array boundaries in a typed section',async()=>{
  const {template,snapshots}=fixture()
  const legacy={...item('NUMBER'),id:'legacy',position:1,formSectionPosition:1,formType:'multiple_choice',formDefinition:null,formOptions:[{value:'a,b',label:'甲'},{value:'c',label:'乙'}]}
  template.items.push(legacy as any);template.formSections[0].items.push(legacy as any)
  const section=mapCompositeSection(template.formSections[0])
  for(const snapshot of snapshots){const original=decryptUnifiedRuntimePayload<any>(snapshot.collectionFactsEncrypted);snapshot.sourceDefinitionHash=canonicalHash(section);snapshot.collectionFactsEncrypted=encryptUnifiedRuntimePayload({...original,items:[...original.items,{key:'legacy',label:'题目',value:['a,b','c']}]})}
  const data=await getExportData('parent');expect(data.rows.map(row=>row.F002_value)).toEqual(['["a,b","c"]','["a,b","c"]'])
 })
 it('rejects typed SAV even when summary suppresses every free-text field',async()=>{
  await expect(saveExportFiles('id',{},'sav',{assessmentId:'id',assessmentName:'n',detail:'summary',fields:[],rows:[],trialCount:0,typedFormExportVersion:'training-form-export-v1'})).rejects.toMatchObject({statusCode:400})
 })
})
