import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { assertGitScalePublisher } from '../survey/standard-triplet.service'
import {
  approveGitCognitiveProfile,
  stopGitCognitiveProfileAdmission,
} from '../assessment-authorization/cognitive-profile-approval'
import {
  assertSurveyCognitiveProfileExecutable,
  compileSurveyCognitiveProfile,
  surveyCognitiveProfileDraftSchema,
} from '../survey/cognitive-profile.definition'
import { artifactReference, type GovernedArtifact } from '../survey/governed-tool.model'
import { reconcileGitGovernedArtifact } from '../survey/governed-tool.service'
import { publishedCognitiveConfigMeasurement } from '../measurement-content/cognitive'
import { gitReleaseManifestFields, gitReleaseSelectionFields, resolveGitReleaseStates } from '../measurement-content/git-release-manifest'
import { assetReference, prepareRelease } from '../measurement-content/release'
import { getContentRelease, publishContentRelease } from '../measurement-content/repository'
import { reportTemplateSchema, validateReportTemplateBindings } from '../measurement-content/report-template'
import { DECLARATIVE_REPORT_GENERATOR, renderDeclaredReport } from '../measurement-content/report-renderer'
import { validateReferenceSetDefinition } from '../assessment-reference/reference'
import {
  ASSESSMENT_PUBLISHED_DEFINITION_REFERENCE_TYPE,
  ASSESSMENT_PUBLISHED_MEDIA_FIELD,
  retainAssessmentAssetReferences,
} from '../assessment-media/assessment-asset'
import { compileEffectiveDisclosure, resolveAudienceDisclosure } from '../scale/policy/disclosure'
import type { ScaleDataCeilingV1 } from '../scale/policy/types'
import { scaleReportVisibilitySchema } from '../scale/policy/schema'
import { getCognitiveRegistryEntry, listCognitiveRegistryEntriesForType } from './cognitive.registry'
import { validateExecutableFixtures } from './onboarding/fixtures'
import { evaluateCognitiveProductReadiness } from './library/product-readiness'
import { requireDeclaredCognitiveReport } from './profile-freeze'
import { publishCognitiveConfigRelease } from './release.service'
import type { RegistryEntry } from './cognitive.types'
import { buildCognitiveV2TaskDefinition } from './v2/registry'

export const COGNITIVE_DECLARATION_ROOT = 'server-version/backend/src/modules/cognitive/tasks'
const installedTasks = resolve(__dirname, 'tasks')
const dataCeiling:ScaleDataCeilingV1 = {
  schemaVersion:1,policyVersion:'cognitive-core-non-disclosing-v1',audiences:{},unknownAudience:'DENY',
}
const toolKey = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/)
const version = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/)
const profile = z.enum(['experience', 'standard', 'research'])
const prose = z.string().trim().min(1).max(4000)
const selectorSchema = z.object({
  ...gitReleaseSelectionFields,
  parameterVersion: version, reportVersion: version, profile,
}).strict()
const manifestSchema = z.object({
  ...gitReleaseManifestFields, toolKey,
  releases: z.array(selectorSchema).min(1).max(100),
}).strict()
const parameterSchema = z.object({
  schemaVersion: z.literal(1), toolKey, version, engineVersion: version, scoringVersion: version,
  config: z.record(z.string(), z.unknown()).refine(config => !Object.prototype.hasOwnProperty.call(config, 'report')),
  references: z.array(z.record(z.string(), z.unknown())).min(1).max(100).optional(),
}).strict()
const reportSchema = z.object({
  schemaVersion: z.literal(1), toolKey, version, parameterVersion: version,
  name: prose.max(200), instruction: prose.optional(),
  introduction: z.string().trim().max(4000).default(''),
  practicalTips: z.array(prose.max(2000)).max(30).default([]), disclaimer: prose,
  reportVisibility: scaleReportVisibilitySchema,
  template: reportTemplateSchema, assetRefs: z.array(assetReference).max(30).default([]),
}).strict()

