import {afterAll,afterEach,describe,expect,it,vi} from 'vitest'
import {prisma} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {readGovernedPackageReports} from '../../modules/survey/governed-package.reports'
import {PACKAGE_REPORT_MAX_CIPHER_BYTES} from '../../modules/survey/governed-package.budget'
vi.mock('../../modules/survey/builder.service',()=>({authorizedProject:vi.fn(async()=>({}))}))
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()})
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await prisma.$disconnect()})
function reader(sizes:Array<{id:string;bytes:number}>,rows:unknown[]=[]){
 const tx={surveyWaveFinal:{findFirst:vi.fn(async()=>({resultsHash:'final-hash'}))},$queryRaw:vi.fn().mockResolvedValueOnce(sizes).mockResolvedValueOnce(rows)}
 vi.spyOn(prisma,'$transaction').mockImplementation(async run=>(run as (tx:unknown)=>unknown)(tx))
 return {tx,read:()=>readGovernedPackageReports('owner',{projectId:'project',waveId:'wave',finalId:'final'})}
}
describe('bounded stored package report reads',()=>{
 it('rejects total ciphertext before fetching any report payload',async()=>{
  const {tx,read}=reader([{id:'one',bytes:PACKAGE_REPORT_MAX_CIPHER_BYTES+1}])
  await expect(read()).rejects.toThrow('读取密文合计预算超限');expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
 })
 it('refuses overflow row count rather than silently taking the first 30',async()=>{
  const {tx,read}=reader(Array.from({length:31},(_,i)=>({id:String(i),bytes:10})))
  await expect(read()).rejects.toThrow('数量超出');expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
 })
 it('also bounds decoded aggregate for small compressed ciphertext',async()=>{
  vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','true')
  const value={text:'x'.repeat(2_010_000)},cipher=encryptUnifiedRuntimePayload(value)
  const rows=['one','two'].map(id=>({id,tool_id:'tool',import_id:id,source_final_hash:'final-hash',report_hash:canonicalHash(value),report_cipher:cipher,created_at:new Date()}))
  const {read}=reader(rows.map(r=>({id:r.id,bytes:Buffer.byteLength(r.report_cipher)})),rows)
  await expect(read()).rejects.toThrow('读取正文合计预算超限')
 })
 it('retains source FINAL and saved report hash validation within the budget',async()=>{
  const value={text:'Synthetic'},row={id:'one',tool_id:'tool',import_id:'one',source_final_hash:'wrong-final',report_hash:canonicalHash(value),report_cipher:encryptUnifiedRuntimePayload(value),created_at:new Date()}
  await expect(reader([{id:row.id,bytes:row.report_cipher.length}],[row]).read()).rejects.toThrow('摘要与原答卷不一致')
 })
})
