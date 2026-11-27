import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { publishCognitiveConfigRelease } from '../../modules/cognitive/release.service'
import {
  cognitiveReportRevisionSchema,
  prepareCognitiveReportRevision,
  publishCognitiveReportRevision,
} from '../../modules/cognitive/onboarding/report-release.routes'
import { approvedVisibility } from './git-release.fixture'

const enabled=process.env.COGNITIVE_GIT_RELEASE_ISOLATED_TEST==='1'
describe.runIf(enabled)('administrator report-only revision',()=>{
  it('requires exact preview, copies C without touching the base, and grants no entry access',async()=>{
    const raw=process.env.COGNITIVE_GIT_RELEASE_TEST_DB_URL
    if(!raw||raw!==process.env.DATABASE_URL)throw Error('An explicit isolated database is required')
    const url=new URL(raw)
    if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/eduk12_cognitive_git_test')
      throw Error('Refusing non-isolated report revision test')
    const db=new PrismaClient({datasourceUrl:raw})
    try{
      const actorId=randomUUID(),version='fixture-'+randomUUID().slice(0,8)
      await db.user.create({data:{id:actorId,username:'system-'+actorId,passwordHash:'!fixture',
        role:'STUDENT',accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN'}})
      const source=await db.$transaction(async tx=>{
        const draft=await tx.cognitiveTestConfig.create({data:{testType:'gonogo',engineVersion:'1.0.0',scoringVersion:'1.0.0',
          name:'Synthetic assigned test',configVersion:version,accessPolicy:'GRANT',config:{
            totalTrials:120,nogoRatio:.25,stimulusMs:800,isiMs:500,validRtFloorMs:100,
            report:{reportVersion:'1.0.0',referenceMode:'none'},
          }}})
        return publishCognitiveConfigRelease(tx,draft,{actorId,source:'ADMIN'})
      })
      const release=cognitiveReportRevisionSchema.parse({version:version+'-r2',title:'Synthetic R2',instruction:'Read before starting',
        introduction:'Synthetic text',disclaimer:'Not a diagnosis',practicalTips:[],reportVisibility:approvedVisibility})
      expect(cognitiveReportRevisionSchema.safeParse({...release,engineVersion:'9.9.9'}).success).toBe(false)
      const preview=await db.$transaction(tx=>prepareCognitiveReportRevision(tx,source.id,release))
      await expect(db.$transaction(tx=>publishCognitiveReportRevision(tx,actorId,source.id,{
        release:{...release,title:'Changed after review'},expectedPreviewHash:preview.previewHash,
      }))).rejects.toThrow(/预览已变化/)
      const publish=()=>db.$transaction(tx=>publishCognitiveReportRevision(tx,actorId,source.id,{release,expectedPreviewHash:preview.previewHash}))
      const saved=await publish()
      expect(saved.measurementReleaseId).toBe(source.measurementReleaseId)
      expect((await publish()).replayed).toBe(true)
      expect(await db.assessmentManagementEvent.count({where:{resourceId:saved.id,action:'COGNITIVE_PROFILE_APPROVED'}})).toBe(0)
      expect(await db.cognitiveTestConfig.findUnique({where:{id:source.id},select:{name:true,status:true}}))
        .toEqual({name:'Synthetic assigned test',status:'PUBLISHED'})
    }finally{await db.$disconnect()}
  },60000)
})
