import {describe,it,expect,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {ids,tid,trainingSourceHarness} from './training-standard-source.fixture'
import {standardCombinationHash,standardAxisHashes} from '../../modules/measurement-content/standard-combination'
import {sealTrainingStandardUseConfiguration} from '../../modules/assessment-authorization/standard-configuration-binding'

async function fixture(count:number,change?:(rows:any[])=>void){
 const f=trainingSourceHarness(),parts=f.h.row.snapshot.parts,rows=Array.from({length:count},(_,i)=>{
  const toolKey='fixture_'+String(i).padStart(4,'0'),id=tid(2000+i),useId=tid(4000+i),combinationHash=standardCombinationHash(toolKey,standardAxisHashes(parts))
  return {id,combination_hash:combinationHash,title:'合成工具 '+i,tool_key:toolKey,instrument_version:'1.0.0',content_version:parts.CONTENT.version,parameters_version:parts.PARAMETERS.version,report_version:parts.REPORT.version,
   content_hash:parts.CONTENT.hash,parameters_hash:parts.PARAMETERS.hash,report_hash:parts.REPORT.hash,scale_id:ids.scale,measurement_release:f.h.row.measurement_release,use_id:useId,use_version:1,name:'用途 '+i,evidence:[] as any[],denied:false}
 });change?.(rows)
 for(const row of rows){
  const selectedParts={CONTENT:{...parts.CONTENT,version:row.content_version,hash:row.content_hash},PARAMETERS:{...parts.PARAMETERS,version:row.parameters_version,hash:row.parameters_hash},REPORT:{...parts.REPORT,version:row.report_version,hash:row.report_hash}}
  row.combination_hash=standardCombinationHash(row.tool_key,standardAxisHashes(selectedParts))
  const source={row:{id:row.id,combination_hash:row.combination_hash,snapshot:{toolKey:row.tool_key,instrumentVersion:'1.0.0',parts:selectedParts}},measurement:row.measurement_release}
  const selected=sealTrainingStandardUseConfiguration(source,ids.owner,{useGrantId:row.use_id,useGrantVersion:1,issuerId:ids.issuer,authorityGrantId:ids.root},1)
  row.evidence=[{selected,actor_id:ids.issuer,configurationName:row.name}]
 }
 rows.sort((a,b)=>a.tool_key.localeCompare(b.tool_key)||a.id.localeCompare(b.id)||a.use_id.localeCompare(b.use_id))
 const original=f.db.$queryRaw.getMockImplementation()!
 f.db.$queryRaw.mockImplementation(async(query:any,...args:any[])=>{
  const sql=(query.sql??query.join('?')).replace(/\s+/g,' ').trim(),values=Array.isArray(query)?args:query.values
  if(sql.includes('CROSS JOIN LATERAL')){
   const found=[]
   for(let i=0;i<values.length-1;i+=3){const [useId,key,name]=values.slice(i,i+3);found.push(...rows.filter(r=>r.tool_key===key&&r.use_id!==useId&&(name===null||r.name===name)).slice(0,101).map(r=>({...r,choice_use_id:useId})))}
   return found
  }
  if(sql.includes('FROM material_grants g JOIN survey_standard_releases')){
   let found=rows
   if(sql.includes('(r.tool_key,r.id,g.id)>')){const offset=sql.includes('LIMIT 1')&&!sql.includes('LIMIT 100')&&!sql.includes('LIMIT 101')?values.length-3:1;const cursor=values.slice(offset,offset+3);found=found.filter(r=>[r.tool_key,r.id,r.use_id].join('|')>cursor.join('|'))}
   return found.slice(0,/LIMIT 101\b/.test(sql)?101:/LIMIT 1\b/.test(sql)?1:100)
  }
  if(sql.includes('FROM material_grants WHERE teacher_id=')){
   const row=rows.find(r=>r.id===values[1]&&(!values[2]||r.use_id===values[2]));return row?[{...f.h.use,id:row.use_id,resource_id:row.id,standard_combination_hash:row.combination_hash}]:[]
  }
  if(sql.includes('FROM material_grants WHERE id=')){const row=rows.find(r=>r.use_id===values[0]);return row?[{...f.h.use,id:row.use_id,resource_id:row.id,standard_combination_hash:row.combination_hash}]:[]}
  if(sql.includes('FROM survey_tool_policies')){const row=rows.find(r=>values.includes('standard-release:'+r.id));return row?[{decision:row.denied?'RETURNED':'APPROVED',paused:false,version:1,reason:'Synthetic current policy'}]:[]}
  return original(query,...args)
 })
 const {prisma}=await import('../../config/database'),client=prisma as any,previous=client.$transaction;client.$transaction=async(fn:any)=>fn(f.db)
 return {f,rows,close:()=>{client.$transaction=previous}}
}

describe('Training exact configuration picker capacity',()=>{
 it.each([100,101])('retains the first 100 qualified choices when there are %i distinct authorized configurations',async count=>{
  const f=await fixture(count)
  try{const {listTrainingStandardCombinationChoices}=await import('../../modules/measurement-content/standard-combination-use');const choices=await listTrainingStandardCombinationChoices(ids.owner);expect(choices).toHaveLength(100);expect(choices.every(c=>c.available)).toBe(true)}finally{f.close()}
 })
 it('exposes page two without replacing page-one bindings or scanning an unbounded stale prefix',async()=>{
  const f=await fixture(101)
  try{const {listTrainingStandardCombinationChoicePage:page}=await import('../../modules/measurement-content/standard-combination-use');const first=await page(ids.owner),before=JSON.stringify(first.list);expect(first.list).toHaveLength(100);expect(first.nextCursor).toEqual({afterToolKey:f.rows[99].tool_key,afterReleaseId:f.rows[99].id,afterUseId:f.rows[99].use_id});const next=await page(ids.owner,first.nextCursor!);expect(next.list).toHaveLength(1);expect(next.list[0].useGrantId).toBe(f.rows[100].use_id);expect(next.nextCursor).toBeNull();expect(JSON.stringify(first.list)).toBe(before);expect(f.f.h.writes).toEqual([])}finally{f.close()}
 })
 it('returns a cursor after 100 inadmissible rows so the valid 101st choice is still reachable',async()=>{
  const f=await fixture(101,rows=>rows.slice(0,100).forEach(r=>{r.denied=true}))
  try{const {listTrainingStandardCombinationChoicePage:page}=await import('../../modules/measurement-content/standard-combination-use');const first=await page(ids.owner);expect(first.list).toEqual([]);expect(first.nextCursor).not.toBeNull();const next=await page(ids.owner,first.nextCursor!);expect(next.list).toHaveLength(1);expect(next.list[0].available).toBe(true);expect(next.nextCursor).toBeNull()}finally{f.close()}
 })
 const sameTool=(rows:any[])=>rows.forEach((r,i)=>{r.tool_key='one_tool';r.report_hash=(i+1).toString(16).padStart(64,'0');r.report_version='fixture-r-'+i})
 it('keeps distinct business names usable across pages of the same tool',async()=>{
  const f=await fixture(101,sameTool)
  try{const {listTrainingStandardCombinationChoicePage:page}=await import('../../modules/measurement-content/standard-combination-use');const first=await page(ids.owner),next=await page(ids.owner,first.nextCursor!);expect(first.list.every(c=>c.available)).toBe(true);expect(next.list[0].available).toBe(true)}finally{f.close()}
 })
 it('blocks both same-name configurations even when their exact R bindings occur on different pages',async()=>{
  const f=await fixture(101,rows=>{sameTool(rows);rows[100].name=rows[0].name})
  try{const {listTrainingStandardCombinationChoicePage:page}=await import('../../modules/measurement-content/standard-combination-use');const first=await page(ids.owner),next=await page(ids.owner,first.nextCursor!);expect(first.list[0]).toMatchObject({available:false,unavailableReason:expect.stringContaining('同名')});expect(first.list.slice(1).every(c=>c.available)).toBe(true);expect(next.list[0].available).toBe(false)}finally{f.close()}
 })
 it('does not treat an unchecked same-name raw candidate with withdrawn entry approval as a current peer',async()=>{
  const f=await fixture(101,rows=>{sameTool(rows);rows[100].name=rows[0].name;rows[100].denied=true})
  try{const {listTrainingStandardCombinationChoicePage:page}=await import('../../modules/measurement-content/standard-combination-use');const first=await page(ids.owner);expect(first.list.every(c=>c.available)).toBe(true);expect((await page(ids.owner,first.nextCursor!)).list).toEqual([])}finally{f.close()}
 })
 it('rejects partial cursors before any database query',async()=>{
  const {listTrainingStandardCombinationChoicePage:page}=await import('../../modules/measurement-content/standard-combination-use');await expect(page(ids.owner,{afterToolKey:'one_tool'})).rejects.toThrow('配置分页游标不完整')
 })
 it('bounds same-name verification and limits an indeterminate result to that naming group',async()=>{
  const f=await fixture(103,rows=>{sameTool(rows);rows.forEach((r,i)=>{r.name='重复用途';r.denied=i>0&&i<102});rows[102].tool_key='a_healthy';rows[102].name='独立工具用途'})
  try{const {listTrainingStandardCombinationChoicePage:page}=await import('../../modules/measurement-content/standard-combination-use');const first=await page(ids.owner);expect(first.list).toHaveLength(2);expect(first.list.find(c=>c.toolKey==='a_healthy')?.available).toBe(true);expect(first.list.find(c=>c.toolKey==='one_tool')).toMatchObject({available:false,unavailableReason:expect.stringContaining('同名授权候选较多')});expect(f.f.db.$queryRaw.mock.calls.filter(([query]:any[])=>query.sql.includes('FROM survey_tool_policies')).length).toBeLessThanOrEqual(200)}finally{f.close()}
 })
})
