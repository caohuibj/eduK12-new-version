import {afterAll,afterEach,describe,expect,it,vi} from 'vitest'
process.env.DATA_ENCRYPTION_KEY||='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY||='b'.repeat(64)
import {prisma} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {readGovernedPackageReports} from '../../modules/survey/governed-package.reports'
import {PACKAGE_REPORT_BUDGET_ENFORCED_FROM,PACKAGE_REPORT_MAX_CIPHER_BYTES} from '../../modules/survey/governed-package.budget'
vi.mock('../../modules/survey/builder.service',()=>({authorizedProject:vi.fn(async()=>({}))}))
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()})
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await prisma.$disconnect()})
function reader(sizes:Array<{id:string;bytes:number;created_at?:Date}>,rows:unknown[]=[]){
 const tx={surveyWaveFinal:{findFirst:vi.fn(async()=>({resultsHash:'final-hash'}))},$queryRaw:vi.fn().mockResolvedValueOnce(sizes).mockResolvedValueOnce(rows)}
 vi.spyOn(prisma,'$transaction').mockImplementation(async run=>(run as (tx:unknown)=>unknown)(tx))
 return {tx,read:()=>readGovernedPackageReports('owner',{projectId:'project',waveId:'wave',finalId:'final'})}
}
describe('bounded stored package report reads',()=>{
 it('rejects total ciphertext before fetching any report payload',async()=>{
  const {tx,read}=reader([{id:'one',bytes:PACKAGE_REPORT_MAX_CIPHER_BYTES+1,created_at:new Date()}])
  await expect(read()).rejects.toThrow('读取密文合计预算超限');expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
 })
 it('keeps pre-budget artifacts readable regardless of their stored size',async()=>{
  const value={text:'Historical oversized'},row={id:'one',tool_id:'tool',import_id:'one',source_final_hash:'final-hash',report_hash:canonicalHash(value),report_cipher:encryptUnifiedRuntimePayload(value),created_at:new Date(PACKAGE_REPORT_BUDGET_ENFORCED_FROM.getTime()-1)}
  const {read}=reader([{id:'one',bytes:PACKAGE_REPORT_MAX_CIPHER_BYTES+1,created_at:row.created_at}],[row])
  await expect(read()).resolves.toMatchObject({list:[{id:'one'}],semantics:'SAVED_AT_FINAL_NO_RESCORING'})
 })
 it('refuses overflow row count rather than silently taking the first 30',async()=>{
  const {tx,read}=reader(Array.from({length:31},(_,i)=>({id:String(i),bytes:10,created_at:new Date()})))
  await expect(read()).rejects.toThrow('数量超出');expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
 })
 it('also bounds decoded aggregate for small compressed ciphertext',async()=>{
  vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','true')
  const value={text:'x'.repeat(2_010_000)},cipher=encryptUnifiedRuntimePayload(value)
  const rows=['one','two'].map(id=>({id,tool_id:'tool',import_id:id,source_final_hash:'final-hash',report_hash:canonicalHash(value),report_cipher:cipher,created_at:new Date()}))
  const {read}=reader(rows.map(r=>({id:r.id,bytes:Buffer.byteLength(r.report_cipher),created_at:r.created_at})),rows)
  await expect(read()).rejects.toThrow('读取正文合计预算超限')
 })
 it('retains source FINAL and saved report hash validation within the budget',async()=>{
  const value={text:'Synthetic'},row={id:'one',tool_id:'tool',import_id:'one',source_final_hash:'wrong-final',report_hash:canonicalHash(value),report_cipher:encryptUnifiedRuntimePayload(value),created_at:new Date()}
  await expect(reader([{id:row.id,bytes:row.report_cipher.length,created_at:new Date()}],[row]).read()).rejects.toThrow('摘要与原答卷不一致')
 })
})
