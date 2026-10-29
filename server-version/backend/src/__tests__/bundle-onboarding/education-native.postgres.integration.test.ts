import {finishSchoolNative} from './education-native-runtime.fixture'
import {readInstance} from '../../modules/bundle-product/instance'
import {hashDeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {canonicalJsonString} from '../../modules/assessment-runtime/canonical'
import {publishPackage} from '../../modules/bundle-product/package-release'
import {it,expect} from 'vitest'
import {randomUUID,createHmac} from 'node:crypto'
import fs from 'node:fs'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {issueAdminContentRoot} from '../../modules/measurement-content/admin-authority.service'
import {publishContentRelease,getContentRelease} from '../../modules/measurement-content/repository'
import {DECLARATIVE_REPORT_GENERATOR} from '../../modules/measurement-content/report-renderer'
import * as producer from '../../modules/education-tools/assessment-resource.service'
import {readEducationAssessmentDeliveryIdentity} from '../../modules/education-tools/assessment-resource.repository'
import {resultAudiences,validateResultDisclosureContract} from '../../modules/assessment-policy/result-disclosure'
import {grantSyntheticHuischoolProduct} from '../integration/educationProductFixture'
import type {EducationAssessmentContext} from '../../modules/education-tools/assessment-resource.issuer'
import type {AuthenticatedPrincipal} from '../../types'
const url=integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL'),fixturePath=process.env.EVC_RUNTIME_FIXTURE
const test=url&&fixturePath?it:it.skip
test('retains an explicitly distributed whole EVC source through School publication, FINAL and personal feedback',async()=>{
 requireIsolatedReleaseDatabase(url!);const input=JSON.parse(fs.readFileSync(fixturePath!,'utf8'))
 const previousCampus=process.env.CAMPUS_ELIGIBILITY_HMAC_KEY;process.env.CAMPUS_ELIGIBILITY_HMAC_KEY='2'.repeat(64)
 const previousKey=process.env.BUNDLE_REVIEW_SIGNING_KEY;process.env.BUNDLE_REVIEW_SIGNING_KEY=input.signingKey;process.env.BUNDLE_PRODUCTS_ENABLED='true'
 const actor=(u:{id:string;username:string;role:any;accountDomain:any;platformRole:any}):AuthenticatedPrincipal=>({userId:u.id,username:u.username,role:u.role,accountDomain:u.accountDomain,platformRole:u.platformRole,tokenVersion:0,mustChangePassword:false})
 const system=await db.user.create({data:{username:'evc-org-issuer-'+randomUUID(),passwordHash:'synthetic-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'TRAINING'}})
 const reviewer=await db.user.create({data:{username:'evc-org-reviewer-'+randomUUID(),passwordHash:'synthetic-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'TRAINING'}})
 const manager=await db.user.create({data:{username:'evc-school-admin-'+randomUUID(),passwordHash:'synthetic-only',role:'ADMIN',accountDomain:'SCHOOL'}})
 const org=await db.organization.create({data:{id:randomUUID(),name:'Synthetic native EVC School',productDomain:'SCHOOL',createdByUserId:manager.id}})
 const membership=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:manager.id,orgRole:'ORG_ADMIN'}})
 await grantSyntheticHuischoolProduct(db,{organizationId:org.id,adminUserId:manager.id,adminMembershipId:membership.id})
 const proof={tokenVersion:0,adminSessionId:'synthetic-strong-admin-proof',adminVerifiedAt:Date.now()/1000}
 const context=(u:typeof system):EducationAssessmentContext=>({product:'SCHOOL',organizationId:org.id,principal:{...actor(u),...proof}})
 const source=await db.compositeAssessment.findUniqueOrThrow({where:{id:input.compositeId},include:{bundleInstance:true}})
 const native=readInstance(source.bundleInstance!).frozen.declarativePackage!
 const renewal={contentHash:hashDeclarativePackage(native),reviewerId:reviewer.id,expiresAt:new Date(Date.now()+3600000).toISOString(),claims:['cross_source_condition'],scientific:true,rights:true,language:true,report:true}
 await publishPackage(db,system.id,native.manifest.definition.bundleKey,native.manifest.definition.bundleVersion,{...renewal,signature:createHmac('sha256',input.signingKey).update(canonicalJsonString(renewal)).digest('hex')})
 const units=(source.trainingContentSnapshot as any).units as Array<{measurement:{releaseId:string;contentHash:string}}>
 async function grant(ids:string[]){const result=await issueAdminContentRoot(system.id,proof,{requestId:randomUUID(),expectedVersion:0,reason:'Exact synthetic whole native source and original C/P/R distribution',grant:{subjectId:system.id,scope:{product:'SCHOOL',scopeKind:'ORGANIZATION',scopeId:org.id,resourceKind:'material',resourceKeys:ids},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}});return ids.map(resourceId=>({resourceId,grantId:result.grantId}))}
 try{
 const licenses=await grant([source.id,...units.map(u=>u.measurement.releaseId)])
 const prepared=await producer.prepareEducationAssessment(context(system),{resourceId:randomUUID(),sourceCompositeId:source.id,title:'数学学习动机｜School研究试验',family:'BUNDLE',licenses})
 const reports:Array<{itemId:string;releaseId:string}>=[],metricKeys:string[]=[]
 for(const unit of prepared.units){const c=await db.$transaction(tx=>getContentRelease(tx,unit.measurement.releaseId));if(!c||c.layer!=='MEASUREMENT')throw new Error('C_REQUIRED')
 const keys=c.content.metrics.map(m=>m.metricKey);metricKeys.push(...keys)
 const report=await db.$transaction(tx=>publishContentRelease(tx,{layer:'REPORT',family:'SCALE',key:'evc-school-report-'+randomUUID(),version:'1.0.0',scope:{kind:'PRIVATE',product:'SCHOOL',ownerId:system.id,resourceId:prepared.runtimeCompositeId},sourceReleaseId:null,provenance:{synthetic:true},assetRefs:[],content:{projectionVersion:1,measurements:[{releaseId:unit.measurement.releaseId,contentHash:unit.measurement.contentHash}],metricKeys:keys,audience:'student',language:'zh-CN',generatorVersion:DECLARATIVE_REPORT_GENERATOR,template:{title:'已授权单项原量尺报告',blocks:keys.map(metricKey=>({type:'METRIC' as const,metricKey,display:'RAW' as const}))}}},system.id))
 licenses.push(...await grant([report.releaseId]));reports.push({itemId:unit.itemId,releaseId:report.releaseId})}
 const disclosure=validateResultDisclosureContract({schemaVersion:1,policyKey:'fixture:explicit-disclosure',minimumRespondents:null,audiences:Object.fromEntries(resultAudiences.map(a=>[a,{mode:'NONE',metricKeys:[],longitudinalMetricKeys:[]}]))});disclosure.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:[...new Set(metricKeys)],longitudinalMetricKeys:[]}
 const registered=await producer.registerEducationAssessment(context(system),prepared.resourceId,{expectedPreparationHash:prepared.preparationHash,disclosure,feedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'},references:{schemaVersion:1,units:[]},reports,licenses})
 await producer.transitionEducationAssessment(context(reviewer),prepared.resourceId,'REVIEW',{expectedEntryHash:registered.entryHash,reason:'Independent synthetic native whole-package review'})
 const published=await producer.transitionEducationAssessment(context(reviewer),prepared.resourceId,'PUBLISH',{expectedEntryHash:registered.entryHash,reason:'Synthetic native publication only'})
 const identity=await db.$transaction(tx=>readEducationAssessmentDeliveryIdentity(tx,{resourceKey:published.resourceKey,version:published.version,purpose:'NEW_USE'}))
 expect(identity.origin.nativeBundle?.definitionHash).toBe(source.bundleInstance!.definitionHash)
 if(process.env.EVC_EVIDENCE_DIRECTORY)fs.writeFileSync(process.env.EVC_EVIDENCE_DIRECTORY+'/education-native-checkpoint.json',JSON.stringify({phase:'PUBLISHED',resourceId:prepared.resourceId,resourceKey:published.resourceKey,organizationId:org.id,managerId:manager.id,sourceId:source.id}),{mode:0o600})
 await finishSchoolNative({organizationId:org.id,managerId:manager.id,resourceId:prepared.resourceId,sourceId:source.id,resourceKey:published.resourceKey})
 }finally{if(previousCampus===undefined)delete process.env.CAMPUS_ELIGIBILITY_HMAC_KEY;else process.env.CAMPUS_ELIGIBILITY_HMAC_KEY=previousCampus;if(previousKey===undefined)delete process.env.BUNDLE_REVIEW_SIGNING_KEY;else process.env.BUNDLE_REVIEW_SIGNING_KEY=previousKey;await db.$disconnect()}
},120000)
