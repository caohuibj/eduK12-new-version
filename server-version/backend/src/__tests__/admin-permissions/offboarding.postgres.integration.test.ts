import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma as db } from '../../config/database'
import { ADMIN_ENTRIES, changeEntryGrant, previewEntryOffboarding } from '../../modules/admin-permissions/service'
import { SURVEY_WAVE_HANDOFF_ACTION } from '../../modules/admin-permissions/offboarding'
import { sealSelectedConfigurationBinding } from '../../modules/assessment-authorization/selected-configuration'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { standardAxisHashes, standardCombinationHash } from '../../modules/measurement-content/standard-combination'
import type { ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { assertSurveyScaleCollectionAllowed } from '../../modules/survey/scale-collection-guard'
import { requireIsolatedReleaseDatabase } from '../integration/integration-env'

const enabled=process.env.ENTRY_OFFBOARDING_PG==='1'

describe.skipIf(!enabled)('entry offboarding on disposable PostgreSQL',()=>{
  const systemId=randomUUID(),departingId=randomUUID(),successorId=randomUUID(),researcherId=randomUUID()
  const actor=()=>({
    actorUserId:systemId,actorSession:{tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),
      adminSessionId:randomUUID(),adminAuthenticationMethod:'TOTP' as const},
  })
  const toolKey='synthetic-offboarding-'+randomUUID()
  const sourceId=randomUUID()
  const measurement={releaseId:randomUUID(),contentHash:canonicalHash({toolKey})}
  const axes={CONTENT:{version:'c1',hash:canonicalHash({toolKey,axis:'C'})},
    PARAMETERS:{version:'p1',hash:canonicalHash({toolKey,axis:'P'})},
    REPORT:{version:'r1',hash:canonicalHash({toolKey,axis:'R'})}}
  const combinationHash=standardCombinationHash(toolKey,standardAxisHashes(axes))
  const ref={sourceId:'survey-standard:'+sourceId,sourceVersion:combinationHash,kind:'SCALE' as const}
  const exact={kind:'STANDARD_COMBINATION' as const,toolKey,instrumentVersion:'1.0.0',combinationId:sourceId,combinationHash,
    measurement,axes}

  beforeAll(async()=>{
    const url=process.env.DATABASE_URL??''
    requireIsolatedReleaseDatabase(url)
    if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/entry_offboarding_ci_test')
      throw new Error('Entry offboarding requires the disposable entry_offboarding_ci_test database')
    const researcherLogin='offboarding-'+researcherId.slice(0,18)
    await db.user.createMany({data:[
      {id:systemId,username:'offboarding-system-'+systemId,accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN',passwordHash:'synthetic-only'},
      {id:departingId,username:'offboarding-manager-'+departingId,accountDomain:'TRAINING',passwordHash:'synthetic-only'},
      {id:successorId,username:'offboarding-manager-'+successorId,accountDomain:'TRAINING',passwordHash:'synthetic-only'},
      {id:researcherId,username:researcherLogin,accountDomain:'SURVEY',passwordHash:'synthetic-only'},
    ]})
    await db.adminTotpCredential.create({data:{userId:successorId,secretCipher:'synthetic-unusable'}})
    await db.surveyAccount.create({data:{userId:researcherId,loginName:researcherLogin,normalizedLogin:researcherLogin}})
    for(const entry of ADMIN_ENTRIES)
      await changeEntryGrant({...actor(),targetUserId:departingId,entry,active:true,expectedVersion:0,reason:'Synthetic entry'})
    await changeEntryGrant({...actor(),targetUserId:successorId,entry:'SURVEY',active:true,expectedVersion:0,reason:'Synthetic successor entry'})
  })
  afterAll(()=>db.$disconnect())

  it('executes all four impact queries against existing tables and isolates successor eligibility by entry',async()=>{
    for(const entry of ADMIN_ENTRIES)
      await expect(previewEntryOffboarding(departingId,entry)).resolves.toMatchObject({
        version:1,counts:{collecting:0,drafts:0,configurations:0,pending:0},items:[],truncated:false,
      })
    await expect(previewEntryOffboarding(departingId,'TRAINING',successorId)).rejects.toMatchObject({statusCode:409})
    await expect(previewEntryOffboarding(departingId,'SURVEY',departingId)).rejects.toMatchObject({statusCode:409})
    await db.user.update({where:{id:successorId},data:{role:'TEACHER',teacherApproved:false}})
    await expect(previewEntryOffboarding(departingId,'SURVEY',successorId)).rejects.toMatchObject({statusCode:409})
    await db.user.update({where:{id:successorId},data:{teacherApproved:true}})
    await expect(previewEntryOffboarding(departingId,'SURVEY',successorId))
      .resolves.toMatchObject({successors:expect.arrayContaining([expect.objectContaining({id:successorId})])})
  })

  async function installSyntheticSource(){
    await db.measurementContentRelease.create({data:{
      id:measurement.releaseId,key:toolKey,version:'1.0.0',hashScheme:'SHA256',layer:'MEASUREMENT',family:'SCALE',
      contentHash:measurement.contentHash,scope:{kind:'PLATFORM'},content:{},assetRefs:[],publishedBy:systemId,
    }})
    const trial=randomUUID()
    await db.$executeRaw`
      INSERT INTO survey_standard_releases (id,tool_key,combination_hash,snapshot,reference,state,approved_by)
      VALUES (${sourceId},${toolKey},${combinationHash},'{}','{}','APPROVED',${systemId})`
    await db.$executeRaw`
      INSERT INTO survey_standard_trials(id,release_id,run_id,case_index,answers,scores,report,record_hash)
      SELECT ${trial}||case_index,${sourceId},${trial},case_index,'[]','{}','{}',${measurement.contentHash}
      FROM generate_series(0,2) case_index`
    await db.$executeRaw`
      UPDATE survey_standard_releases SET state='ONLINE',latest_trial=${trial},measurement_release=${JSON.stringify(measurement)}::jsonb
      WHERE id=${sourceId}`
    await db.surveyToolPolicy.create({data:{
      product:'SURVEY',resourceKey:'standard-release:'+sourceId,fingerprint:combinationHash,
      decision:'APPROVED',reason:'Synthetic source approval',reviewedBy:systemId,
    }})
  }

  async function issueExact(issuerId:string){
    const entry=await db.adminEntryGrant.findUniqueOrThrow({where:{userId_entry:{userId:issuerId,entry:'SURVEY'}}})
    const id=randomUUID()
    const selectedBinding=sealSelectedConfigurationBinding({product:'SURVEY',configuration:exact,authorization:{
      kind:'SURVEY_TOOL_USE',id,revision:1,issuerId,recipientId:researcherId,organizationId:null,
      authority:[{kind:'ENTRY_ADMIN',id:entry.id,revision:entry.version}],
    }})
    const provenance={
      selectedBinding,configurationName:'Synthetic fixed '+issuerId,
      surveyStandardReleaseId:sourceId,code:toolKey,standardInstrumentVersion:exact.instrumentVersion,
      triplet:standardAxisHashes(axes),sourceMeasurementRelease:measurement,
    }
    const source={ref,title:'Synthetic exact scale',provenance}
    await db.$executeRaw`
      INSERT INTO survey_tool_grants(id,user_id,status,snapshot,snapshot_digest,created_by)
      VALUES (${id},${researcherId},'ACTIVE',${JSON.stringify(source)}::jsonb,${canonicalHash(source)},${issuerId})`
    return {id,provenance}
  }

  async function fixtureWave(source:Awaited<ReturnType<typeof issueExact>>,open:boolean,ordinal:number){
    const projectId=randomUUID(),waveId=randomUUID(),publicationId=randomUUID(),draftId=randomUUID()
    await db.surveyProject.create({data:{id:projectId,ownerUserId:researcherId,title:'Synthetic project '+ordinal,
      status:open?'ACTIVE':'DRAFT',collectionMode:'SINGLE_UNLINKED',...(open?{publicId:randomUUID()}:{})}})
    await db.surveyInstrumentDraft.create({data:{id:draftId,projectId,instrumentKey:toolKey,title:'Synthetic instrument '+ordinal,
      kind:'SCALE',definition:{},status:'PUBLISHED',catalogGrantId:source.id}})
    const snapshot:ResearchFrozenPublication={
      schemaVersion:1,purpose:'RESEARCH_ONLY',projectId,waveId,collectionMode:'SINGLE_UNLINKED',consentVersion:1,
      linkageNoticeConfirmed:false,consentDigest:canonicalHash({waveId}),runtimeStatus:'SURVEY_FINAL_V1',
      units:[{draftId,instrumentKey:toolKey,kind:'SCALE',title:'Synthetic exact scale',draftRevision:0,
        sourceDigest:canonicalHash({toolKey}),scoringDigest:null,compiledDefinition:{},displayDefinition:{},
        sourceProvenance:{...source.provenance,source:ref,sourceGrantId:source.id}}],
    }
    await db.surveyPublication.create({data:{id:publicationId,projectId,version:1,consentVersion:1,
      definitionDigest:canonicalHash(snapshot),compiledSnapshot:snapshot as unknown as Prisma.InputJsonValue}})
    await db.surveyWave.create({data:{id:waveId,projectId,publicationId,ordinal:1,title:'Synthetic wave '+ordinal,
      consentText:'Synthetic test consent notice',instrumentIds:[draftId],status:open?'OPEN':'DRAFT',
      ...(open?{opensAt:new Date(Date.now()-1000),closesAt:new Date(Date.now()+3600000)}:{})}})
    return {projectId,waveId,publicationId,snapshot}
  }

  it('requires exact reissue of open wave sources and leaves frozen draft, other wave and emergency boundaries intact',async()=>{
    await installSyntheticSource()
    const original=await issueExact(departingId)
    const open=await fixtureWave(original,true,1)
    const draft=await fixtureWave(original,false,2)
    const scope=()=>previewEntryOffboarding(departingId,'SURVEY',successorId)
    const retire=(digest:string)=>changeEntryGrant({...actor(),targetUserId:departingId,entry:'SURVEY',active:false,
      expectedVersion:1,reason:'Synthetic planned handoff',offboarding:{mode:'PLANNED',digest,successorId}})
    const initial=await scope()
    expect(initial.counts).toEqual({collecting:1,drafts:1,configurations:1,pending:3})
    await expect(retire(initial.digest)).rejects.toMatchObject({statusCode:409})
    const successor=await issueExact(successorId)
    const afterIssue=await scope()
    expect(afterIssue.counts).toMatchObject({pending:1,drafts:1})
    await expect(retire(afterIssue.digest)).rejects.toMatchObject({statusCode:409})
    await db.surveyProject.update({where:{id:draft.projectId},data:{status:'ARCHIVED'}})
    const ready=await scope()
    expect(ready.counts).toEqual({collecting:1,drafts:0,configurations:1,pending:0})
    await expect(retire(initial.digest)).rejects.toMatchObject({statusCode:409})
    await expect(retire(ready.digest)).resolves.toMatchObject({version:2,changed:true})
    await expect(retire(ready.digest)).resolves.toMatchObject({version:2,changed:false})
    const audit=await db.adminAuthorizationAudit.findMany({where:{action:SURVEY_WAVE_HANDOFF_ACTION,targetUserId:departingId}})
    expect(audit).toHaveLength(1)
    expect(JSON.parse(audit[0].reason)).toMatchObject({publicationId:open.publicationId,useId:original.id,replacementId:successor.id})

    const admit=(wave=open,id=wave.publicationId)=>db.$transaction(tx=>assertSurveyScaleCollectionAllowed(tx,wave.snapshot,id))
    await expect(admit()).resolves.toBeUndefined()
    await expect(admit(open,randomUUID())).rejects.toThrow('管理资格已变化')
    await expect(admit(draft)).rejects.toThrow('管理资格已变化')
    const frozen=await db.surveyPublication.findUniqueOrThrow({where:{id:open.publicationId}})
    expect(frozen.compiledSnapshot).toEqual(open.snapshot)

    await db.surveyToolPolicy.updateMany({where:{product:'SURVEY',resourceKey:'standard-release:'+sourceId,fingerprint:combinationHash},
      data:{paused:true,version:{increment:1},reason:'Synthetic source stop'}})
    await expect(admit()).rejects.toThrow('已暂停')
    await db.surveyToolPolicy.updateMany({where:{product:'SURVEY',resourceKey:'standard-release:'+sourceId,fingerprint:combinationHash},
      data:{paused:false,version:{increment:1},reason:'Synthetic source restored'}})
    await expect(admit()).resolves.toBeUndefined()
    await changeEntryGrant({...actor(),targetUserId:successorId,entry:'SURVEY',active:false,expectedVersion:1,
      reason:'Synthetic emergency revoke',offboarding:{mode:'EMERGENCY'}})
    await expect(admit()).rejects.toThrow('管理资格已变化')
    expect(await db.adminAuthorizationAudit.count({where:{action:SURVEY_WAVE_HANDOFF_ACTION,targetUserId:departingId}})).toBe(1)
  },30000)
})