function jsonFile(path: string) {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.size > 2_000_000) throw Error('Invalid Cognitive declaration file: ' + path)
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}
function jsonUnder(root: string, ...segments: string[]) {
  let dir = root
  for (const segment of segments.slice(0, -1)) {
    dir = join(dir, segment)
    if (!lstatSync(dir).isDirectory()) throw Error('Invalid Cognitive declaration directory: ' + dir)
  }
  return jsonFile(join(dir, segments[segments.length - 1]))
}
function verifyInstalledFixture(entry:RegistryEntry<unknown,unknown>) {
  const file=entry.engineVersion + '-' + entry.scoringVersion + '.json'
  const path=join(installedTasks,entry.testType,'fixtures',file)
  const violations=validateExecutableFixtures(entry,jsonUnder(installedTasks,entry.testType,'fixtures',file),path)
    .filter(issue=>issue.severity==='ERROR')
  if (violations.length) throw Error('Cognitive fixtures failed: ' + violations.map(issue => issue.code + ' ' + issue.fieldPath).join(', '))
}
function hasManifest(root:string,key:string){
  const dir=join(root,toolKey.parse(key))
  if(!lstatSync(dir).isDirectory())throw Error('Invalid Cognitive declaration directory: '+dir)
  const files=new Map(readdirSync(dir,{withFileTypes:true}).map(item=>[item.name,item]))
  if([...files.values()].some(file=>file.isSymbolicLink()))throw Error('Cognitive declaration files cannot be symbolic links')
  const manifest=files.get('releases.json')
  for(const axis of ['parameters','reports']){
    const folder=files.get(axis)
    if(!folder)continue
    if(!manifest||!folder.isDirectory())throw Error('Cognitive declaration axes require a real directory and releases.json')
    for(const file of readdirSync(join(dir,axis),{withFileTypes:true})){
      if(!file.isFile()||!file.name.endsWith('.json')||!version.safeParse(file.name.slice(0,-5)).success)
        throw Error('Invalid Cognitive axis file: '+file.name)
    }
  }
  if(manifest&&!manifest.isFile())throw Error('Invalid Cognitive releases.json')
  return Boolean(manifest)
}

