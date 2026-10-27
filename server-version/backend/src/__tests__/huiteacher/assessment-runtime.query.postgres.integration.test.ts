import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {describe,it,expect} from 'vitest'
import {queryTeacherAssessmentRows} from '../../modules/huiteacher/assessmentRuntime.access'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'

const url=integrationDatabaseUrl('TEACHER_RUNTIME_QUERY_DATABASE_URL')
/** Narrow real PostgreSQL query smoke. No writes, source fixture, runtime mock,
 * source registration, START, FINAL, scoring, race or browser qualification. */
;(url?describe:describe.skip)('Teacher runtime SQL against the actual migrated PostgreSQL schema',()=>{
 it('executes the production current-authority query and excludes a nonexistent respondent',async()=>{
  requireIsolatedReleaseDatabase(url!)
  const db=new PrismaClient({datasources:{db:{url:url!}}})
  try{
   const [{version}]=await db.$queryRaw<Array<{version:string}>>`SELECT version()`
   expect(version).toMatch(/^PostgreSQL /)
   const rows=await queryTeacherAssessmentRows(db,randomUUID(),{executionId:randomUUID(),limit:2})
   expect(rows).toEqual([])
   console.info('Real PostgreSQL read-only scope:',version.split(' on ')[0],'; no rows written; no START/FINAL executed')
  }finally{await db.$disconnect()}
 })
})
