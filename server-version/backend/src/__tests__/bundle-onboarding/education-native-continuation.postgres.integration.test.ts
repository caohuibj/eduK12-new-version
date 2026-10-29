import {it} from 'vitest'
import fs from 'node:fs'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {finishSchoolNative} from './education-native-runtime.fixture'
const url=integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL'),checkpoint=process.env.EVC_EDUCATION_CHECKPOINT,fixture=process.env.EVC_RUNTIME_FIXTURE
const test=url&&checkpoint&&fixture?it:it.skip
test('continues the already published native School resource through missing runtime consumers',async()=>{
 requireIsolatedReleaseDatabase(url!);const oldKey=process.env.BUNDLE_REVIEW_SIGNING_KEY,oldCampus=process.env.CAMPUS_ELIGIBILITY_HMAC_KEY
 process.env.BUNDLE_REVIEW_SIGNING_KEY=JSON.parse(fs.readFileSync(fixture!,'utf8')).signingKey
 process.env.CAMPUS_ELIGIBILITY_HMAC_KEY='2'.repeat(64);process.env.BUNDLE_PRODUCTS_ENABLED='true'
 try{await finishSchoolNative(JSON.parse(fs.readFileSync(checkpoint!,'utf8')))}finally{await db.$disconnect();if(oldKey===undefined)delete process.env.BUNDLE_REVIEW_SIGNING_KEY;else process.env.BUNDLE_REVIEW_SIGNING_KEY=oldKey;if(oldCampus===undefined)delete process.env.CAMPUS_ELIGIBILITY_HMAC_KEY;else process.env.CAMPUS_ELIGIBILITY_HMAC_KEY=oldCampus}
},120000)
