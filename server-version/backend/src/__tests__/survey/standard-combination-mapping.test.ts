import {beforeEach,describe,expect,it,vi} from 'vitest'
const h=vi.hoisted(()=>({authorized:true,history:[] as unknown[],query:vi.fn(),batch:vi.fn(),write:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:h.query,$executeRaw:h.write,$transaction:h.write}}))
vi.mock('../../modules/measurement-content/repository',async importOriginal=>({
  ...await importOriginal<typeof import('../../modules/measurement-content/repository')>(),getContentReleaseBatch:h.batch,
}))
import {prisma} from '../../config/database'
import {previewStandardTriplet,standardTripletDetail} from '../../modules/survey/standard-triplet.service'
import {combinationFixture} from '../measurement-content/standard-combination.fixture'

beforeEach(()=>{
  vi.clearAllMocks();h.authorized=true;h.history=[]
  h.query.mockImplementation(async(query:any)=>{
    const sql=query.sql??query.join('?')
    if(sql.includes('FROM users'))return h.authorized?[{id:'system'}]:[]
    if(sql.includes('FROM survey_standard_versions'))return []
    if(sql.includes('FROM survey_standard_releases'))return h.history
    if(sql.includes('FROM survey_standard_trials'))return []
    throw new Error('Unexpected query: '+sql)
  })
  h.batch.mockResolvedValue(new Map())
  h.write.mockRejectedValue(new Error('management mapping must not write'))
})
function history(){
  const f=combinationFixture()
  return {...f,row:{...f.row,version:3,approved_at:new Date('2026-10-25T00:00:00Z'),latest_trial:'old-recorded-trial',
    lease_until:null,blockers:[],reference:{synthetic:true}}}
}
describe('existing system management detail exposes the common exact-version mapping',()=>{
  it('reads existing content records in one batch, without publishing or creating grants',async()=>{
    const f=history();h.history=[f.row];h.batch.mockResolvedValue(new Map([[f.measurement.releaseId,f.measurement]]))
    const result=await standardTripletDetail('system','synthetic-standard','1.0.0')
    expect(result.versionMappings).toHaveLength(1)
    expect(result.versionMappings[0]).toMatchObject({identity:{releaseId:f.row.id,combinationHash:f.row.combination_hash},
      measurement:{status:'PUBLISHED'},consumers:{TRAINING:{sourceAdapter:'NOT_CONNECTED'},SURVEY:{targetUseGrant:'NOT_EVALUATED'}}})
    expect(h.batch).toHaveBeenCalledExactlyOnceWith(expect.any(Object),[f.measurement.releaseId])
    expect(result.history[0]).toMatchObject({id:f.row.id,state:'ONLINE',reference:f.row.reference})
    expect(result.reference).toEqual(f.row.reference)
    expect(result.selection).toEqual({toolKey:f.row.tool_key,...Object.fromEntries(Object.values(f.row.snapshot.parts).map(p=>[p.axis,p.hash]))})
    expect(result.trials).toEqual([]);expect(h.write).not.toHaveBeenCalled()
  })
  it('does not query content records or snapshots when the system role is refused',async()=>{
    h.authorized=false
    await expect(standardTripletDetail('entry-admin','synthetic-standard','1.0.0')).rejects.toMatchObject({statusCode:403})
    expect(h.query).toHaveBeenCalledTimes(1);expect(h.batch).not.toHaveBeenCalled();expect(h.write).not.toHaveBeenCalled()
  })
  it('keeps a recorded pointer with absent content separate from missing training consumption',async()=>{
    h.history=[history().row]
    const result=await standardTripletDetail('system','synthetic-standard','1.0.0')
    expect(result.versionMappings[0].measurement.status).toBe('MISSING')
    expect(result.versionMappings[0].consumers.TRAINING.sourceAdapter).toBe('NOT_CONNECTED')
    expect(h.write).not.toHaveBeenCalled()
  })
  it('maps historical combinations independently, without latest selection or duplicate reads',async()=>{
    const f=history(),old=structuredClone(f.row);old.id='old-combination';old.state='WITHDRAWN';old.measurement_release=null
    h.history=[f.row,old];h.batch.mockResolvedValue(new Map([[f.measurement.releaseId,f.measurement]]))
    const result=await standardTripletDetail('system','synthetic-standard','1.0.0')
    expect(result.versionMappings.map(r=>[r.identity.releaseId,r.approval.state,r.measurement.status])).toEqual([
      [f.row.id,'ONLINE','PUBLISHED'],['old-combination','WITHDRAWN','NOT_RECORDED'],
    ])
    expect(h.batch).toHaveBeenCalledTimes(1);expect(h.write).not.toHaveBeenCalled()
  })
  it('does not invent a formal version when there are no approval records',async()=>{
    const result=await standardTripletDetail('system','synthetic-standard','1.0.0')
    expect(result.versionMappings).toEqual([]);expect(result.history).toEqual([])
    expect(h.write).not.toHaveBeenCalled()
  })
  it('preserves repository integrity failures instead of converting them to missing content',async()=>{
    h.history=[history().row];h.batch.mockRejectedValue(new Error('CONTENT_RELEASE_HASH_MISMATCH'))
    await expect(standardTripletDetail('system','synthetic-standard','1.0.0')).rejects.toThrow('CONTENT_RELEASE_HASH_MISMATCH')
    expect(h.write).not.toHaveBeenCalled()
  })
  it('still rejects a new preview when the exact selected versions are unavailable',async()=>{
    const f=history();h.history=[f.row]
    const selection=Object.fromEntries(Object.values(f.row.snapshot.parts).map(p=>[p.axis,p.hash])) as Record<'CONTENT'|'PARAMETERS'|'REPORT',string>
    await expect(previewStandardTriplet(prisma,'system',{toolKey:f.row.tool_key,...selection})).rejects.toMatchObject({statusCode:409})
    expect(h.batch).not.toHaveBeenCalled();expect(h.write).not.toHaveBeenCalled()
  })
})
