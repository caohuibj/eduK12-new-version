import {afterAll,afterEach,describe,expect,it,vi} from 'vitest'
process.env.DATA_ENCRYPTION_KEY||='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY||='b'.repeat(64)
import {prisma} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {persistGovernedPackageReports,readGovernedPackageReports} from '../../modules/survey/governed-package.reports'
import {PACKAGE_REPORT_MAX_CIPHER_BYTES} from '../../modules/survey/governed-package.budget'
vi.mock('../../modules/survey/builder.service',()=>({authorizedProject:vi.fn(async()=>({}))}))
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()})
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await prisma.$disconnect()})
function reader(sizes:Array<{id:string;bytes:number;created_at?:Date;budget_version?:number|null}>,rows:unknown[]=[]){
 const tx={surveyWaveFinal:{findFirst:vi.fn(async()=>({resultsHash:'final-hash'}))},$queryRaw:vi.fn().mockResolvedValueOnce(sizes).mockResolvedValueOnce(rows)}
 vi.spyOn(prisma,'$transaction').mockImplementation(async run=>(run as (tx:unknown)=>unknown)(tx))
 return {tx,read:()=>readGovernedPackageReports('owner',{projectId:'project',waveId:'wave',finalId:'final'})}
}
describe('bounded stored package report reads',()=>{
 it('writes an explicit budget version with a hashed format-v2 artifact and reads it independently of date',async()=>{
  const tx={$executeRaw:vi.fn()},p={title:'Synthetic',hash:'a'.repeat(64),report:{version:'v1',title:'Report',introduction:'',disclaimer:'',blocks:[{type:'TEXT',text:'Synthetic'}]},slots:[],importId:'import',toolId:'tool'}
  await persistGovernedPackageReports(tx as never,{projectId:'project',waveId:'wave',finalId:'final',sourceFinalHash:'final-hash',snapshot:{governedPackages:[p],units:[]} as never,calculated:{units:[]} as never})
  const [sql,...values]=tx.$executeRaw.mock.calls[0]
  expect(sql.join('')).toContain('report_cipher,budget_version')
  expect(values[10]).toBe(1)
  const row={id:values[0],tool_id:'tool',import_id:'import',source_final_hash:'final-hash',report_hash:values[8],report_cipher:values[9],budget_version:1,created_at:new Date('2020-01-01')}
  const result=await reader([{id:row.id,bytes:row.report_cipher.length,budget_version:1}],[row]).read()
  expect(result.list[0].artifact).toMatchObject({schemaVersion:2,budgetVersion:1})
 })
 it('rejects total ciphertext before fetching any report payload',async()=>{
  const {tx,read}=reader([{id:'one',bytes:PACKAGE_REPORT_MAX_CIPHER_BYTES+1,budget_version:1,created_at:new Date()}])
  await expect(read()).rejects.toThrow('读取密文合计预算超限');expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
 })
 it('keeps pre-budget artifacts readable regardless of their stored size',async()=>{
  const value={text:'Historical oversized'},row={id:'one',tool_id:'tool',import_id:'one',source_final_hash:'final-hash',report_hash:canonicalHash(value),report_cipher:encryptUnifiedRuntimePayload(value),budget_version:null,created_at:new Date('2099-01-01T00:00:00Z')}
  const {read}=reader([{id:'one',bytes:PACKAGE_REPORT_MAX_CIPHER_BYTES+1,budget_version:null,created_at:row.created_at}],[row])
  await expect(read()).resolves.toMatchObject({list:[{id:'one'}],semantics:'SAVED_AT_FINAL_NO_RESCORING'})
 })
 it('rejects unknown budget versions and inconsistent versioned plaintext',async()=>{
  await expect(reader([{id:'one',bytes:10,budget_version:2}]).read()).rejects.toThrow('VERSION_UNSUPPORTED')
  const value={schemaVersion:1,text:'Legacy'},row={id:'one',tool_id:'tool',import_id:'one',source_final_hash:'final-hash',report_hash:canonicalHash(value),report_cipher:encryptUnifiedRuntimePayload(value),budget_version:1,created_at:new Date('2020-01-01')}
  await expect(reader([{id:'one',bytes:10,budget_version:1}],[row]).read()).rejects.toThrow('格式与预算版本不一致')
 })
 it('retains hash integrity for oversized unversioned history without any date cutoff',async()=>{
  const value={text:'Legacy'},row={id:'one',tool_id:'tool',import_id:'one',source_final_hash:'final-hash',report_hash:'wrong-hash',report_cipher:encryptUnifiedRuntimePayload(value),budget_version:null,created_at:new Date('2099-01-01')}
  await expect(reader([{id:'one',bytes:PACKAGE_REPORT_MAX_CIPHER_BYTES+1,budget_version:null}],[row]).read()).rejects.toThrow('摘要与原答卷不一致')
 })
 it('refuses overflow row count rather than silently taking the first 30',async()=>{
  const {tx,read}=reader(Array.from({length:31},(_,i)=>({id:String(i),bytes:10,created_at:new Date()})))
  await expect(read()).rejects.toThrow('数量超出');expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
 })
 it('also bounds decoded aggregate for small compressed ciphertext',async()=>{
  vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','true')
  const value={schemaVersion:2,budgetVersion:1,text:'x'.repeat(2_010_000)},cipher=encryptUnifiedRuntimePayload(value)
  const rows=['one','two'].map(id=>({id,tool_id:'tool',import_id:id,source_final_hash:'final-hash',report_hash:canonicalHash(value),report_cipher:cipher,budget_version:1,created_at:new Date()}))
  const {read}=reader(rows.map(r=>({id:r.id,bytes:Buffer.byteLength(r.report_cipher),budget_version:r.budget_version,created_at:r.created_at})),rows)
  await expect(read()).rejects.toThrow('读取正文合计预算超限')
 })
 it('retains source FINAL and saved report hash validation within the budget',async()=>{
  const value={text:'Synthetic'},row={id:'one',tool_id:'tool',import_id:'one',source_final_hash:'wrong-final',report_hash:canonicalHash(value),report_cipher:encryptUnifiedRuntimePayload(value),created_at:new Date()}
  await expect(reader([{id:row.id,bytes:row.report_cipher.length,created_at:new Date()}],[row]).read()).rejects.toThrow('摘要与原答卷不一致')
 })
})
