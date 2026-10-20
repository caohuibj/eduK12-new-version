import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {grantCatalogSource,listToolGrants,revokeToolGrant} from '../../modules/survey/catalog.service'
import {importCatalogDraft,copyDraft,updateDraft,getDraft,listResearcherCatalog,applySurveyImport} from '../../modules/survey/builder.service'
import {freezeResearchWaveDraft} from '../../modules/survey/publication.service'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
suite('Survey immutable catalog grants PostgreSQL',()=>{
 let db:PrismaClient,admin:string,owner:string,other:string,pid:string,sourceId:string,grantId:string,draftId:string
 const sourceVersion='2.0.0'
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  admin=(await db.user.create({data:{username:'catalog-admin-'+randomUUID(),passwordHash:'synthetic',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})).id
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:admin,entry:'SURVEY',grantedBy:admin}})
  const ids=[]
  for(let i=0;i<2;i++){
   const login='catalog_'+randomUUID().replace(/-/g,'').slice(0,16);const u=await db.user.create({data:{username:login,passwordHash:'synthetic',role:'STUDENT',accountDomain:'SURVEY'}})
   await db.surveyAccount.create({data:{userId:u.id,loginName:login,normalizedLogin:login}})
   await db.surveyResearcherGrant.create({data:{userId:u.id,grantedBy:admin,status:'ACTIVE'}})
   await db.surveyMfaCredential.create({data:{userId:u.id,enabled:true,secretCipher:'synthetic'}});ids.push(u.id)
  }
  ;[owner,other]=ids;pid=randomUUID()
  await db.surveyProject.create({data:{id:pid,ownerUserId:owner,title:'Catalog test',collectionMode:'SINGLE_UNLINKED'}})
  const definition=compileResearchScale('Source',{schemaVersion:1,respondentType:'participant_self_report',responseOptions:[{optionKey:'no',label:'No',score:0},{optionKey:'yes',label:'Yes',score:1}],dimensions:[{dimensionKey:'sum',label:'Sum',direction:'descriptive'}],aggregation:'sum',items:[{itemKey:'original',prompt:'Source question',required:true,reverse:false,dimensionKeys:['sum']}]})
  definition.responseSets[0].options[0].value=0;definition.responseSets[0].options[1].value=1
  sourceId=(await db.scale.create({data:{code:'catalog_'+randomUUID(),name:'Source',status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:sourceVersion,definition:definition as any,definitionHash:hashScaleDefinition(definition),creatorId:admin}})).id
 })
 afterAll(async()=>{await db?.$disconnect()})
 it('rejects nonadministrator, arbitrary version, foreign researcher import and prevents source editing/copy laundering',async()=>{
  const ref={kind:'SCALE' as const,sourceId,sourceVersion}
  await expect(grantCatalogSource(owner,owner,ref)).rejects.toThrow()
  await expect(grantCatalogSource(admin,owner,{...ref,sourceVersion:'999'})).rejects.toThrow('SOURCE_NOT_PUBLISHED')
  const grant=await grantCatalogSource(admin,owner,ref);grantId=grant.id
  expect((await grantCatalogSource(admin,owner,ref)).id).toBe(grantId)
  expect((await listToolGrants(admin,owner)).list).toHaveLength(1)
  expect((await listResearcherCatalog(owner,pid,1)).list).toHaveLength(1)
  await expect(importCatalogDraft(other,pid,grantId,{requestId:randomUUID(),instrumentKey:'evil',title:'Evil'})).rejects.toThrow()
  draftId=randomUUID();const payload={requestId:draftId,instrumentKey:'imported',title:'Imported'}
  const draft=await importCatalogDraft(owner,pid,grantId,payload)
  expect(draft.readOnly).toBe(true);expect((await importCatalogDraft(owner,pid,grantId,payload)).id).toBe(draft.id)
  await expect(updateDraft(owner,pid,draftId,{revision:0,title:'Changed',definition:draft.definition})).rejects.toThrow('只读')
  const copied=await copyDraft(owner,pid,draftId,{requestId:randomUUID(),instrumentKey:'copy',title:'Copy'})
  expect(copied.catalogGrantId).toBe(grantId);expect(copied.readOnly).toBe(true)
  await expect(updateDraft(owner,pid,copied.id,{revision:0,title:'Changed',definition:copied.definition})).rejects.toThrow('只读')
  await expect(db.$executeRaw`UPDATE survey_instrument_drafts SET catalog_grant_id=NULL WHERE id=${draftId}`).rejects.toThrow('read only')
  await expect(db.$executeRaw`UPDATE survey_tool_grants SET snapshot='{}'::jsonb WHERE id=${grantId}`).rejects.toThrow('immutable')
 })
 it('freezes native scoring and exact provenance; revocation stops future imports/freezes without changing frozen research',async()=>{
  const waveId=randomUUID()
  const waveData={projectId:pid,title:'Wave',consentText:'This is a synthetic consent notice for a controlled test only.',instrumentIds:[draftId]}
  await db.surveyWave.create({data:{id:waveId,ordinal:1,...waveData}})
  const published=await freezeResearchWaveDraft({actorUserId:owner,projectId:pid,waveId,revision:0})
  const before=await db.surveyPublication.findUniqueOrThrow({where:{id:published.publicationId}})
  const unit=(before.compiledSnapshot as any).units[0]
  expect(unit.sourceAnswerMapping.options).toEqual({o_0:0,o_1:1})
  expect(unit.sourceProvenance.source).toEqual({kind:'SCALE',sourceId,sourceVersion})
  expect(unit.compiledDefinition.responseSets[0].options[1].value).toBe(1)
  await revokeToolGrant(admin,grantId)
  expect((await getDraft(owner,pid,draftId)).readOnly).toBe(true)
  expect((await listResearcherCatalog(owner,pid,1)).list).toHaveLength(0)
  await expect(importCatalogDraft(owner,pid,grantId,{requestId:randomUUID(),instrumentKey:'later',title:'Later'})).rejects.toThrow('撤销')
  const second=randomUUID();await db.surveyWave.create({data:{id:second,ordinal:2,...waveData}})
  await expect(freezeResearchWaveDraft({actorUserId:owner,projectId:pid,waveId:second,revision:0})).rejects.toThrow('撤销')
  expect(await db.surveyPublication.findUniqueOrThrow({where:{id:published.publicationId}})).toEqual(before)
  await expect(db.$executeRaw`UPDATE survey_tool_grants SET status='ACTIVE',revoked_at=NULL WHERE id=${grantId}`).rejects.toThrow('immutable')
 })
 it('serializes revocation against freezing in both lock orders without altering historical publications',async()=>{
  const ref={kind:'SCALE' as const,sourceId,sourceVersion}
  const createWave=async(ordinal:number)=>{const id=randomUUID();await db.surveyWave.create({data:{id,projectId:pid,ordinal,title:'Race',
    consentText:'Synthetic consent notice for a controlled concurrency test.',instrumentIds:[draftId]}});return id}
  const blocked=async(fragment:string)=>{
    for(let i=0;i<100;i++){
      const rows=await db.$queryRaw<{n:bigint}[]>`SELECT count(*) AS n FROM pg_stat_activity
        WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE ${'%'+fragment+'%'}`
      if(Number(rows[0].n)>0)return
      await new Promise(r=>setTimeout(r,20))
    }
    throw new Error('Expected transactional lock contention was not observed: '+fragment)
  }
  // Regrant immutable source with a new grant ID. Fresh imported row only; original sourced draft cannot be rebound.
  let g=await grantCatalogSource(admin,owner,ref)
  let d=await importCatalogDraft(owner,pid,g.id,{requestId:randomUUID(),instrumentKey:'race_first',title:'Race first'})
  draftId=d.id
  let waveId=await createWave(3)
  let release!:()=>void,locked!:()=>void
  const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>locked=r)
  const holder=db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM survey_tool_grants WHERE id=${g.id} FOR UPDATE`;locked();await gate},{timeout:15000})
  await ready
  const revoke=revokeToolGrant(admin,g.id);await blocked('UPDATE survey_tool_grants')
  const freeze=freezeResearchWaveDraft({actorUserId:owner,projectId:pid,waveId,revision:0}).then(v=>({value:v}),e=>({error:e}))
  await blocked('FROM survey_tool_grants');release();await holder;await revoke
  expect(await freeze).toHaveProperty('error');expect((await db.surveyWave.findUniqueOrThrow({where:{id:waveId}})).publicationId).toBeNull()
  g=await grantCatalogSource(admin,owner,ref)
  d=await importCatalogDraft(owner,pid,g.id,{requestId:randomUUID(),instrumentKey:'race_second',title:'Race second'});draftId=d.id
  waveId=await createWave(4)
  let releaseSource!:()=>void,sourceLocked!:()=>void
  const sourceGate=new Promise<void>(r=>releaseSource=r),sourceReady=new Promise<void>(r=>sourceLocked=r)
  const sourceHolder=db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM scales WHERE id=${sourceId} FOR UPDATE`;sourceLocked();await sourceGate},{timeout:15000})
  await sourceReady
  const freezeFirst=freezeResearchWaveDraft({actorUserId:owner,projectId:pid,waveId,revision:0})
  await blocked('FROM "scales"')
  const revokeSecond=revokeToolGrant(admin,g.id);await blocked('UPDATE survey_tool_grants')
  releaseSource();await sourceHolder
  const published=await freezeFirst;await revokeSecond
  const historical=await db.surveyPublication.findUniqueOrThrow({where:{id:published.publicationId}})
  expect((historical.compiledSnapshot as any).units[0].sourceProvenance.source).toEqual(ref)
  expect((await listToolGrants(admin,owner)).list.find(x=>x.id===g.id)?.status).toBe('REVOKED')
 })

})
