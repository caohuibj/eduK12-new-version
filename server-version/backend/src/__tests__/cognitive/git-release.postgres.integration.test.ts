import { rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { scaffoldPackage } from '../../modules/assessment-bundle/onboarding/template'
import { assertGitBundleDependencies } from '../../modules/bundle-product/git-release-dependencies'
import { syncCognitiveGitReleases } from '../../modules/cognitive/git-release'
import { ensureGitScalePublisher } from '../../modules/scale/onboarding/git-release-actor'
import { cognitiveDeclarationFixture } from './git-release.fixture'
import { buildCognitiveSingleTaskReport } from '../../modules/cognitive/single-task-report'
import { readApprovedCognitiveProfileArtifact } from '../../modules/assessment-authorization/cognitive-profile-approved-source'

const enabled=process.env.COGNITIVE_GIT_RELEASE_ISOLATED_TEST==='1'
function isolatedUrl(){
  const raw=process.env.COGNITIVE_GIT_RELEASE_TEST_DB_URL
  if(!raw)throw Error('An isolated Cognitive Git test DSN is required')
  const url=new URL(raw)
  if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/eduk12_cognitive_git_test'
    ||url.toString()!==new URL(process.env.DATABASE_URL??'postgresql://unconfigured.invalid/unconfigured').toString()) {
    throw Error('Cognitive Git test must target the migrated isolated loopback database')
  }
  return raw
}
describe.runIf(enabled)('Cognitive Git release lifecycle',()=>{
  const db=enabled?new PrismaClient({datasourceUrl:isolatedUrl()}):null
  afterAll(async()=>{await db?.$disconnect()})
  it('publishes both product and governed rows, preserves C for a report-only revision and rolls back Git admission',async()=>{
    const actor=await ensureGitScalePublisher(db!)
    const fixture=cognitiveDeclarationFixture('cog-'+randomUUID().slice(0,8))
    const sync=(gitCommit:string)=>db!.$transaction(tx=>syncCognitiveGitReleases(fixture.root,tx,actor,gitCommit),{timeout:45000})
    try {
      await expect(sync('a'.repeat(40))).resolves.toEqual([
        expect.objectContaining({action:'PUBLISHED'}),expect.objectContaining({action:'ABSENT'}),
      ])
      await expect(sync('a'.repeat(40))).resolves.toEqual([
        expect.objectContaining({action:'UNCHANGED'}),expect.objectContaining({action:'ABSENT'}),
      ])
      const old=await db!.cognitiveTestConfig.findUniqueOrThrow({where:{testType_configVersion:{
        testType:'gonogo',configVersion:fixture.version('release1'),
      }}})
      const bundle = scaffoldPackage('cognitive_git_dependency_fixture')
      const slot = bundle.manifest.definition.slots[0]
      bundle.manifest.definition.slots[0] = {
        ...slot, unitType: 'COGNITIVE', instrumentKey: old.testType, instrumentVersion: old.configVersion,
      }
      bundle.manifest.cognitiveDependencies = [{
        slotKey: slot.slotKey, configVersion: old.configVersion, engineVersion: old.engineVersion,
        scoringVersion: old.scoringVersion, profile: 'standard',
      }]
      const verifyBundle = () => db!.$transaction(tx => assertGitBundleDependencies(tx, bundle))
      await expect(verifyBundle()).resolves.toBeUndefined()
      const receipt=await db!.assessmentManagementEvent.findFirstOrThrow({where:{resourceId:old.id,action:'COGNITIVE_PROFILE_APPROVED'}})
      const hash=(receipt.metadata as {artifactHash:string}).artifactHash
      const source=await db!.$transaction(tx=>readApprovedCognitiveProfileArtifact(tx,old.id,'standard',hash,'TRAINING'))
      const report=buildCognitiveSingleTaskReport({testType:'gonogo',configVersion:old.configVersion,
        engineVersion:old.engineVersion,scoringVersion:old.scoringVersion,frozenReport:source.artifact.resolvedReport,
        profile:'standard',score:1,metrics:{hitRate:1},qualityFlags:{interpretable:true},reference:null})
      expect(report).toMatchObject({title:fixture.report.name,interpretationSummary:null})
      expect(source.artifact.resolvedReport.participantPresentation?.declaredRelease?.effectiveDisclosure).toMatchObject({
        audiences:{respondent:{numericScores:true,rawAnswers:false}},
      })

      fixture.releases[0].state='WITHDRAWN'
      fixture.releases[1].state='ONLINE'
      fixture.write()
      await sync('b'.repeat(40))
      const latest=await db!.cognitiveTestConfig.findUniqueOrThrow({where:{testType_configVersion:{
        testType:'gonogo',configVersion:fixture.version('release2'),
      }}})
      expect(latest.measurementReleaseId).toBe(old.measurementReleaseId)
      await expect(db!.$transaction(tx=>readApprovedCognitiveProfileArtifact(tx,old.id,'standard',hash,'TRAINING')))
        .rejects.toThrow()
      await expect(verifyBundle()).rejects.toThrow('BUNDLE_GIT_COGNITIVE_NOT_ONLINE')
      const governed=await db!.$queryRaw<Array<{state:string;tool_version:string}>>`SELECT state,tool_version FROM survey_governed_tools
        WHERE family='COGNITIVE' AND tool_key='cognitive:gonogo'
        AND tool_version IN (${old.configVersion},${latest.configVersion}) ORDER BY tool_version`
      expect(governed).toEqual([
        {state:'WITHDRAWN',tool_version:old.configVersion},{state:'ONLINE',tool_version:latest.configVersion},
      ])

      fixture.releases[0].state='ONLINE'
      fixture.releases[1].state='WITHDRAWN'
      fixture.write()
      await sync('c'.repeat(40))
      const restored=await db!.$transaction(tx=>readApprovedCognitiveProfileArtifact(tx,old.id,'standard',hash,'TRAINING'))
      expect(restored.artifact).toEqual(source.artifact)
      await expect(verifyBundle()).resolves.toBeUndefined()
    } finally {rmSync(fixture.root,{recursive:true,force:true})}
  },60000)
})
