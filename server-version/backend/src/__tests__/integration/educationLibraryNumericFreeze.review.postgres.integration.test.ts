import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createTemplate,saveTemplate,completeTemplate} from '../../modules/survey/tool-library.service'
import {publishToolMeasurement} from '../../modules/survey/tool-publication.service'
import {submit,review} from '../../modules/scale-library-governance/service'
import {grantEducationLibraryUseInTransaction} from '../../modules/scale-library-governance/education-distribution'
import * as tools from '../../modules/education-tools/private-tool.service'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip

// One freeze boundary only. The new synthetic source has fractional scores
// from its first authored revision. Original services publish, approve and
// grant it; no ONLINE fact, release, approved snapshot or score is fabricated
// or changed after publication. There is no run, START, FINAL or report here.
suite('Review: approved library scientific numbers at ordinary composition freeze',()=>{
 beforeAll(()=>requireIsolatedReleaseDatabase(url!))
 afterAll(async()=>{await db.$disconnect()})

 it('freezes an authorized approved Survey scale with its original fractional scores intact',async()=>{
  const admin=await db.user.create({data:{username:'r3admin'+randomUUID(),passwordHash:'synthetic-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})
  const author=await db.user.create({data:{username:'r3author'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SURVEY'}})
  const login='r3'+randomUUID().replace(/-/g,'').slice(0,20)
  await db.surveyAccount.create({data:{userId:author.id,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:author.id,status:'ACTIVE',grantedBy:admin.id}})
  await db.surveyMfaCredential.create({data:{userId:author.id,enabled:true,secretCipher:'synthetic-not-an-mfa-secret'}})

  const initial=await createTemplate(author.id,{requestId:randomUUID(),kind:'SCALE',title:'Synthetic fractional source'})
  const saved=await saveTemplate(author.id,initial.id,{revision:initial.revision,title:initial.title,definition:{
   schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'teacher_self_report',aggregation:'mean',
   responseOptions:[{optionKey:'low',label:'Low',score:0.5},{optionKey:'high',label:'High',score:1.5}],
   dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
   items:[{itemKey:'q1',prompt:'Synthetic question',required:true,reverse:false,dimensionKeys:['total']}],
  }})
  await completeTemplate(author.id,saved.id,saved.revision)
  const release=await publishToolMeasurement(author.id,saved.id,saved.revision)
  const application=await submit(author.id,'SURVEY',{requestId:randomUUID(),releaseId:release.releaseId,
   metadata:{title:saved.title,author:'Synthetic author',copyright:'Self authored; redistribution allowed',
    applicability:'Synthetic isolated test',scoringDescription:'Mean of original fractional scores',reportDescription:'Descriptive only'},
   educationApplicability:{schemaVersion:1,administrations:[{population:'TEACHER',responseMode:'SELF'}]},
  })
  const approved=await review(admin.id,application.id,{expectedVersion:1,decision:'APPROVE',allowedProducts:['SURVEY','TRAINING'],reason:'Isolated numeric contract review'})
  expect(approved.status).toBe('APPROVED')
  if(!approved.entryId)throw new Error('Original approval did not create an entry')

  const manager=await db.user.create({data:{username:'r3manager'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
  const org=await db.organization.create({data:{id:randomUUID(),name:'Synthetic numeric contract',productDomain:'SCHOOL',createdByUserId:manager.id}})
  const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:manager.id,orgRole:'ORG_ADMIN'}})
  await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:member.id,persona:'TEACHER',grantedByUserId:manager.id}})
  await db.educationProductEntitlement.create({data:{organizationId:org.id,product:'HUITEACHER',grantedByUserId:manager.id}})
  await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:member.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:manager.id}})
  const grant=await db.$transaction(tx=>grantEducationLibraryUseInTransaction(tx,admin.id,approved.entryId!,{
   requestId:randomUUID(),product:'TEACHER',organizationId:org.id,scopeKind:'ORGANIZATION',userId:null,
  }))
  expect(grant.resources).toHaveLength(1)

  const readSource=()=>db.$queryRaw<Array<{hash:string;snapshot:Prisma.JsonObject;status:string;entry_status:string;release_status:string}>>`
   SELECT s.snapshot_hash AS hash,s.snapshot,s.status,e.status AS entry_status,r.status AS release_status
   FROM scale_library_submissions s JOIN scale_library_entries e ON e.submission_id=s.id
   JOIN measurement_content_releases r ON r.id=s.release_id WHERE e.id=${approved.entryId}`
  const [source]=await readSource()
  expect(source).toMatchObject({status:'APPROVED',entry_status:'ACTIVE',release_status:'PUBLISHED'})
  expect(source.hash).toBe(canonicalHash(source.snapshot))
  expect(source.snapshot).toMatchObject({snapshotOrigin:'PUBLISHED_PROVENANCE',compiledDefinition:{
   responseSets:[{options:[{score:0.5},{score:1.5}]}],referencePolicy:{type:'none'},
  }})
  const c={entry:'TEACHER' as const,organizationId:org.id,principal:{userId:manager.id,accountDomain:'SCHOOL' as const}}
  const draft=await tools.createPrivateTool(c,{kind:'COMPOSITION',title:'Keep the approved fractional scores'})
  const updated=await tools.updatePrivateTool(c,draft.id,{expectedRevision:1,title:draft.title,definition:{
   schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'',
   blocks:[{blockId:randomUUID(),instruction:'',source:{provider:'LIBRARY_SCALE',kind:'SCALE',versionId:approved.entryId,contentHash:source.hash}}],
  }})
  console.info('R3_APPROVED_SOURCE',JSON.stringify({entryId:approved.entryId,releaseId:release.releaseId,grantId:grant.grant.id,
   snapshotHash:source.hash,nativeDefinitionHash:canonicalHash(source.snapshot.compiledDefinition),scores:[0.5,1.5],toolId:draft.id}))
  let frozen:Awaited<ReturnType<typeof tools.freezePrivateTool>>|undefined
  try{
   frozen=await tools.freezePrivateTool(c,draft.id,{expectedRevision:updated.revision,expectedContentHash:updated.contentHash})
  }finally{
   expect((await readSource())[0]).toEqual(source)
   if(!frozen)expect(await db.educationPrivateToolVersion.count({where:{toolId:draft.id}})).toBe(0)
   console.info('R3_SOURCE_UNCHANGED',JSON.stringify({snapshotHash:source.hash,freezeCompleted:Boolean(frozen)}))
  }
  expect(frozen).toMatchObject({created:true})
  if(!frozen||!('runtime'in frozen)||!frozen.runtime)throw new Error('Missing sealed composition')
  const parent=await db.compositeAssessment.findUniqueOrThrow({where:{id:frozen.runtime.compositeId}})
  const snapshot=parent.trainingContentSnapshot as Prisma.JsonObject
  expect(snapshot.units).toMatchObject([{source:{educationLibrary:{nativeDefinitionHash:canonicalHash(source.snapshot.compiledDefinition)}}}])
  const wrapper=await db.scale.findUniqueOrThrow({where:{libraryEntryId:approved.entryId}})
  expect(wrapper.definition).toEqual(source.snapshot.compiledDefinition)
 },60000)
})
