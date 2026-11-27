import { describe,expect,it,vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { readEntryOffboarding,retainSurveyWaveHandoffs,SURVEY_WAVE_HANDOFF_ACTION } from '../../modules/admin-permissions/offboarding'

const basis={id:'previous-entry',userId:'previous-account',entry:'SURVEY' as const,version:3}
const successor={id:'successor-account',username:'synthetic-next',entryId:'next-entry',version:2}
const handoff={waveId:'wave-1',publicationId:'publication-1',issuerId:basis.userId,useId:'old-use',replacementId:'next-use'}
const record={counts:{collecting:34,drafts:2,configurations:9,pending:2},items:[],handoffs:[handoff],fingerprint:'snapshot'}

function database(){
  const read=vi.fn(async(query:Prisma.Sql)=>query.text.includes('AS fingerprint')?[record]:[successor])
  const createMany=vi.fn<(args:{data:Array<{reason:string}>})=>Promise<void>>()
  return {read,write:createMany,tx:{$queryRaw:read,adminAuthorizationAudit:{createMany}} as unknown as Prisma.TransactionClient}
}
describe('entry offboarding impact',()=>{
  it('keeps a digest of every Survey dependency while returning a bounded list and exact current successor options',async()=>{
    const {tx,read}=database()
    const preview=await readEntryOffboarding(tx,basis,successor.id)
    expect(preview).toMatchObject({version:3,truncated:true,counts:record.counts,successors:[{id:successor.id,username:successor.username}]})
    const sql=read.mock.calls[2][0]
    expect(sql.text).toContain("w.status IN ('OPEN','PAUSED','DRAFT')")
    expect(sql.text).toContain("old.snapshot#>'{provenance,selectedBinding}'=unit.value#>'{sourceProvenance,selectedBinding}'")
    expect(sql.text).toContain("candidate.snapshot->'ref'=previous.snapshot->'ref'")
    expect(sql.text).toContain('ORDER BY ready,category,id LIMIT 25')
    expect(sql.text).not.toContain('FOR SHARE NOWAIT')
    expect((await readEntryOffboarding(tx,basis,successor.id,true)).digest).toBe(preview.digest)
    expect(read.mock.calls[3][0].text).toContain('FOR SHARE OF u,g NOWAIT')
    expect(read.mock.calls[4][0].text).toContain('FOR SHARE NOWAIT')
  })

  it('uses retained Training task authority and exact education composition pointers for draft and run impact',async()=>{
    const {tx,read}=database()
    await readEntryOffboarding(tx,{...basis,entry:'TRAINING'})
    expect(read.mock.calls[1][0].text).toContain("i.standard_combination_source#>>'{reference,authority,authorityEntryGrantVersion}'")
    await readEntryOffboarding(tx,{...basis,entry:'HUITEACHER'},successor.id,true)
    const sql=read.mock.calls[3][0]
    expect(sql.text).toContain("block.value#>>'{source,selectedBinding,authorizationId}'")
    expect(sql.text).toContain("track.resource_key LIKE 'education-composition:'")
    expect(sql.values).toContain('TEACHER')
    expect(sql.text).toContain('FOR SHARE OF n,root NOWAIT')
  })

  it('retains an append-only record scoped to the wave, publication, original use and audited replacement',async()=>{
    const {tx,write}=database()
    await retainSurveyWaveHandoffs(tx,'system-actor',4,successor,[handoff])
    const event=write.mock.calls[0][0].data[0]
    expect(event).toMatchObject({id:'survey-handoff:wave-1:old-use:next-entry:2',action:SURVEY_WAVE_HANDOFF_ACTION,targetUserId:basis.userId})
    expect(JSON.parse(event.reason)).toEqual({useId:handoff.useId,publicationId:handoff.publicationId,replacementId:handoff.replacementId,
      successorId:successor.id,successorEntryId:successor.entryId,successorVersion:successor.version})
    expect(event.reason.length).toBeLessThan(500)
  })
})
