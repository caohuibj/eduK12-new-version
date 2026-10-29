import {it,expect,vi,beforeAll,afterAll} from 'vitest'
import fs from 'node:fs'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {readGeneralForOwnAttempt} from '../../modules/survey/final.service'
import {readGovernedPackageReports} from '../../modules/survey/governed-package.reports'
import * as scorer from '../../modules/scale/scale-scoring'
import * as engine from '../../modules/assessment-bundle/report-facts'
import * as source from '../../modules/bundle-product/survey-source'
import * as tools from '../../modules/survey/governed-tool.service'
const url=integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL'),directory=process.env.EVC_EVIDENCE_DIRECTORY
const test=url&&directory?it:it.skip
beforeAll(()=>{vi.stubEnv('SURVEY_WORKSPACE_ENABLED','true');vi.stubEnv('SURVEY_PUBLICATION_ENABLED','true')})
afterAll(()=>vi.unstubAllEnvs())

test('reads restored native Survey feedback from immutable saved facts, with no scorer, profile engine or current source lookup',async()=>{
 requireIsolatedReleaseDatabase(url!);const result=JSON.parse(fs.readFileSync(directory+'/survey-native-result.json','utf8')),state=JSON.parse(fs.readFileSync(directory+'/survey-native-checkpoint.json','utf8'))
 const score=vi.spyOn(scorer,'scoreScale').mockImplementation(()=>{throw new Error('SAVED_READ_RESCORE')}),profile=vi.spyOn(engine,'projectBundleReportFacts').mockImplementation(()=>{throw new Error('SAVED_READ_REPROFILE')}),current=vi.spyOn(source,'assertSurveyNativeAdmission').mockImplementation(()=>{throw new Error('SAVED_READ_CURRENT_SOURCE')})
 try{
 const started=performance.now(),cpu=process.cpuUsage(),feedback=await readGeneralForOwnAttempt({publicId:result.publicId,attemptId:result.attemptId,accessCredential:state.attempt.accessCredential}),readMs=performance.now()-started,readCpu=process.cpuUsage(cpu)
 expect(feedback).toMatchObject({nativeBundles:[{factsHash:result.factsHash,profileView:{profileId:'P4'}}],measurements:expect.any(Array)})
 const reports=await readGovernedPackageReports(state.owner.userId,{projectId:result.projectId,waveId:result.waveId,finalId:result.finalId});expect(reports.list[0].artifact).toMatchObject({nativeBundle:{profileView:{state:'WITHHELD',profileId:null,constructs:[]}}})
 await expect(readGeneralForOwnAttempt({publicId:result.publicId,attemptId:result.attemptId,accessCredential:'x'.repeat(43)})).rejects.toThrow()
 expect(score).not.toHaveBeenCalled();expect(profile).not.toHaveBeenCalled();expect(current).not.toHaveBeenCalled()
 fs.writeFileSync(directory+'/survey-native-saved-read-result.json',JSON.stringify({status:'PASS',readMs,readCpu,responseBytes:Buffer.byteLength(JSON.stringify(feedback)),factsHash:result.factsHash,wrongCredentialDenied:true,noRescore:true,noReprofile:true,noCurrentSourceLookup:true},null,2))
 }finally{score.mockRestore();profile.mockRestore();current.mockRestore();await db.$disconnect()}
},60000)

test('rejects split or reordered native content and changed source identity before creating an artifact',async()=>{
 requireIsolatedReleaseDatabase(url!);const state=JSON.parse(fs.readFileSync(directory+'/survey-native-checkpoint.json','utf8')),row=await tools.governedRow(db,state.bundleId),native=row.snapshot.nativeBundle!
 try{
 for(const components of [row.snapshot.components.slice(1),[...row.snapshot.components].reverse()])await expect(db.$transaction(tx=>source.freezeSurveyNativeSource(tx,native.ownerId,native.source,components))).rejects.toMatchObject({code:'SURVEY_NATIVE_WHOLE_PACKAGE_REQUIRED'})
 await expect(db.$transaction(tx=>source.freezeSurveyNativeSource(tx,native.ownerId,{...native.source,definitionHash:'0'.repeat(64)},row.snapshot.components))).rejects.toMatchObject({code:'SURVEY_NATIVE_SOURCE_CHANGED'})
 }finally{await db.$disconnect()}
},60000)