function loadCognitiveGitTool(root: string, rawKey: string) {
  const key = toolKey.parse(rawKey)
  if (key === 'fake') throw Error('Framework test identities cannot be published')
  const manifest = manifestSchema.parse(jsonUnder(root, key, 'releases.json'))
  if (manifest.toolKey !== key) throw Error('Cognitive manifest toolKey differs from its path')
  const states = resolveGitReleaseStates(manifest.releases, {errorPrefix:'COGNITIVE_GIT'})
  const fixtures = new Set<string>()
  return manifest.releases.map(selection => {
    const {releaseKey} = selection
    const state = states.get(releaseKey)!
    const parameter = parameterSchema.parse(jsonUnder(root, key, 'parameters', selection.parameterVersion + '.json'))
    const report = reportSchema.parse(jsonUnder(root, key, 'reports', selection.reportVersion + '.json'))
    if (parameter.toolKey !== key || report.toolKey !== key
      || parameter.version !== selection.parameterVersion || report.version !== selection.reportVersion
      || report.parameterVersion !== parameter.version) throw Error('Cognitive release axes do not match: ' + selection.releaseKey)

    const entry = getCognitiveRegistryEntry(key, parameter.engineVersion, parameter.scoringVersion)
    if (!entry || !entry.profiles[selection.profile]) throw Error('Cognitive engine/scorer/profile is not installed: ' + key)
    const definition = buildCognitiveV2TaskDefinition(entry)
    const fixtureName = parameter.engineVersion + '-' + parameter.scoringVersion + '.json'
    if (!fixtures.has(fixtureName)) {
      verifyInstalledFixture(entry)
      fixtures.add(fixtureName)
    }

    // Existing operational rights retain control over access to raw trials.
    // The Git report layer is display-only and cannot add a data grant.
    const effectiveDisclosure = compileEffectiveDisclosure(dataCeiling, report.reportVisibility, undefined)
    const config = definition.configSchema.parse({
      ...parameter.config, report: {
        reportVersion: report.version,
        referenceMode: 'none',
        declaredRelease: {parameterVersion:parameter.version,title:report.name,introduction:report.introduction,
          practicalTips:report.practicalTips,disclaimer:report.disclaimer,effectiveDisclosure},
      },
    }) as Prisma.InputJsonObject
    requireDeclaredCognitiveReport(config)
    const nativeAudience=selection.allowedEntries.some(entry=>entry!=='SURVEY')
    if(nativeAudience&&!selection.allowedEntries.includes('SURVEY')&&(report.assetRefs.length||parameter.references?.length))
      throw Error('Custom Cognitive images and reference bands currently require Survey rendering')
    const readiness = evaluateCognitiveProductReadiness(definition, config)
    if (!readiness.ready) throw Error('Cognitive product readiness failed: ' + readiness.blockers.map(issue => issue.message).join(', '))
    const runtimeIdentity = {testType:key,configVersion:selection.releaseKey,
      engineVersion:parameter.engineVersion,scoringVersion:parameter.scoringVersion,config}
    const measurement = prepareRelease(publishedCognitiveConfigMeasurement(runtimeIdentity))
    if (measurement.layer !== 'MEASUREMENT') throw Error('Cognitive native measurement projection invalid')
    const metricKeys = measurement.content.metrics.map(metric => metric.metricKey)
    validateReportTemplateBindings(report.template, metricKeys, report.assetRefs.map(asset => asset.assetId))
    const references = parameter.references ? validateReferenceSetDefinition({
      schemaVersion:1,instrumentType:'cognitive',instrumentKey:key,referenceVersion:parameter.version,
      status:'ACTIVE',entries:parameter.references,
    }) : undefined
    if (references && (!references.definition || references.issues.some(issue => issue.severity === 'error')
      || references.definition.entries.some(item => item.instrumentVersion !== measurement.content.instrumentVersion
        || item.scoringVersion !== parameter.scoringVersion || !metricKeys.includes(item.scoreKey)))) {
      throw Error('Cognitive thresholds must match the assembled instrument, scorer and metrics')
    }
    for (const block of report.template.blocks) {
      if (block.type === 'REFERENCE_BAND' && !references?.definition?.entries.some(reference =>
        reference.scoreKey === block.metricKey && reference.referenceKind === block.referenceKind
        && reference.statistics.thresholds?.some(band => band.key === block.bandKey))) {
        throw Error('Cognitive report band lacks a matching parameter threshold: ' + block.bandKey)
      }
    }
    const exampleMetrics=measurement.content.metrics.map(metric=>({
      metricKey:metric.metricKey,unit:metric.unit,status:'INTERPRETABLE' as const,value:0,
    }))
    for (const audience of ['respondent','subject','teacher','researcher']) {
      const rendered=renderDeclaredReport(report.template,exampleMetrics,[],resolveAudienceDisclosure(effectiveDisclosure,audience))
      canonicalHash(rendered)
    }
    return {key,selection,state,parameter,report,config,runtimeIdentity,measurement,effectiveDisclosure,references:references?.definition,metricKeys}
  })
}

export function checkCognitiveGitRelease(root: string, rawKey: string) {
  const key=toolKey.parse(rawKey)
  if(key==='fake')throw Error('Framework test identities cannot be published')
  if(!hasManifest(root,key)){
    const entries=listCognitiveRegistryEntriesForType(key)
    if(!entries.length)throw Error('Unknown Cognitive task: '+key)
    return entries.map(entry=>{
      verifyInstalledFixture(entry)
      return {engineVersion:entry.engineVersion,scoringVersion:entry.scoringVersion,state:'REGISTERED_UNSELECTED'} as const
    })
  }
  const candidates=loadCognitiveGitTool(root,key)
  return candidates.map(({selection,state,measurement,parameter,report})=>({
    releaseKey:selection.releaseKey,version:selection.releaseKey,state:selection.state,effectiveState:state,
    allowedEntries:selection.allowedEntries,...(selection.replaces?{replaces:selection.replaces}:{}),
    engineVersion:parameter.engineVersion,scoringVersion:parameter.scoringVersion,
    parameterVersion:parameter.version,reportVersion:report.version,
    measurementHash:measurement.contentHash,
  }))
}
function manifests(root: string) {
  if(!lstatSync(root).isDirectory())throw Error('Invalid Cognitive declaration root: '+root)
  return readdirSync(root,{withFileTypes:true}).filter(item=>{
    if(item.isSymbolicLink())throw Error('Cognitive declaration folders cannot be symbolic links')
    return item.isDirectory()
  }).map(item=>item.name).sort().filter(key=>hasManifest(root,key))
}
type Candidate=ReturnType<typeof loadCognitiveGitTool>[number]

