import {randomUUID} from 'node:crypto'
import type {PrismaClient} from '@prisma/client'
import {prepareAdminStaticSjtMapping,publishAdminStaticSjtMeasurement} from '../../modules/situational/static-measurement-admin.service'
import {readStaticSjtMeasurementForStart} from '../../modules/situational/static-measurement-release'
import {issueAdminContentRoot} from '../../modules/measurement-content/admin-authority.service'
import {publishAssignmentMeasurementRelease} from '../../modules/cognitive/assignment-measurement-release'
import {publishRegisteredScaleFixture} from '../integration/registered-resource-fixture'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {libraryDistributorFixture} from './library-distribution'
import {publicScaleScope,setScalePublicDelivery} from '../../modules/scale/scale-public-delivery'

/** Explicit synthetic setup, never an admission-time publisher. Exact system
 * authority, independent capability and publication enter their real services.
 * These are not HTTP/MFA ceremonies or rights for a real deployment.
 */
export async function publishStaticMeasurementFixture(db:PrismaClient,identity:{instrumentKey:string;instrumentVersion:string}){
 requireIsolatedReleaseDatabase(process.env.DATABASE_URL!)
 const [existing]=await db.$queryRaw<Array<{measurement_release_id:string|null}>>`SELECT measurement_release_id FROM static_sjt_measurement_mappings WHERE instrument_key=${identity.instrumentKey} AND instrument_version=${identity.instrumentVersion}`
 if(existing?.measurement_release_id){await db.$transaction(tx=>readStaticSjtMeasurementForStart(tx,identity,'PUBLISH'));return}
 const publisher=await db.user.create({data:{username:'static-fixture-'+randomUUID(),passwordHash:'synthetic-only',
  role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN'}})
 const deployment={locale:'zh-CN',territory:'CN'}
 const proof={tokenVersion:0,adminSessionId:'synthetic-static-session',adminVerifiedAt:Math.floor(Date.now()/1000)}
 const mapping=await prepareAdminStaticSjtMapping(publisher.id,proof,identity)
 const root=await issueAdminContentRoot(publisher.id,proof,{requestId:randomUUID(),expectedVersion:0,reason:'Synthetic exact static publication',
  grant:{subjectId:publisher.id,scope:{product:'TRAINING',scopeKind:'PLATFORM',scopeId:'situational-registry',resourceKind:'measurement',resourceKeys:[mapping.mappingId]},
   capabilities:['measurement.publish'],delegableCapabilities:[],remainingDelegationDepth:0,
   validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
 await publishAdminStaticSjtMeasurement(publisher.id,proof,{mappingId:mapping.mappingId,grantId:root.grantId,deployment})
}
export async function publishTrainingSourcesFixture(db:PrismaClient,owner:string,input:{scaleIds?:string[];assignmentIds?:string[];situational?:Array<{instrumentKey:string;instrumentVersion:string}>}){
 requireIsolatedReleaseDatabase(process.env.DATABASE_URL!)
 for(const id of input.scaleIds??[])await publishRegisteredScaleFixture(db,id)
 for(const id of input.assignmentIds??[])await db.$transaction(tx=>publishAssignmentMeasurementRelease(tx,owner,id))
 for(const identity of input.situational??[])await publishStaticMeasurementFixture(db,identity)
}
export async function grantPublicScaleFixture(db:PrismaClient,scaleId:string){
 requireIsolatedReleaseDatabase(process.env.DATABASE_URL!)
 const system=await db.user.create({data:{username:'public-fixture-'+randomUUID(),passwordHash:'synthetic-only',
  accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN'}})
 const manager=await libraryDistributorFixture(db,system.id)
 const grant=await issueAdminContentRoot(system.id,{tokenVersion:0,adminSessionId:'synthetic-public-session',adminVerifiedAt:Math.floor(Date.now()/1000)},
  {requestId:randomUUID(),expectedVersion:0,reason:'Synthetic exact PUBLIC deployment',grant:{subjectId:manager,scope:publicScaleScope(scaleId),
   capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,
   validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
 await setScalePublicDelivery(manager,scaleId,grant.grantId,true)
}