async function syncCandidate(tx:Prisma.TransactionClient,actorId:string,gitCommitSha:string,candidate:Candidate){
  const {key,selection,state,parameter,report,config,runtimeIdentity,measurement,effectiveDisclosure,references,metricKeys}=candidate
  const result = {toolKey:key,releaseKey:selection.releaseKey,version:selection.releaseKey}
  if (state==='HOLD') return {...result,action:'HOLD'}
  const selector={testType:key,configVersion:selection.releaseKey}
  const intentHash=canonicalHash({source:'SYSTEM_GIT_RELEASE',runtimeIdentity,parameter,report,profile:selection.profile,
    ...(selection.replaces?{replaces:selection.replaces}:{})})
  let stored=await tx.cognitiveTestConfig.findUnique({where:{testType_configVersion:selector}})
  const online=state==='ONLINE'
  if(!stored&&!online)return {...result,action:'ABSENT'}
  if(stored){
    const prior=await tx.assessmentManagementEvent.findFirst({where:{
      actorId,resourceId:stored.id,action:'COGNITIVE_GIT_CONFIG_PUBLISHED',
    }})
    if((prior?.metadata as {intentHash?:string}|null)?.intentHash!==intentHash
      ||canonicalHash(stored.config)!==canonicalHash(config)||stored.engineVersion!==parameter.engineVersion
      ||stored.scoringVersion!==parameter.scoringVersion||stored.name!==report.name||stored.instruction!==(report.instruction??null)) {
      throw Error('Existing Cognitive configuration is independently managed or has changed: '+key+'/'+selection.releaseKey)
    }
    if(stored.status==='RETIRED'||stored.accessPolicy!=='GRANT')return {...result,action:'MANUAL_HOLD'}
  }
  const created=!stored
  if(!stored){
    const draft=await tx.cognitiveTestConfig.create({data:{...runtimeIdentity,name:report.name,instruction:report.instruction,
      accessPolicy:'GRANT',status:'DRAFT'}})
    await publishCognitiveConfigRelease(tx,draft,{actorId,source:'SYSTEM_GIT_RELEASE'})
    stored=await tx.cognitiveTestConfig.findUniqueOrThrow({where:{id:draft.id}})
    await tx.assessmentManagementEvent.create({data:{id:randomUUID(),actorId,resourceId:stored.id,
      action:'COGNITIVE_GIT_CONFIG_PUBLISHED',metadata:{intentHash,gitCommitSha}}})
  }
  if(stored.status!=='PUBLISHED'||!stored.measurementReleaseId)throw Error('Cognitive native config was not published')
  const source=await getContentRelease(tx,stored.measurementReleaseId,true)
  if(!source||source.status!=='PUBLISHED'||source.layer!=='MEASUREMENT'||source.contentHash!==measurement.contentHash)
    throw Error('Cognitive measurement does not match published native identity')
  const pointer={releaseId:source.releaseId,contentHash:source.contentHash}
  const parameterRelease=references ? await publishContentRelease(tx,{
    layer:'REFERENCE',family:'COGNITIVE',key:source.key,version:parameter.version,scope:source.scope,
    sourceReleaseId:null,assetRefs:[],provenance:{source:'SYSTEM_GIT_RELEASE'},
    content:{projectionVersion:1,measurement:pointer,evidence:{assignmentUse:'REGISTERED_ENGINE'},
      entries:references.entries.map(definition=>({metricKey:definition.scoreKey,referenceKind:definition.referenceKind,definition}))},
  },actorId) : null
  if(parameterRelease&&(parameterRelease.layer!=='REFERENCE'||parameterRelease.status!=='PUBLISHED'))
    throw Error('Cognitive reference layer is unavailable')
  const reportRelease=await publishContentRelease(tx,{
    layer:'REPORT',family:'COGNITIVE',key:source.key,version:report.version,scope:source.scope,
    sourceReleaseId:null,assetRefs:report.assetRefs,provenance:{source:'SYSTEM_GIT_RELEASE',parameterVersion:parameter.version},
    content:{projectionVersion:1,measurements:[pointer],metricKeys,audience:'participant',
      language:'zh-CN',generatorVersion:DECLARATIVE_REPORT_GENERATOR,effectiveDisclosure,template:report.template},
  },actorId)
  if(reportRelease.status!=='PUBLISHED'||reportRelease.layer!=='REPORT')throw Error('Cognitive report layer is unavailable')
  // Bind only approved platform artwork. Private assets require the normal
  // explicit transfer workflow; repository JSON alone cannot transfer rights.
  if(report.assetRefs.length){
    const ids=report.assetRefs.map(ref=>ref.assetId)
    const platformAssets=await tx.storedAsset.findMany({where:{id:{in:ids},accessScope:'PUBLIC',deletedAt:null},select:{id:true}})
    if(platformAssets.length!==new Set(ids).size)throw Error('Cognitive report artwork must be a public stored asset')
    await retainAssessmentAssetReferences({
      db:tx, owner:{entityType:ASSESSMENT_PUBLISHED_DEFINITION_REFERENCE_TYPE,entityId:reportRelease.releaseId,field:ASSESSMENT_PUBLISHED_MEDIA_FIELD},
      references:report.assetRefs.map(ref=>({assetId:ref.assetId,mimeType:ref.mediaType,contentHash:ref.sha256})),
    })
  }
  const approved=online
    ? await approveGitCognitiveProfile(tx,actorId,stored.id,selection.profile,selection.allowedEntries,gitCommitSha)
    : await stopGitCognitiveProfileAdmission(tx,actorId,stored.id,selection.profile,gitCommitSha)
  if(approved.action==='MANUAL_HOLD')return {...result,action:approved.action}
  if(selection.allowedEntries.includes('SURVEY')||approved.hadSurvey){
    assertSurveyCognitiveProfileExecutable(approved.artifact)
    const frozen=compileSurveyCognitiveProfile(approved.artifact,source)
    const display=surveyCognitiveProfileDraftSchema.parse({schemaVersion:2,templateKey:frozen.templateKey,artifactHash:frozen.artifactHash})
    const artifact:GovernedArtifact={
      schemaVersion:1,family:'COGNITIVE',toolKey:'cognitive:'+key,version:selection.releaseKey,title:report.name,
      unit:{ref:{kind:'COGNITIVE',sourceId:stored.id,sourceVersion:selection.releaseKey},title:report.name,
        displayDefinition:display,compiledDefinition:frozen,definitionDigest:frozen.artifactHash,
        scoringDigest:frozen.measurementDigest,adapterVersion:'survey-catalog-v1',
        ...(report.instruction?{instruction:report.instruction}:{}),
        provenance:{testType:key,engineVersion:parameter.engineVersion,scoringVersion:parameter.scoringVersion,
          reportVersion:report.version,parameterVersion:parameter.version}},
      parameters:parameterRelease?{...parameterRelease,sourceMeasurementHash:source.content.measurementHash}:null,
      report:{version:report.version,template:report.template,audience:'student',effectiveDisclosure,assetRefs:report.assetRefs},
      components:[],packageReport:null,reference:artifactReference('COGNITIVE',key,{source:'SYSTEM_GIT_RELEASE',intentHash}),
    }
    await reconcileGitGovernedArtifact(tx,actorId,artifact,{
      gitCommitSha,allowedProducts:['SURVEY'],online:online&&selection.allowedEntries.includes('SURVEY'),measurement:pointer,
    })
  }
  return {...result,action:created?'PUBLISHED':approved.action}
}

export async function syncCognitiveGitReleases(root:string,tx:Prisma.TransactionClient,actorId:string,gitCommitSha:string) {
  await assertGitScalePublisher(tx,actorId)
  if (!/^[0-9a-f]{40}$/.test(gitCommitSha)) throw Error('Invalid Cognitive release Git commit')
  const plan=manifests(root).flatMap(key=>loadCognitiveGitTool(root,key))
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cognitive-git-release-sync'))`
  const result=[]
  for(const candidate of plan)result.push(await syncCandidate(tx,actorId,gitCommitSha,candidate))
  return result
}
